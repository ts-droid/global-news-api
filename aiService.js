const OpenAI = require("openai");

const openrouter = new OpenAI({
  baseURL:
    process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL ||
    "https://openrouter.ai/api/v1",
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
});

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

const CATEGORY_PROMPTS = {
  world: `${BASE_INSTRUCTIONS}\n\nVIKTIGT för världsnyheter: ... (porting logic from TS)`,
  // ... adding others
};

// I will simplify and port the logic from aiTranslation.ts but in JS
function getCategoryPrompt(category) {
  const normalizedCategory = (category || "default").toLowerCase();

  const prompts = {
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

  let specificPrompt = prompts.default;
  if (normalizedCategory.includes("sport")) specificPrompt = prompts.sports;
  else if (normalizedCategory.includes("tech")) specificPrompt = prompts.tech;
  else if (
    normalizedCategory.includes("business") ||
    normalizedCategory.includes("econom")
  )
    specificPrompt = prompts.business;
  else if (normalizedCategory.includes("science"))
    specificPrompt = prompts.science;
  else if (
    normalizedCategory.includes("climate") ||
    normalizedCategory.includes("environment")
  )
    specificPrompt = prompts.climate;
  else if (
    normalizedCategory.includes("culture") ||
    normalizedCategory.includes("entertainment")
  )
    specificPrompt = prompts.culture;
  else if (normalizedCategory.includes("politic"))
    specificPrompt = prompts.politics;
  else if (
    normalizedCategory.includes("world") ||
    normalizedCategory.includes("top")
  )
    specificPrompt = prompts.world;

  return `${BASE_INSTRUCTIONS}\n\n${specificPrompt}`;
}

async function translateAndSummarize(title, content, category) {
  if (!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY) {
    console.warn("AI_INTEGRATIONS_OPENROUTER_API_KEY not set, skipping AI translation");
    return { title, summary: content.substring(0, 300) };
  }

  try {
    const systemPrompt = getCategoryPrompt(category);

    const response = await openrouter.chat.completions.create({
      model: "deepseek/deepseek-chat",
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
  if (!process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY)
    return "Inget AI-stöd konfigurerat.";

  try {
    const response = await openrouter.chat.completions.create({
      model: "deepseek/deepseek-chat",
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
