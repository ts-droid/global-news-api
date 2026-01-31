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
const FALLBACK_SUMMARIZE_INSTRUCTIONS = `You are a professional news editor. Your task is to:
1. Create a concise headline (keep the original language)
2. Summarize the content in 2-3 paragraphs (100-150 words total, keep original language)
3. Maintain an objective, journalistic tone
4. Extract ALL specific details: names, places, numbers, dates
5. CATEGORIZE the article into ONE of these categories based on content:
   - world: International news, geopolitics, diplomacy
   - politics: Politics, elections, government, laws
   - sports: Sports, athletics, competitions, matches
   - tech: Technology, IT, AI, smartphones, internet
   - business: Economy, finance, companies, stock market
   - science: Science, research, medicine, space
   - climate: Climate, environment, weather, natural disasters
   - culture: Culture, music, film, art, entertainment
6. DETERMINE if this is a "Breaking News" event (extremely urgent, major impact, war/disaster/major political decisions).

IMPORTANT:
- NEVER write vague phrases like "a player", "two nations", "several countries" if you have the names
- ALWAYS include specific names and numbers from the text
- If the article lacks details, write briefly what is known
- Choose the MOST fitting category based on the article's main topic

ALWAYS respond in this JSON format (nothing else):
{
  "title": "Headline in original language",
  "summary": "Summary in original language in 2-3 paragraphs",
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
    const systemPrompt = `You are a professional translator. Translate the following news headline and summary to ${langName}.

IMPORTANT:
- Translate to natural, fluent ${langName}
- Keep all proper nouns, names, and numbers
- Maintain the journalistic tone
- Keep the same structure and length

ALWAYS respond in this JSON format (nothing else):
{
  "title": "Translated headline in ${langName}",
  "summary": "Translated summary in ${langName}"
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

module.exports = {
  summarizeAndCategorize,
  translateArticle,
  translateAndSummarize, // Legacy
  explainTopic,
};
