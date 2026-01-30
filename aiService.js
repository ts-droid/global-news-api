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

// Fallback constant if DB is empty/fails
const FALLBACK_BASE_INSTRUCTIONS = `Du är en professionell nyhetsjournalist som skriver på svenska. Din uppgift är att:
1. Översätta nyhetsartiklar till flytande, naturlig svenska
2. Sammanfatta innehållet i 2-3 koncisa stycken (100-150 ord totalt)
3. Behålla en objektiv, journalistisk ton
4. Extrahera ALLA specifika detaljer: namn, platser, siffror, datum
5. KATEGORISERA artikeln i EN av dessa kategorier baserat på innehållet:
   - world: Internationella nyheter, geopolitik, diplomati
   - politics: Politik, val, regering, lagar
   - sports: Sport, idrott, tävlingar, matcher
   - tech: Teknik, IT, AI, smartphones, internet
   - business: Ekonomi, finans, företag, börsen
   - science: Vetenskap, forskning, medicin, rymden
   - climate: Klimat, miljö, väder, naturkatastrofer
   - culture: Kultur, musik, film, konst, underhållning
6. AVGÖR om detta är en "Breaking News"-händelse (Extremt brådskande, stor påverkan, krig/katastrof/större politiska beslut).

VIKTIGT:
- Skriv ALDRIG vaga fraser som "en spelare", "två nationer", "flera länder" om du har namnen
- Inkludera ALLTID specifika namn och siffror som finns i texten
- Om artikeln saknar detaljer, skriv kortfattat vad som är känt
- Välj den MEST passande kategorin baserat på artikelns huvudämne

Svara ALLTID i följande JSON-format (inget annat):
{
  "title": "Översatt rubrik på svenska",
  "summary": "Sammanfattning på svenska i 2-3 stycken",
  "category": "en av: world, politics, sports, tech, business, science, climate, culture",
  "isBreaking": true/false
}`;

async function getCategoryPrompt(category) {
  const normalizedCategory = (category || "default").toLowerCase();

  try {
    // Fetch both 'base' and specific category prompt
    const prompts = await db
      .select()
      .from(aiPrompts)
      .where(inArray(aiPrompts.category, ["base", normalizedCategory]));
    
    const basePromptObj = prompts.find(p => p.category === 'base');
    const categoryPromptObj = prompts.find(p => p.category === normalizedCategory);

    // Determine Base Instructions
    const baseInstructions = (basePromptObj && basePromptObj.isActive) 
      ? basePromptObj.prompt 
      : FALLBACK_BASE_INSTRUCTIONS;

    // Determine Specific Instructions
    if (categoryPromptObj && categoryPromptObj.isActive) {
      return `${baseInstructions}\n\n${categoryPromptObj.prompt}`;
    }

    // Fallback to hardcoded defaults if specific DB prompt not found
    const fallbackPrompts = {
      world: `VIKTIGT för världsnyheter: Namnge länderna, städerna och nyckelpersonerna.`,
      politics: `VIKTIGT för politiska nyheter: Namnge politiker, partier och specifika beslut.`,
      sports: `VIKTIGT för sportnyheter: Inkludera exakta resultat och namn på lag/spelare.`,
      tech: `VIKTIGT för tekniknyheter: Förklara tekniken enkelt, nämn produkter och företag.`,
      business: `VIKTIGT för ekonominyheter: Inkludera siffror (belopp, procent) och företagsnamn.`,
      science: `VIKTIGT för vetenskapsnyheter: Förklara upptäckten enkelt, nämn institutioner.`,
      climate: `VIKTIGT för klimatnyheter: Ange siffror för temperatur/utsläpp, nämn avtal.`,
      culture: `VIKTIGT för kulturnyheter: Namnge artister, verk och evenemang.`,
      default: `Inkludera specifika namn, platser och datum. Var konkret.`,
    };

    let specificPrompt = fallbackPrompts.default;
    if (normalizedCategory.includes("sport")) specificPrompt = fallbackPrompts.sports;
    else if (normalizedCategory.includes("tech")) specificPrompt = fallbackPrompts.tech;
    else if (normalizedCategory.includes("business") || normalizedCategory.includes("econom")) specificPrompt = fallbackPrompts.business;
    else if (normalizedCategory.includes("science")) specificPrompt = fallbackPrompts.science;
    else if (normalizedCategory.includes("climate") || normalizedCategory.includes("environment")) specificPrompt = fallbackPrompts.climate;
    else if (normalizedCategory.includes("culture") || normalizedCategory.includes("entertainment")) specificPrompt = fallbackPrompts.culture;
    else if (normalizedCategory.includes("politic")) specificPrompt = fallbackPrompts.politics;
    else if (normalizedCategory.includes("world") || normalizedCategory.includes("top")) specificPrompt = fallbackPrompts.world;

    return `${baseInstructions}\n\n${specificPrompt}`;
  } catch (err) {
    console.error("Error fetching prompt from DB, using fallback:", err);
    return `${FALLBACK_BASE_INSTRUCTIONS}\n\nInkludera specifika namn, platser och datum. Var konkret.`;
  }
}

async function translateAndSummarize(title, content, category) {
  if (!apiConfig.deepseek.apiKey || apiConfig.deepseek.apiKey === "no-key") {
    console.warn("⚠️ AI API Key not configured - skipping translation");
    console.warn("   Set AI_INTEGRATIONS_DEEPSEEK_API_KEY in environment variables");
    return { title, summary: content.substring(0, 300), category, isBreaking: false };
  }

  try {
    const systemPrompt = await getCategoryPrompt(category);

    const response = await openai.chat.completions.create({
      model: apiConfig.deepseek.model,
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

    // Validate category - use AI suggestion if valid, otherwise keep original
    let finalCategory = category;
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
    console.error("❌ AI Translation Error:", error.message);
    if (error.response) {
      console.error("   API Response Status:", error.response.status);
      console.error("   API Response Data:", JSON.stringify(error.response.data || {}).substring(0, 200));
    }
    return { title, summary: content.substring(0, 300), category, isBreaking: false };
  }
}

async function explainTopic(title, summary, category) {
  if (!apiConfig.deepseek.apiKey)
    return "Inget AI-stöd konfigurerat.";

  try {
    const response = await openai.chat.completions.create({
      model: apiConfig.deepseek.model,
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
