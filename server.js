const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Log version immediately on startup
const packageJson = require('./package.json');
console.log('');
console.log('='.repeat(50));
console.log(`🚀 NewsLens API v${packageJson.version}`);
console.log(`📅 Started: ${new Date().toISOString()}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('='.repeat(50));
console.log('');

const cache = require('./newsCache');
const { 
  fetchFromSources, 
  deduplicateArticles, 
  sortByDate 
} = require('./rssFetcher');

const { startBackgroundWorker, refreshNews } = require('./backgroundWorker');
const { explainTopic } = require('./aiService');
const { 
  hashPassword, 
  verifyPassword, 
  generateToken, 
  authenticateAdmin, 
  generate2FA, 
  verify2FA 
} = require('./adminAuth');
const { db } = require('./db');
const { adminUsers, rssSources, aiPrompts, articles: articlesTable, newsEvents, tags, eventTags, eventTranslations } = require('./db/schema');
const { eq, desc, inArray, and, isNull } = require('drizzle-orm');

const swedishMockArticles = [
  {
    id: "mock-1",
    title: "Globalt klimattoppmöte når historiskt avtal om koldioxidutsläpp",
    titleSv: "Globalt klimattoppmöte når historiskt avtal om koldioxidutsläpp",
    summarySv: "Världsledare har nått ett historiskt avtal vid det globala klimattoppmötet, där de åtar sig att minska koldioxidutsläppen med 50% före 2035.",
    description: "Världsledare har nått ett historiskt avtal vid det globala klimattoppmötet...",
    source: "Reuters",
    link: "https://reuters.com",
    pubDate: new Date(Date.now() - 3600000).toISOString(),
    category: "world",
    region: "Europe",
    readingTime: 4,
    imageUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=1000&auto=format&fit=crop",
    isBreaking: true,
  },
  {
    id: "mock-2",
    title: "Teknikjättar presenterar nästa generations AI-assistent",
    titleSv: "Teknikjättar presenterar nästa generations AI-assistent",
    summarySv: "Ledande teknikföretag har gemensamt tillkännagivit ett genombrott inom artificiell intelligens som lovar att förändra hur människor interagerar med datorer.",
    description: "Ledande teknikföretag har gemensamt tillkännagivit ett genombrott inom artificiell intelligens...",
    source: "TechCrunch",
    link: "https://techcrunch.com",
    pubDate: new Date(Date.now() - 7200000).toISOString(),
    category: "tech",
    region: "North America",
    readingTime: 3,
    imageUrl: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=1000&auto=format&fit=crop",
  }
];

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Start background worker
startBackgroundWorker();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * Helper function to paginate results
 */
const paginate = (articles, limit = 20, offset = 0) => {
  const maxLimit = 100;
  const safeLimit = Math.min(parseInt(limit) || 20, maxLimit);
  const safeOffset = parseInt(offset) || 0;
  
  const paginatedArticles = articles.slice(safeOffset, safeOffset + safeLimit);
  
  return {
    articles: paginatedArticles,
    pagination: {
      total: articles.length,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < articles.length
    }
  };
};

/**
 * Helper function to search articles
 */
const searchArticles = (articles, query) => {
  const lowerQuery = query.toLowerCase();
  return articles.filter(article => 
    article.title.toLowerCase().includes(lowerQuery) ||
    article.description.toLowerCase().includes(lowerQuery)
  );
};

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', async (req, res) => {
  try {
    const sourcesCount = await db.select().from(rssSources);
    const { apiConfig } = require('./config/apiConfig');
    const aiConfigured = !!(apiConfig.deepseek.apiKey && apiConfig.deepseek.apiKey !== "no-key");

    res.json({
      status: 'success',
      message: 'Global Intelligence News API is running',
      timestamp: new Date().toISOString(),
      version: packageJson.version,
      sources: sourcesCount.length,
      backgroundWorker: 'active',
      aiTranslation: aiConfigured ? 'configured' : 'NOT CONFIGURED - set AI_INTEGRATIONS_DEEPSEEK_API_KEY'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/news
 * Get latest news - returns articles with AI summary, translates on request
 *
 * Flow:
 * 1. Fetch articles from DB (already summarized & categorized)
 * 2. If lang != 'en', translate the requested page only
 * 3. Return translated articles
 */
app.get('/api/news', async (req, res) => {
  try {
    const { limit = 20, offset = 0, category, region, lang = 'sv' } = req.query;
    const { translateArticle } = require('./aiService');
    // Limit to 20 articles max to avoid timeout during translation
    const safeLimit = Math.min(parseInt(limit) || 20, 20);
    const safeOffset = parseInt(offset) || 0;

    // Check cache first (with language-specific key)
    const cacheKey = `news_${category || 'all'}_${region || 'all'}_${lang}_${safeOffset}_${safeLimit}`;
    let cachedArticles = cache.get(cacheKey);

    if (cachedArticles) {
      return res.json({ status: 'success', data: cachedArticles });
    }

    console.log(`Fetching articles (lang: ${lang}, limit: ${safeLimit}, offset: ${safeOffset})`);

    // Build query
    let query = db.select().from(articlesTable).orderBy(desc(articlesTable.pubDate));
    if (category) query = query.where(eq(articlesTable.category, category));
    if (region) query = query.where(eq(articlesTable.region, region));

    const allArticles = await query;

    if (allArticles.length === 0) {
      console.log('DB empty - triggering fetch from sources');
      refreshNews();
      return res.json({ status: 'success', data: { articles: swedishMockArticles, pagination: { total: 2, limit: safeLimit, offset: safeOffset, hasMore: false } } });
    }

    // Fetch sources for name mapping
    const sources = await db.select().from(rssSources);
    const sourceMap = new Map(sources.map(s => [s.code, s.name]));

    // Paginate first, then translate only the page
    const pageArticles = allArticles.slice(safeOffset, safeOffset + safeLimit);
    const total = allArticles.length;

    // Helper function to translate with timeout
    const translateWithTimeout = async (title, summary, targetLang, timeoutMs = 5000) => {
      return Promise.race([
        translateArticle(title, summary, targetLang),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Translation timeout')), timeoutMs))
      ]);
    };

    // Translate articles if needed (only the current page)
    // Process in smaller batches to avoid overwhelming the API
    const translatedArticles = [];
    const BATCH_SIZE = 5;

    for (let i = 0; i < pageArticles.length; i += BATCH_SIZE) {
      const batch = pageArticles.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(batch.map(async (a) => {
        let titleTranslated = a.title;
        let summaryTranslated = a.summarySv || a.description;
        let isTranslated = false;

        // Only translate if language is not English
        if (lang !== 'en') {
          try {
            const translated = await translateWithTimeout(a.title, a.summarySv || a.description, lang);
            titleTranslated = translated.title;
            summaryTranslated = translated.summary;
            isTranslated = true;
          } catch (err) {
            console.error(`Translation error for article ${a.id}:`, err.message);
            // Keep original on error/timeout
          }
        }

        return {
          id: a.id,
          articleHash: a.articleHash,
          title: a.title || "No Title",
          titleSv: titleTranslated,
          summarySv: summaryTranslated,
          description: a.description || "",
          link: a.link || "#",
          pubDate: a.pubDate ? a.pubDate.toISOString() : new Date().toISOString(),
          createdAt: a.createdAt ? a.createdAt.toISOString() : new Date().toISOString(),
          source: sourceMap.get(a.sourceCode) || a.sourceCode || "Unknown Source",
          sourceCode: a.sourceCode,
          author: a.author || null,
          category: a.category || "general",
          region: a.region || "global",
          readingTime: a.readingTime || "2 min",
          imageUrl: a.imageUrl || null,
          isBreaking: !!a.isBreaking,
          isTranslated: isTranslated
        };
      }));

      translatedArticles.push(...batchResults);
    }

    const result = {
      articles: translatedArticles,
      pagination: {
        total: total,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: safeOffset + safeLimit < total
      }
    };

    // Cache for 10 minutes
    cache.set(cacheKey, result, 600);

    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/events
 * Get news events (grouped articles) - PRIMARY ENDPOINT FOR iOS APP
 * Returns events with source count, not individual articles
 */
app.get('/api/events', async (req, res) => {
  try {
    const { limit = 15, offset = 0, category, lang = 'sv', nocache } = req.query;
    const { translateArticle } = require('./aiService');
    const safeLimit = Math.min(parseInt(limit) || 15, 30); // Reduced for faster response
    const safeOffset = parseInt(offset) || 0;

    // Check cache first (skip if nocache=1)
    const cacheKey = `events_${category || 'all'}_${lang}_${safeOffset}_${safeLimit}`;
    if (!nocache) {
      let cachedEvents = cache.get(cacheKey);
      if (cachedEvents) {
        return res.json({ status: 'success', data: cachedEvents });
      }
    } else {
      // Clear this cache key if nocache is set
      cache.del(cacheKey);
    }

    console.log(`Fetching events (lang: ${lang}, limit: ${safeLimit}, offset: ${safeOffset})`);

    // Build query for events - select specific fields to handle missing source_details column
    let query = db.select({
      id: newsEvents.id,
      title: newsEvents.title,
      summary: newsEvents.summary,
      category: newsEvents.category,
      region: newsEvents.region,
      isBreaking: newsEvents.isBreaking,
      sourceCount: newsEvents.sourceCount,
      firstReportedAt: newsEvents.firstReportedAt,
      lastUpdatedAt: newsEvents.lastUpdatedAt,
      createdAt: newsEvents.createdAt,
    }).from(newsEvents).orderBy(desc(newsEvents.lastUpdatedAt));
    if (category) query = query.where(eq(newsEvents.category, category));

    const allEvents = await query;

    if (allEvents.length === 0) {
      console.log('No events found - triggering refresh');
      refreshNews();
      return res.json({
        status: 'success',
        data: {
          events: [],
          pagination: { total: 0, limit: safeLimit, offset: safeOffset, hasMore: false }
        }
      });
    }

    // Paginate
    const pageEvents = allEvents.slice(safeOffset, safeOffset + safeLimit);
    const total = allEvents.length;

    // Get source details for events (from articles table)
    const eventIds = pageEvents.map(e => e.id);
    const eventSourceDetails = {}; // eventId -> [{name, url}]

    if (eventIds.length > 0) {
      // Get articles for each event to get source names and links
      const linkedArticles = await db.select({
        eventId: articlesTable.eventId,
        sourceCode: articlesTable.sourceCode,
        link: articlesTable.link,
      }).from(articlesTable)
        .where(inArray(articlesTable.eventId, eventIds));

      console.log(`Found ${linkedArticles.length} articles linked to ${eventIds.length} events`);

      // Get source names mapping
      const allSources = await db.select({
        code: rssSources.code,
        name: rssSources.name,
      }).from(rssSources);
      const sourceNameMap = Object.fromEntries(allSources.map(s => [s.code, s.name]));

      // Group by eventId and collect source details (ONE per source name)
      for (const art of linkedArticles) {
        if (art.eventId) {
          if (!eventSourceDetails[art.eventId]) {
            eventSourceDetails[art.eventId] = [];
          }
          const sourceName = sourceNameMap[art.sourceCode] || art.sourceCode;
          // Only keep ONE article per source (first one wins) - prevents "92 sources" for same newspaper
          const existingSourceNames = new Set(eventSourceDetails[art.eventId].map(s => s.name));
          if (!existingSourceNames.has(sourceName)) {
            eventSourceDetails[art.eventId].push({
              name: sourceName,
              url: art.link
            });
          }
        }
      }
    }

    // Fetch tags for events
    const eventTagsMap = {}; // eventId -> [{name, type, countryCode}]
    const eventCountryCodes = {}; // eventId -> [countryCodes]

    if (eventIds.length > 0) {
      try {
        // Get all tags linked to these events
        const linkedTags = await db.select({
          eventId: eventTags.eventId,
          tagName: tags.name,
          tagType: tags.type,
          countryCode: tags.countryCode,
        })
        .from(eventTags)
        .innerJoin(tags, eq(eventTags.tagId, tags.id))
        .where(inArray(eventTags.eventId, eventIds));

        // Group tags by eventId
        for (const row of linkedTags) {
          if (!eventTagsMap[row.eventId]) {
            eventTagsMap[row.eventId] = [];
            eventCountryCodes[row.eventId] = [];
          }
          eventTagsMap[row.eventId].push({
            name: row.tagName,
            type: row.tagType,
            countryCode: row.countryCode || null,
          });
          // Collect country codes
          if (row.countryCode) {
            eventCountryCodes[row.eventId].push(row.countryCode);
          }
        }

        // Dedupe country codes
        for (const eventId of Object.keys(eventCountryCodes)) {
          eventCountryCodes[eventId] = [...new Set(eventCountryCodes[eventId])];
        }

        console.log(`Found tags for ${Object.keys(eventTagsMap).length} events`);
      } catch (err) {
        console.warn(`Failed to fetch tags: ${err.message}`);
        // Continue without tags if the tables don't exist yet
      }
    }

    // Helper: Save translation to DB (fire-and-forget)
    const saveTranslationToDB = async (eventId, lang, title, summary) => {
      try {
        await db.insert(eventTranslations).values({
          eventId,
          language: lang,
          title,
          summary,
        }).onConflictDoNothing(); // Skip if already exists
        console.log(`💾 Saved translation to DB for event ${eventId} (${lang})`);
      } catch (err) {
        console.warn(`Failed to save translation to DB: ${err.message}`);
      }
    };

    // Translate with timeout and save to DB
    const translateWithTimeout = async (title, summary, targetLang, eventId, timeoutMs = 15000) => {
      const startTime = Date.now();
      try {
        const result = await Promise.race([
          translateArticle(title, summary, targetLang),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Translation timeout')), timeoutMs))
        ]);
        console.log(`✓ Translation completed in ${Date.now() - startTime}ms`);
        // Save to DB asynchronously
        saveTranslationToDB(eventId, targetLang, result.title, result.summary);
        return result;
      } catch (err) {
        console.error(`✗ Translation failed after ${Date.now() - startTime}ms: ${err.message}`);
        throw err;
      }
    };

    // Fetch existing translations from DB for this batch
    const dbTranslationsMap = {}; // eventId -> {title, summary}
    if (lang !== 'en' && eventIds.length > 0) {
      try {
        const existingTranslations = await db.select({
          eventId: eventTranslations.eventId,
          title: eventTranslations.title,
          summary: eventTranslations.summary,
        })
        .from(eventTranslations)
        .where(and(
          inArray(eventTranslations.eventId, eventIds),
          eq(eventTranslations.language, lang)
        ));

        for (const t of existingTranslations) {
          dbTranslationsMap[t.eventId] = { title: t.title, summary: t.summary };
        }
        console.log(`📚 Found ${existingTranslations.length} cached translations in DB`);
      } catch (err) {
        console.warn(`Failed to fetch translations from DB: ${err.message}`);
      }
    }

    // Process events - use DB cache first, then translate missing
    const translatedEvents = await Promise.all(pageEvents.map(async (e, index) => {
      let titleTranslated = e.title;
      let summaryTranslated = e.summary;
      let isTranslated = false;

      if (lang !== 'en') {
        // Check DB translation cache first
        const dbCached = dbTranslationsMap[e.id];
        if (dbCached) {
          titleTranslated = dbCached.title;
          summaryTranslated = dbCached.summary;
          isTranslated = true;
        } else if (index < 3) {
          // Translate first 3 events synchronously for immediate display
          try {
            const translated = await translateWithTimeout(e.title, e.summary, lang, e.id, 15000);
            titleTranslated = translated.title;
            summaryTranslated = translated.summary;
            isTranslated = true;
          } catch (err) {
            console.error(`Translation failed for event ${e.id}: ${err.message}`);
          }
        } else {
          // Queue background translation for remaining events (saves to DB)
          translateWithTimeout(e.title, e.summary, lang, e.id, 15000)
            .then(() => console.log(`Background translation done for ${e.id}`))
            .catch(() => {}); // Silently ignore failures
        }
      }

      // Get source details for this event
      const sourceDetails = eventSourceDetails[e.id] || [];

      // Source display: show name if 1 source, count if multiple
      let sourceDisplay;
      if (sourceDetails.length === 1) {
        sourceDisplay = sourceDetails[0].name;
      } else if (sourceDetails.length > 1) {
        sourceDisplay = `${sourceDetails.length} källor`;
      } else {
        sourceDisplay = e.sourceCount === 1 ? '1 källa' : `${e.sourceCount} källor`;
      }

      // Get tags for this event
      const eventTagsList = eventTagsMap[e.id] || [];
      const countryCodes = eventCountryCodes[e.id] || [];

      return {
        id: e.id,
        title: e.title,
        titleSv: isTranslated ? titleTranslated : null, // Only set if actually translated
        summarySv: isTranslated ? summaryTranslated : null,
        description: e.summary,
        pubDate: e.firstReportedAt ? e.firstReportedAt.toISOString() : new Date().toISOString(),
        lastUpdatedAt: e.lastUpdatedAt ? e.lastUpdatedAt.toISOString() : new Date().toISOString(),
        createdAt: e.createdAt ? e.createdAt.toISOString() : new Date().toISOString(),
        source: sourceDisplay,
        sourceCount: sourceDetails.length || e.sourceCount,
        sourceDetails: sourceDetails, // Array med {name, url} för iOS
        tags: eventTagsList, // Array med {name, type, countryCode} för iOS
        countryCodes: countryCodes, // Aggregerade landskoder för filtrering
        category: e.category || "general",
        region: e.region || "global",
        readingTime: "2 min",
        imageUrl: null,
        isBreaking: !!e.isBreaking,
        isTranslated: isTranslated,
        isEvent: true
      };
    }));

    // Filter to only show translated events when requesting non-English
    // This gives a cleaner UX - users only see properly translated content
    const filteredEvents = lang !== 'en'
      ? translatedEvents.filter(e => e.isTranslated)
      : translatedEvents;

    const result = {
      events: filteredEvents,
      pagination: {
        total: filteredEvents.length,
        limit: safeLimit,
        offset: safeOffset,
        hasMore: safeOffset + safeLimit < filteredEvents.length
      }
    };

    // Cache for 5 minutes
    cache.set(cacheKey, result, 300);

    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/events/:id/articles
 * Get all articles for a specific event
 */
app.get('/api/events/:id/articles', async (req, res) => {
  try {
    const { id } = req.params;

    // Get the event
    const [event] = await db.select().from(newsEvents).where(eq(newsEvents.id, id));

    if (!event) {
      return res.status(404).json({ status: 'error', message: 'Event not found' });
    }

    // Get all articles for this event
    const eventArticles = await db
      .select()
      .from(articlesTable)
      .where(eq(articlesTable.eventId, id))
      .orderBy(desc(articlesTable.pubDate));

    // Get source names
    const sources = await db.select().from(rssSources);
    const sourceMap = new Map(sources.map(s => [s.code, s.name]));

    const mappedArticles = eventArticles.map(a => ({
      id: a.id,
      title: a.title,
      link: a.link,
      source: sourceMap.get(a.sourceCode) || a.sourceCode,
      pubDate: a.pubDate ? a.pubDate.toISOString() : null,
      isPrimarySource: a.isPrimarySource
    }));

    res.json({
      status: 'success',
      data: {
        event: {
          id: event.id,
          title: event.title,
          summary: event.summary,
          category: event.category,
          sourceCount: event.sourceCount
        },
        articles: mappedArticles
      }
    });
  } catch (error) {
    console.error('Error fetching event articles:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/news/refresh
 * Manually trigger a background refresh
 */
app.post('/api/news/refresh', async (req, res) => {
  refreshNews();
  res.json({ status: 'success', message: 'Refresh triggered' });
});

/**
 * GET /api/debug-prompts
 * Show what prompts are being used
 */
app.get('/api/debug-prompts', async (req, res) => {
  try {
    const prompts = await db.select().from(aiPrompts);
    res.json({ status: 'success', prompts });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/fix-base-prompt
 * Update the base prompt to include JSON format requirements
 */
app.post('/api/fix-base-prompt', async (req, res) => {
  try {
    const newBasePrompt = `Du är en professionell nyhetsjournalist som skriver på svenska. Din uppgift är att:
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

    await db.update(aiPrompts)
      .set({ prompt: newBasePrompt, updatedAt: new Date() })
      .where(eq(aiPrompts.category, 'base'));

    res.json({ status: 'success', message: 'Base prompt updated with JSON format requirements' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/test-ai
 * Test AI translation using the actual translateAndSummarize function
 */
app.get('/api/test-ai', async (req, res) => {
  const { translateAndSummarize } = require('./aiService');
  const { apiConfig } = require('./config/apiConfig');

  try {
    const testTitle = "Tesla announces new electric vehicle";
    const testContent = "Tesla CEO Elon Musk announced today a new electric vehicle model that will cost $25,000. The car will have a range of 300 miles and will be available in 2026.";

    console.log("Testing translateAndSummarize function...");

    const result = await translateAndSummarize(testTitle, testContent, "international");

    res.json({
      status: 'success',
      config: {
        hasApiKey: !!apiConfig.deepseek.apiKey,
        keyPrefix: apiConfig.deepseek.apiKey ? apiConfig.deepseek.apiKey.substring(0, 10) + '...' : 'none',
        baseUrl: apiConfig.deepseek.baseUrl,
        model: apiConfig.deepseek.model
      },
      input: { title: testTitle, content: testContent, category: "international" },
      output: result,
      wasTranslated: result.title !== testTitle
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      errorType: error.constructor.name,
      stack: error.stack?.split('\n').slice(0, 5)
    });
  }
});

/**
 * GET /api/news/search
 * Search articles by query
 */
app.get('/api/news/search', async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query must be at least 2 characters'
      });
    }

    const searchQuery = q.toLowerCase().trim();

    // Try cache first
    let articles = cache.get('news_all_all_sv');

    if (!articles) {
      // Fetch from DB if cache miss
      const sources = await db.select().from(rssSources);
      const sourceMap = new Map(sources.map(s => [s.code, s.name]));

      const dbArticles = await db
        .select()
        .from(articlesTable)
        .orderBy(articlesTable.createdAt, "desc")
        .limit(500); // Search within latest 500 articles

      articles = dbArticles.map(a => ({
        id: a.id,
        articleHash: a.articleHash,
        title: a.title || "No Title",
        titleSv: a.titleSv || a.title,
        summarySv: a.summarySv || a.description,
        description: a.description || "",
        link: a.link || "#",
        pubDate: a.pubDate ? a.pubDate.toISOString() : new Date().toISOString(),
        createdAt: a.createdAt ? a.createdAt.toISOString() : new Date().toISOString(),
        source: sourceMap.get(a.sourceCode) || a.sourceCode || "Unknown Source",
        sourceCode: a.sourceCode,
        author: a.author || null,
        category: a.category || "general",
        region: a.region || "global",
        readingTime: a.readingTime || "2 min",
        imageUrl: a.imageUrl || null,
        isBreaking: !!a.isBreaking,
        isTranslated: !!a.isTranslated
      }));
    }

    // Search in title, titleSv, description, summarySv
    const searchResults = articles.filter(article => {
      const titleMatch = (article.title || '').toLowerCase().includes(searchQuery);
      const titleSvMatch = (article.titleSv || '').toLowerCase().includes(searchQuery);
      const descMatch = (article.description || '').toLowerCase().includes(searchQuery);
      const summaryMatch = (article.summarySv || '').toLowerCase().includes(searchQuery);
      const sourceMatch = (article.source || '').toLowerCase().includes(searchQuery);

      return titleMatch || titleSvMatch || descMatch || summaryMatch || sourceMatch;
    });

    const paginatedData = paginate(searchResults, limit, offset);

    res.json({
      status: 'success',
      query: q,
      data: paginatedData
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ status: 'error', message: 'Search failed' });
  }
});

/**
 * GET /api/news/:id/explain
 * Get an AI-powered background explanation for an article
 */
app.get('/api/news/:id/explain', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `article_sv_${id}`;
    const article = cache.get(cacheKey);
    
    if (!article) {
      return res.status(404).json({ status: 'error', message: 'Article not found or not yet processed' });
    }
    
    const explanationKey = `explain_${id}`;
    let explanation = cache.get(explanationKey);
    
    if (!explanation) {
      explanation = await explainTopic(article.titleSv || article.title, article.summarySv || article.description, article.category);
      cache.set(explanationKey, explanation, 3600);
    }
    
    res.json({ status: 'success', data: { explanation } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/sources
 * Get all available news sources from DB
 */
app.get('/api/sources', async (req, res) => {
  try {
    const sources = await db.select().from(rssSources).where(eq(rssSources.isActive, true));
    
    res.json({
      status: 'success',
      data: {
        sources: sources,
        total: sources.length
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/stats
 * Get API statistics from DB
 */
app.get('/api/stats', async (req, res) => {
  try {
    const sources = await db.select().from(rssSources);
    const regions = {};
    const categories = {};
    
    sources.forEach(source => {
      regions[source.region] = (regions[source.region] || 0) + 1;
      categories[source.category] = (categories[source.category] || 0) + 1;
    });
    
    // Get recent articles
    const recentArticles = await db.select().from(articlesTable).orderBy(desc(articlesTable.pubDate)).limit(50);

    // Map source names
    const sourceMap = new Map(sources.map(s => [s.code, s.name]));
    
    res.json({
      status: 'success',
      data: {
        totalSources: sources.length,
        byRegion: regions,
        byCategory: categories,
        cacheStats: cache.getStats(),
        recentArticles: recentArticles.map(a => ({
          title: a.titleSv || a.title,
          source: sourceMap.get(a.sourceCode) || a.sourceCode,
          pubDate: a.pubDate ? new Date(a.pubDate).toISOString() : null
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================
// ADMIN AUTH ROUTES
// ============================================

/**
 * POST /api/admin/login
 * Basic password authentication
 */
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
    
    // If user needs to change password
    if (user.forcePasswordChange) {
      return res.json({ 
        status: 'success', 
        message: 'Password change required', 
        requirePasswordChange: true,
        token: generateToken(user) 
      });
    }
    
    // If TOTP is enabled, require 2FA
    if (user.totpEnabled) {
      return res.json({ 
        status: 'success', 
        message: '2FA required', 
        require2FA: true,
        tempToken: generateToken(user)
      });
    }
    
    // Full login successful
    const token = generateToken(user);
    res.json({ 
      status: 'success', 
      token,
      user: {
        email: user.email,
        isSuperAdmin: user.isSuperAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/admin/2fa/verify
 * Verify TOTP token
 */
app.post('/api/admin/2fa/verify', async (req, res) => {
  try {
    const { token, code } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_secret_change_me_in_prod");
    
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, decoded.id)).limit(1);
    
    if (!user || !user.totpSecret) {
      return res.status(400).json({ status: 'error', message: '2FA not set up for this user' });
    }
    
    const isValid = verify2FA(user.totpSecret, code);
    if (!isValid) {
      return res.status(401).json({ status: 'error', message: 'Invalid 2FA code' });
    }
    
    // 2FA successful
    const authToken = generateToken(user);
    res.json({ 
      status: 'success', 
      token: authToken,
      user: {
        email: user.email,
        isSuperAdmin: user.isSuperAdmin
      }
    });
  } catch (error) {
    res.status(401).json({ status: 'error', message: 'Invalid session' });
  }
});

// ============================================
// AI PROMPT MANAGEMENT (Protected)
// ============================================

/**
 * GET /api/admin/prompts
 * List all AI category prompts
 */
app.get('/api/admin/prompts', authenticateAdmin, async (req, res) => {
  try {
    const prompts = await db.select().from(aiPrompts);
    res.json({ status: 'success', data: prompts });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/admin/prompts
 * Update or create an AI prompt
 */
app.post('/api/admin/prompts', authenticateAdmin, async (req, res) => {
  try {
    const { category, prompt } = req.body;
    
    // Check if exists
    const [existing] = await db.select().from(aiPrompts).where(eq(aiPrompts.category, category)).limit(1);
    
    if (existing) {
      await db.update(aiPrompts)
        .set({ prompt, updatedAt: new Date() })
        .where(eq(aiPrompts.category, category));
    } else {
      await db.insert(aiPrompts).values({
        category,
        prompt,
        updatedAt: new Date()
      });
    }
    
    res.json({ status: 'success', message: 'Prompt sparad' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================
// CONFIGURATION MANAGEMENT (Protected)
// ============================================

/**
 * GET /api/admin/sources
 * List all sources from database
 */
app.get('/api/admin/sources', authenticateAdmin, async (req, res) => {
  try {
    const sources = await db.select().from(rssSources);
    res.json({ status: 'success', data: sources });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/admin/sources/test
 * Test an RSS feed URL
 */
app.post('/api/admin/sources/test', authenticateAdmin, async (req, res) => {
  try {
    const { rssUrl } = req.body;
    if (!rssUrl) return res.status(400).json({ status: 'error', message: 'RSS URL required' });
    
    const fetch = require('node-fetch');
    const RSSParser = require('rss-parser');
    const parser = new RSSParser();
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8'
      },
      timeout: 8000
    });
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const xml = await response.text();
    const feed = await parser.parseString(xml);
    
    res.json({ 
      status: 'success', 
      data: {
        title: feed.title,
        description: feed.description,
        itemCount: feed.items.length,
        items: feed.items.slice(0, 3).map(item => ({ title: item.title }))
      } 
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: `Test misslyckades: ${error.message}` });
  }
});

/**
 * POST /api/admin/sources
 * Add a new news source
 */
app.post('/api/admin/sources', authenticateAdmin, async (req, res) => {
  try {
    const sourceData = req.body;
    await db.insert(rssSources).values({
      ...sourceData,
      updatedAt: new Date()
    });
    res.json({ status: 'success', message: 'Source added' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// =============================================================================
// PUSH NOTIFICATION ENDPOINTS
// =============================================================================

const pushService = require('./pushService');

/**
 * POST /api/devices/register
 * Register or update a device for push notifications
 */
app.post('/api/devices/register', async (req, res) => {
  try {
    const { token, platform = 'ios', notifyBreaking = true, preferredLanguage = 'sv', focusCountries } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Device token is required'
      });
    }

    await pushService.registerDevice(token, platform, {
      notifyBreaking,
      preferredLanguage,
      focusCountries
    });

    res.json({
      status: 'success',
      message: 'Device registered successfully'
    });
  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * DELETE /api/devices/unregister
 * Unregister a device from push notifications
 */
app.delete('/api/devices/unregister', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Device token is required'
      });
    }

    await pushService.unregisterDevice(token);

    res.json({
      status: 'success',
      message: 'Device unregistered successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * PUT /api/devices/preferences
 * Update device notification preferences
 */
app.put('/api/devices/preferences', async (req, res) => {
  try {
    const { token, notifyBreaking, preferredLanguage, focusCountries } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Device token is required'
      });
    }

    await pushService.updateDevicePreferences(token, {
      notifyBreaking,
      preferredLanguage,
      focusCountries
    });

    res.json({
      status: 'success',
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/push/stats
 * Get push notification statistics (admin only)
 */
app.get('/api/admin/push/stats', authenticateAdmin, async (req, res) => {
  try {
    const stats = await pushService.getDeviceStats();
    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/push/send
 * Send a custom push notification (admin only)
 */
app.post('/api/admin/push/send', authenticateAdmin, async (req, res) => {
  try {
    const { title, body, data = {} } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        status: 'error',
        message: 'Title and body are required'
      });
    }

    const result = await pushService.sendCustomPush(title, body, data);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

const { ensureSchema } = require('./db/migrate');

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  // Ensure DB Schema
  await ensureSchema();

  console.log('');
  console.log('✅ Server ready!');
  console.log(`   Port: ${PORT}`);
  console.log(`   Background Worker: Active`);
  console.log('='.repeat(50));
  console.log('');
});

module.exports = app;
