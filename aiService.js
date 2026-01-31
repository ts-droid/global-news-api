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
const VALID_CATEGORIES = ['world', 'politics', 'sports', 'tech', 'business', 'science', 'climate', 'culture'];

// STEP 1: Summarize and categorize (keep original language)
const FALLBACK_SUMMARIZE_INSTRUCTIONS = `You are a professional news journalist writing a news summary. Your task is to:
1. Create a concise, informative headline (keep the original language)
2. Write a DIRECT summary of WHAT HAPPENED - NOT a description of the article
3. Maintain an objective, journalistic tone
4. Extract ALL specific details: names, places, numbers, dates
5. CATEGORIZE the article into ONE of these categories:
   - world: International news, geopolitics, diplomacy
   - politics: Politics, elections, government, laws
   - sports: Sports, athletics, competitions, matches
   - tech: Technology, IT, AI, smartphones, internet
   - business: Economy, finance, companies, stock market
   - science: Science, research, medicine, space
   - climate: Climate, environment, weather, natural disasters
   - culture: Culture, music, film, art, entertainment
6. DETERMINE if this is "Breaking News" (extremely urgent, major impact).

CRITICAL RULES FOR SUMMARY:
- Write WHAT HAPPENED, not "this article discusses..." or "the article explains..."
- WRONG: "The article provides advice on how to avoid airline fees..."
- CORRECT: "EasyJet has been criticized for high additional fees. Travelers can avoid extra costs by..."
- WRONG: "This piece explores the implications of..."
- CORRECT: "The new policy will affect 2 million people by requiring..."
- ALWAYS use active voice and report the actual news
- Include ALL specific names, numbers, and facts from the article
- 100-150 words total in 2-3 paragraphs

ALWAYS respond in this JSON format (nothing else):
{
  "title": "Headline in original language",
  "summary": "Direct summary of what happened, NOT a description of the article",
  "category": "one of: world, politics, sports, tech, business, science, climate, culture",
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
      climate: `For climate news: Include temperature/emission figures, name agreements.`,
      culture: `For culture news: Name artists, works, and events.`,
      default: `Include specific names, places, and dates. Be concrete.`,
    };

    if (normalizedCategory.includes("sport")) return fallbackAdditions.sports;
    if (normalizedCategory.includes("tech")) return fallbackAdditions.tech;
    if (normalizedCategory.includes("business") || normalizedCategory.includes("econom")) return fallbackAdditions.business;
    if (normalizedCategory.includes("science")) return fallbackAdditions.science;
    if (normalizedCategory.includes("climate") || normalizedCategory.includes("environment")) return fallbackAdditions.climate;
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

IMPORTANT MATCHING RULES:
1. SPORTS: Articles about the SAME match/game/tournament final ARE the same event, even if they focus on different players (e.g., "Rybakina wins Australian Open" and "Sabalenka loses final" are SAME EVENT)
2. POLITICS: Articles about the same political decision/meeting/vote are the same event
3. DISASTERS: Articles about the same disaster (earthquake, flood, accident) are the same event
4. FOCUS ON: same time period + same main subject = likely same event

Respond in JSON format:
{
  "matchType": "new" | "update" | "duplicate",
  "matchedEventId": "event UUID if matched, null if new",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

- "new": Completely different story, create new event
- "update": Same event/story but from different angle or with new details
- "duplicate": Exact same information, no new details`;

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
  explainTopic,
  matchArticleToEvent,
  updateEventSummary,
};
