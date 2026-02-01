const OpenAI = require("openai");
const { apiConfig } = require("./config/apiConfig");

const openai = new OpenAI({
  baseURL: apiConfig.deepseek.baseUrl,
  apiKey: apiConfig.deepseek.apiKey || "no-key",
});

const { db } = require("./db");
const { aiPrompts } = require("./db/schema");
const { eq, inArray } = require("drizzle-orm");

// Valid categories for classification
const VALID_CATEGORIES = ['world', 'politics', 'sports', 'tech', 'business', 'science', 'local', 'culture'];

// STEP 1: Summarize and categorize (keep original language)
const FALLBACK_SUMMARIZE_INSTRUCTIONS = `You are a professional news journalist writing a comprehensive news summary. Your task is to:
1. Create a concise, informative headline (keep the original language)
2. Write a DETAILED summary of WHAT HAPPENED - NOT a description of the article
3. Maintain an objective, journalistic tone
4. Extract ALL specific details: names, places, numbers, dates
5. CATEGORIZE the article into ONE of these categories:
   - world: International news, geopolitics, diplomacy
   - politics: Politics, elections, government, laws
   - sports: Sports, athletics, competitions, matches
   - tech: Technology, IT, AI, smartphones, internet
   - business: Economy, finance, companies, stock market
   - science: Science, research, medicine, space
   - local: Local/regional news, community events, Swedish news
   - culture: Culture, music, film, art, entertainment
6. DETERMINE if this is "Breaking News" (extremely urgent, major impact).

CRITICAL RULES FOR SUMMARY LENGTH AND STRUCTURE:
- MINIMUM 100 words, TARGET 150 words - this is MANDATORY
- Split into 2-3 distinct paragraphs
- First paragraph: The main news (who, what, when, where)
- Second paragraph: Context, background, or additional details
- Third paragraph (if applicable): Implications, reactions, or future outlook

CRITICAL RULES FOR CONTENT:
- Write WHAT HAPPENED, not "this article discusses..." or "the article explains..."
- WRONG: "The article provides advice on how to avoid airline fees..."
- CORRECT: "EasyJet has been criticized for high additional fees. Travelers can avoid extra costs by checking in online and bringing only cabin luggage."
- WRONG: "This piece explores the implications of..."
- CORRECT: "The new policy will affect 2 million people by requiring all citizens to register by December 2024. The government estimates implementation costs of €50 million."
- ALWAYS use active voice and report the actual news
- Include ALL specific names, numbers, and facts from the article
- If the original content is short, expand with relevant context

EXAMPLE OF GOOD SUMMARY (138 words):
"Swedish Prime Minister Ulf Kristersson announced new climate measures at today's press conference in Stockholm. The government will invest 5 billion SEK in green technology over the next three years.

The investment package includes subsidies for electric vehicle purchases, funding for solar panel installations, and support for industrial decarbonization projects. The measures are expected to reduce Sweden's carbon emissions by 15% by 2030.

Environmental organizations have praised the initiative, though some critics argue the measures don't go far enough. Opposition leader Magdalena Andersson called for even greater investments in public transportation. The proposals will be debated in Parliament next month, with a vote expected before the summer recess."

ALWAYS respond in this JSON format (nothing else):
{
  "title": "Headline in original language",
  "summary": "Detailed 100-150 word summary in 2-3 paragraphs with actual news content",
  "category": "one of: world, politics, sports, tech, business, science, local, culture",
  "isBreaking": true/false
}`;

/**
 * Get category-specific prompt additions from DB
 */
async function getCategoryAdditions(category) {
  const normalizedCategory = (category || "default").toLowerCase();

  try {
    const prompts = await db
      .select()
      .from(aiPrompts)
      .where(inArray(aiPrompts.category, ["base", normalizedCategory]));

    const categoryPromptObj = prompts.find(p => p.category === normalizedCategory);

    if (categoryPromptObj && categoryPromptObj.isActive) {
      return categoryPromptObj.prompt;
    }

    // Fallback category-specific additions
    const fallbackAdditions = {
      world: `For world news: Name the countries, cities, and key people involved.`,
      politics: `For political news: Name politicians, parties, and specific decisions.`,
      sports: `For sports news: Include exact scores and names of teams/players.`,
      tech: `For tech news: Explain the technology simply, name products and companies.`,
      business: `For business news: Include numbers (amounts, percentages) and company names.`,
      science: `For science news: Explain the discovery simply, name institutions.`,
      local: `For local/regional news: Name the specific location, local authorities, and community impact.`,
      culture: `For culture news: Name artists, works, and events.`,
      default: `Include specific names, places, and dates. Be concrete.`,
    };

    if (normalizedCategory.includes("sport")) return fallbackAdditions.sports;
    if (normalizedCategory.includes("tech")) return fallbackAdditions.tech;
    if (normalizedCategory.includes("business") || normalizedCategory.includes("econom")) return fallbackAdditions.business;
    if (normalizedCategory.includes("science")) return fallbackAdditions.science;
    if (normalizedCategory.includes("local") || normalizedCategory.includes("swedish") || normalizedCategory.includes("lokalt")) return fallbackAdditions.local;
    if (normalizedCategory.includes("culture") || normalizedCategory.includes("entertainment")) return fallbackAdditions.culture;
    if (normalizedCategory.includes("politic")) return fallbackAdditions.politics;
    if (normalizedCategory.includes("world") || normalizedCategory.includes("top")) return fallbackAdditions.world;

    return fallbackAdditions.default;
  } catch (err) {
    console.error("Error fetching prompt from DB:", err);
    return "Include specific names, places, and dates. Be concrete.";
  }
}

/**
 * STEP 1: Summarize and categorize article (keeps original language)
 * Called by backgroundWorker when new articles arrive
 */
async function summarizeAndCategorize(title, content, sourceCategory) {
  if (!apiConfig.deepseek.apiKey || apiConfig.deepseek.apiKey === "no-key") {
    console.warn("⚠️ AI API Key not configured - skipping summarization");
    return { title, summary: content.substring(0, 300), category: sourceCategory, isBreaking: false };
  }

  try {
    const categoryAddition = await getCategoryAdditions(sourceCategory);
    const systemPrompt = `${FALLBACK_SUMMARIZE_INSTRUCTIONS}\n\n${categoryAddition}`;

    const response = await openai.chat.completions.create({
      model: apiConfig.deepseek.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Title: ${title}\n\nContent: ${content}`,
        },
      ],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);

    // Validate category - use AI suggestion if valid, otherwise keep source category
    let finalCategory = sourceCategory;
    if (parsed.category && VALID_CATEGORIES.includes(parsed.category.toLowerCase())) {
      finalCategory = parsed.category.toLowerCase();
    }

    return {
      title: parsed.title || title,
      summary: parsed.summary || content.substring(0, 300),
      category: finalCategory,
      isBreaking: parsed.isBreaking || false
    };
  } catch (error) {
    console.error("❌ AI Summarization Error:", error.message);
    return { title, summary: content.substring(0, 300), category: sourceCategory, isBreaking: false };
  }
}

/**
 * STEP 2: Translate article to target language
 * Called when iOS app requests articles with a specific language
 */
async function translateArticle(title, summary, targetLanguage = 'sv') {
  if (!apiConfig.deepseek.apiKey || apiConfig.deepseek.apiKey === "no-key") {
    console.warn("⚠️ AI API Key not configured - skipping translation");
    return { title, summary };
  }

  // Map language codes to full names
  const languageNames = {
    'sv': 'Swedish',
    'en': 'English',
    'de': 'German',
    'fr': 'French',
    'es': 'Spanish',
    'no': 'Norwegian',
    'da': 'Danish',
    'fi': 'Finnish'
  };

  const langName = languageNames[targetLanguage] || 'Swedish';

  try {
    const systemPrompt = `You are a professional news translator. Translate the following news headline and summary to ${langName}.

CRITICAL RULES:
1. Translate to natural, fluent ${langName}
2. Keep all proper nouns, names, and numbers
3. Maintain the journalistic tone
4. If the summary describes the article instead of reporting news (e.g., "The article discusses...", "This piece explores..."), REWRITE it as direct news reporting
5. The summary should tell WHAT HAPPENED, not describe what the article is about

BAD (meta-description): "Artikeln ger råd om hur man undviker avgifter..."
GOOD (direct news): "Resenärer kan undvika extra avgifter genom att..."

ALWAYS respond in this JSON format (nothing else):
{
  "title": "Translated headline in ${langName}",
  "summary": "Translated summary as direct news reporting in ${langName}"
}`;

    const response = await openai.chat.completions.create({
      model: apiConfig.deepseek.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Title: ${title}\n\nSummary: ${summary}`,
        },
      ],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);

    return {
      title: parsed.title || title,
      summary: parsed.summary || summary
    };
  } catch (error) {
    console.error("❌ AI Translation Error:", error.message);
    return { title, summary };
  }
}

/**
 * Legacy function - now calls summarizeAndCategorize
 * Kept for backwards compatibility
 */
async function translateAndSummarize(title, content, category) {
  return summarizeAndCategorize(title, content, category);
}

// Valid ISO 3166-1 alpha-2 country codes for validation
const VALID_COUNTRY_CODES = new Set([
  'SE', 'NO', 'DK', 'FI', 'IS', // Nordic
  'GB', 'IE', 'DE', 'FR', 'ES', 'IT', 'PT', 'NL', 'BE', 'AT', 'CH', 'PL', 'CZ', 'HU', 'RO', 'BG', 'GR', 'UA', 'RU', // Europe
  'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'VE', // Americas
  'CN', 'JP', 'KR', 'IN', 'ID', 'TH', 'VN', 'PH', 'MY', 'SG', 'TW', 'HK', 'PK', 'BD', 'NP', 'LK', // Asia
  'AU', 'NZ', // Oceania
  'ZA', 'EG', 'NG', 'KE', 'ET', 'GH', 'TZ', 'MA', 'DZ', 'TN', // Africa
  'IL', 'SA', 'AE', 'IR', 'IQ', 'TR', 'SY', 'JO', 'LB', 'QA', 'KW', 'OM', 'YE', 'AF', // Middle East
]);

/**
 * Extract named entities from article title and summary
 * Returns: { people: [], places: [], organizations: [], topics: [] }
 * Place tags include ISO country codes for filtering
 */
async function extractEntities(title, summary, category = 'general') {
  if (!apiConfig.deepseek.apiKey || apiConfig.deepseek.apiKey === "no-key") {
    console.warn("⚠️ AI API Key not configured - skipping entity extraction");
    return { people: [], places: [], organizations: [], topics: [] };
  }

  // Get category-specific extraction hints
  const categoryHints = {
    sports: `Focus on: players, teams, coaches, tournaments, venues, leagues.`,
    politics: `Focus on: politicians, parties, government officials, political organizations, countries involved.`,
    business: `Focus on: companies, CEOs, investors, stock exchanges, industries.`,
    tech: `Focus on: tech companies, founders, products, technologies, research institutions.`,
    science: `Focus on: researchers, universities, research institutions, scientific concepts.`,
    local: `Focus on: local authorities, community leaders, affected neighborhoods, regional organizations.`,
    culture: `Focus on: artists, performers, directors, venues, awards, cultural institutions.`,
    world: `Focus on: countries, leaders, international organizations, cities involved.`,
    default: `Focus on: key people, locations, organizations, and main topics.`
  };

  const hint = categoryHints[category?.toLowerCase()] || categoryHints.default;

  try {
    const systemPrompt = `You are a news analyst extracting named entities from articles.

Extract 6-10 of the MOST IMPORTANT entities from this news article.

${hint}

CRITICAL RULES FOR PLACES:
- For EVERY place (city, country, region), include the ISO 3166-1 alpha-2 country code in parentheses
- Format: "Place Name (CC)" where CC is the 2-letter country code
- Examples: "London (GB)", "New Delhi (IN)", "Washington D.C. (US)", "Beijing (CN)", "Stockholm (SE)"
- For countries, use: "United Kingdom (GB)", "United States (US)", "India (IN)", etc.
- If a place spans multiple countries, list the primary country

RULES:
- Only include entities that are ACTUALLY mentioned or clearly implied
- Use full names for people when available
- Include only the most relevant 6-10 entities total
- Topics should be general themes, not specific events

Return ONLY valid JSON in this exact format:
{
  "people": ["Full Name 1", "Full Name 2"],
  "places": ["City (CC)", "Country (CC)"],
  "organizations": ["Org 1", "Org 2"],
  "topics": ["topic1", "topic2"]
}`;

    const response = await openai.chat.completions.create({
      model: apiConfig.deepseek.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Title: ${title}\n\nSummary: ${summary}` }
      ],
      max_tokens: 400,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);

    // Validate and normalize the response
    const result = {
      people: Array.isArray(parsed.people) ? parsed.people.slice(0, 5) : [],
      places: Array.isArray(parsed.places) ? parsed.places.slice(0, 5) : [],
      organizations: Array.isArray(parsed.organizations) ? parsed.organizations.slice(0, 3) : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : [],
    };

    // Extract and validate country codes from places
    result.countryCodes = [];
    result.places = result.places.map(place => {
      // Extract country code from format "Place Name (CC)"
      const match = place.match(/\(([A-Z]{2})\)$/);
      if (match && VALID_COUNTRY_CODES.has(match[1])) {
        result.countryCodes.push(match[1]);
      }
      return place;
    });

    // Dedupe country codes
    result.countryCodes = [...new Set(result.countryCodes)];

    console.log(`🏷️ Extracted entities: ${result.people.length} people, ${result.places.length} places, ${result.organizations.length} orgs, ${result.topics.length} topics, ${result.countryCodes.length} countries`);

    return result;
  } catch (error) {
    console.error("❌ Entity extraction error:", error.message);
    return { people: [], places: [], organizations: [], topics: [], countryCodes: [] };
  }
}

/**
 * Explain background of a topic
 */
async function explainTopic(title, summary, category) {
  if (!apiConfig.deepseek.apiKey)
    return "AI support not configured.";

  try {
    const response = await openai.chat.completions.create({
      model: apiConfig.deepseek.model,
      messages: [
        {
          role: "system",
          content: `You are a journalist explaining background to news. Write 3-4 short sentences.`,
        },
        {
          role: "user",
          content: `Explain the background: ${title} - ${summary} (${category})`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    return response.choices[0].message.content || "Could not fetch explanation.";
  } catch (error) {
    return "Explanation not available right now.";
  }
}

/**
 * Match article against existing events to find duplicates/updates
 * Returns: { matchType: 'new' | 'update' | 'duplicate', eventId?: string, confidence: number }
 */
async function matchArticleToEvent(articleTitle, articleSummary, existingEvents) {
  if (!apiConfig.deepseek.apiKey || existingEvents.length === 0) {
    return { matchType: 'new', confidence: 1.0 };
  }

  try {
    // Format existing events for comparison
    const eventsContext = existingEvents.map((e, i) =>
      `[Event ${i + 1}] ID: ${e.id}\nTitle: ${e.title}\nSummary: ${e.summary?.substring(0, 200)}...`
    ).join('\n\n');

    const systemPrompt = `You are a news editor. Compare the NEW ARTICLE against EXISTING EVENTS and determine if they are about the same story.

EXISTING EVENTS (from last 48 hours):
${eventsContext}

Analyze the NEW ARTICLE and determine if it belongs to an existing event.

CRITICAL: BE AGGRESSIVE IN MATCHING! Most news articles about the same topic within 48 hours ARE related.

MATCHING RULES - MATCH if ANY of these apply:
1. SAME SUBJECT: Same person, company, team, country, or organization is the main focus
2. SAME INCIDENT: Same attack, accident, disaster, match, election, meeting, or announcement
3. SAME TIMEFRAME: Articles about the same ongoing situation within 48 hours
4. SPORTS: ALL articles about the same match/game/tournament ARE the same event
   - "Team A wins" and "Team B loses" = SAME EVENT (match them!)
   - "Player X shines" and "Match recap" = SAME EVENT
5. POLITICS: Same policy, decision, election, or political figure's actions = same event
6. DISASTERS/ATTACKS: Same incident even if different aspects (casualties, response, investigation)
7. BUSINESS: Same company announcement, merger, or financial news = same event

Examples of SAME EVENT:
- "Russia attacks Ukraine power grid" + "12 killed in Ukraine attack" = SAME (match as update)
- "Trump wins election" + "Democrats react to Trump victory" = SAME (match as update)
- "Apple announces iPhone" + "New iPhone features revealed" = SAME (match as update)

Respond in JSON format:
{
  "matchType": "new" | "update" | "duplicate",
  "matchedEventId": "event UUID if matched, null if new",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

- "new": ONLY if genuinely different story/topic (not just different angle)
- "update": Same story with different perspective, new details, or different source (MOST COMMON)
- "duplicate": Nearly identical content with no new information`;

    const response = await openai.chat.completions.create({
      model: apiConfig.deepseek.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `NEW ARTICLE:\nTitle: ${articleTitle}\nSummary: ${articleSummary}` }
      ],
      max_tokens: 300,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      matchType: result.matchType || 'new',
      eventId: result.matchedEventId || null,
      confidence: result.confidence || 0.5,
      reason: result.reason || ''
    };
  } catch (error) {
    console.error("❌ Event matching error:", error.message);
    return { matchType: 'new', confidence: 0.5 };
  }
}

/**
 * Merge new article information into existing event summary
 */
async function updateEventSummary(existingTitle, existingSummary, newArticleTitle, newArticleSummary) {
  if (!apiConfig.deepseek.apiKey) {
    return { title: existingTitle, summary: existingSummary };
  }

  try {
    const systemPrompt = `You are a news editor. Update an existing news event summary with new information from a new article.

RULES:
1. Keep the summary concise (150-200 words max)
2. Add only NEW information not already in the existing summary
3. Update any outdated facts (e.g., death tolls, dates)
4. Maintain chronological flow
5. Keep the same language as the original

Respond in JSON:
{
  "title": "Updated headline reflecting latest developments",
  "summary": "Updated summary incorporating new information"
}`;

    const response = await openai.chat.completions.create({
      model: apiConfig.deepseek.model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `EXISTING EVENT:\nTitle: ${existingTitle}\nSummary: ${existingSummary}\n\nNEW ARTICLE:\nTitle: ${newArticleTitle}\nSummary: ${newArticleSummary}`
        }
      ],
      max_tokens: 500,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      title: result.title || existingTitle,
      summary: result.summary || existingSummary
    };
  } catch (error) {
    console.error("❌ Event update error:", error.message);
    return { title: existingTitle, summary: existingSummary };
  }
}

module.exports = {
  summarizeAndCategorize,
  translateArticle,
  translateAndSummarize, // Legacy
  extractEntities,
  explainTopic,
  matchArticleToEvent,
  updateEventSummary,
  VALID_COUNTRY_CODES,
};
