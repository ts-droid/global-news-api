const OpenAI = require("openai");
const { db } = require("./db");
const { aiStyleOverlays } = require("./db/schema");
const { eq, and } = require("drizzle-orm");

// Support multiple API key naming conventions
// Priority: AI_INTEGRATION_DEEPSEEK_API_KEY > DEEPSEEK_API_KEY > AI_INTEGRATIONS_OPENROUTER_API_KEY
const deepseekKey = process.env.AI_INTEGRATION_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
const openrouterKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
const useDeepSeekDirect = !!deepseekKey;

const aiClient = new OpenAI({
  baseURL: useDeepSeekDirect
    ? "https://api.deepseek.com"
    : (process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"),
  apiKey: useDeepSeekDirect ? deepseekKey : openrouterKey,
});

// Model name differs between OpenRouter and DeepSeek direct
const AI_MODEL = useDeepSeekDirect ? "deepseek-chat" : "deepseek/deepseek-chat";

console.log(`AI Service configured: ${useDeepSeekDirect ? 'DeepSeek Direct' : 'OpenRouter'}, Model: ${AI_MODEL}`);

// Cache for style overlays (refresh every 5 minutes)
let styleOverlayCache = {};
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const BASE_INSTRUCTIONS = `Du är en professionell nyhetsjournalist som skriver på svenska. Din uppgift är att:
1. Översätta nyhetsartiklar till flytande, naturlig svenska
2. Sammanfatta innehållet i 2-3 koncisa stycken (100-150 ord totalt)
3. Behålla en objektiv, journalistisk ton
4. Extrahera ALLA specifika detaljer: namn, platser, siffror, datum
5. Om innehållet är begränsat/betalvägg: skriv en kort notis baserad på rubriken

VIKTIGT: 
- Skriv ALDRIG vaga fraser som "en spelare", "två nationer", "flera länder" om du har namnen
- Inkludera ALLTID specifika namn och siffror som finns i texten
- Om artikeln saknar detaljer, skriv kortfattat vad som är känt

Svara ALLTID i följande JSON-format (inget annat):
{
  "title": "Översatt rubrik på svenska",
  "summary": "Sammanfattning på svenska i 2-3 stycken"
}`;

// Fallback category prompts (used if database is unavailable)
const FALLBACK_PROMPTS = {
  world: `VIKTIGT för världsnyheter: Namnge länderna, städerna och nyckelpersonerna.`,
  politics: `VIKTIGT för politiska nyheter: Namnge politiker, partier och specifika beslut.`,
  sports: `VIKTIGT för sportnyheter: Inkludera exakta resultat och namn på lag/spelare.`,
  tech: `VIKTIGT för tekniknyheter: Förklara tekniken enkelt, nämn produkter och företag.`,
  business: `VIKTIGT för ekonominyheter: Inkludera siffror (belopp, procent) och företagsnamn.`,
  science: `VIKTIGT för vetenskapsnyheter: Förklara upptäckten enkelt, nämn institutioner.`,
  climate: `VIKTIGT för klimatnyheter: Ange siffror för temperatur/utsläpp, nämn avtal.`,
  culture: `VIKTIGT för kulturnyheter: Namnge artister, verk och evenemang.`,
  local: `VIKTIGT för lokala nyheter: Namnge platser, personer och institutioner.`,
  default: `Inkludera specifika namn, platser och datum. Var konkret.`,
};

/**
 * Get style overlay from database (with caching)
 */
async function getStyleOverlay(categoryCode, language = 'sv') {
  const cacheKey = `${categoryCode}_${language}`;

  // Check cache
  if (Date.now() - cacheTimestamp < CACHE_TTL && styleOverlayCache[cacheKey]) {
    return styleOverlayCache[cacheKey];
  }

  try {
    // Fetch from database
    const [overlay] = await db.select()
      .from(aiStyleOverlays)
      .where(
        and(
          eq(aiStyleOverlays.categoryCode, categoryCode),
          eq(aiStyleOverlays.language, language),
          eq(aiStyleOverlays.isActive, true)
        )
      )
      .limit(1);

    if (overlay) {
      // Update cache
      styleOverlayCache[cacheKey] = overlay.stylePrompt;
      cacheTimestamp = Date.now();
      return overlay.stylePrompt;
    }
  } catch (err) {
    console.warn(`Failed to fetch style overlay for ${categoryCode}/${language}:`, err.message);
  }

  return null;
}

/**
 * Normalize category to match database codes
 */
function normalizeCategory(category) {
  const normalized = (category || "default").toLowerCase();

  if (normalized.includes("sport")) return "sports";
  if (normalized.includes("tech")) return "tech";
  if (normalized.includes("business") || normalized.includes("econom")) return "business";
  if (normalized.includes("science")) return "science";
  if (normalized.includes("climate") || normalized.includes("environment")) return "science";
  if (normalized.includes("culture") || normalized.includes("entertainment")) return "culture";
  if (normalized.includes("politic")) return "politics";
  if (normalized.includes("world") || normalized.includes("top")) return "world";
  if (normalized.includes("local")) return "local";

  return normalized;
}

/**
 * Get the full prompt for a category (base + style overlay)
 */
async function getCategoryPrompt(category, language = 'sv') {
  const normalizedCategory = normalizeCategory(category);

  // Try to get style overlay from database
  let styleOverlay = await getStyleOverlay(normalizedCategory, language);

  // Fall back to hardcoded prompts if database unavailable
  if (!styleOverlay) {
    styleOverlay = FALLBACK_PROMPTS[normalizedCategory] || FALLBACK_PROMPTS.default;
  }

  return `${BASE_INSTRUCTIONS}\n\nSTYLE OVERLAY:\n${styleOverlay}`;
}

async function translateAndSummarize(title, content, category, language = 'sv') {
  const hasApiKey = deepseekKey || openrouterKey;

  if (!hasApiKey) {
    console.warn("No AI API key configured (AI_INTEGRATION_DEEPSEEK_API_KEY, DEEPSEEK_API_KEY, or AI_INTEGRATIONS_OPENROUTER_API_KEY), skipping translation");
    return { title, summary: content.substring(0, 300) };
  }

  try {
    // Get category-specific prompt (now async, fetches from DB)
    const systemPrompt = await getCategoryPrompt(category, language);

    const response = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Rubrik: ${title}\n\nInnehåll: ${content}`,
        },
      ],
      max_tokens: 600,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return {
      title: parsed.title || title,
      summary: parsed.summary || content.substring(0, 300),
    };
  } catch (error) {
    console.error("AI Translation Error:", error);
    return { title, summary: content.substring(0, 300) };
  }
}

async function explainTopic(title, summary, category) {
  const hasApiKey = deepseekKey || openrouterKey;

  if (!hasApiKey)
    return "Inget AI-stöd konfigurerat.";

  try {
    const response = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `Du är en journalist som förklarar bakgrund till nyheter på svenska. Skriv 3-4 korta meningar.`,
        },
        {
          role: "user",
          content: `Förklara bakgrunden: ${title} - ${summary} (${category})`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    return (
      response.choices[0].message.content || "Kunde inte hämta förklaring."
    );
  } catch (error) {
    return "Förklaring ej tillgänglig just nu.";
  }
}

module.exports = {
  translateAndSummarize,
  explainTopic,
};
