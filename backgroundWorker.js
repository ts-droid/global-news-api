const { db } = require('./db');
const { rssSources, articles } = require('./db/schema');
const { eq, desc } = require('drizzle-orm');
const { fetchFromSources, deduplicateArticles, sortByDate } = require('./rssFetcher');
const { summarizeAndCategorize } = require('./aiService');
const cache = require('./newsCache');

let isRefreshing = false;

// Configuration from environment or defaults
const AI_BATCH_SIZE = parseInt(process.env.AI_BATCH_SIZE) || 5;
const AI_BATCH_DELAY_MS = parseInt(process.env.AI_BATCH_DELAY_MS) || 1000;
const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS) || 15 * 60 * 1000;

/**
 * Process articles in parallel batches for AI translation
 * @param {Array} articlesToProcess - Articles needing AI processing
 * @param {Array} sources - All sources for lookup
 * @returns {Array} Processed articles ready for DB insert
 */
async function processArticlesBatch(articlesToProcess, sources) {
  const results = [];

  // Process in batches to avoid overwhelming the AI API
  for (let i = 0; i < articlesToProcess.length; i += AI_BATCH_SIZE) {
    const batch = articlesToProcess.slice(i, i + AI_BATCH_SIZE);

    console.log(`Processing batch ${Math.floor(i/AI_BATCH_SIZE) + 1}/${Math.ceil(articlesToProcess.length/AI_BATCH_SIZE)} (${batch.length} articles)`);

    // Process batch in parallel
    const batchPromises = batch.map(async (article) => {
      try {
        console.log(`  → Summarizing: "${article.title.substring(0, 50)}..."`);
        const aiResult = await summarizeAndCategorize(article.title, article.description, article.category);
        console.log(`  ✓ Result: "${aiResult.title?.substring(0, 50)}..." (category: ${aiResult.category})`);

        // Calculate reading time from full content if available
        const wordCount = (article.description || '').split(/\s+/).length;
        const readingMinutes = Math.max(2, Math.ceil(wordCount / 200));

        return {
          articleHash: article.id,
          sourceId: sources.find(s => s.code === article.sourceCode)?.id,
          sourceCode: article.sourceCode,
          title: aiResult.title || article.title, // AI-processed headline (original language)
          link: article.link,
          description: article.description, // Original description
          content: article.description,
          pubDate: new Date(article.pubDate),
          imageUrl: article.imageUrl,
          author: article.author,
          category: aiResult.category || article.category, // AI-classified category
          region: article.region,
          language: article.language,
          isTranslated: false, // Not translated yet - will be translated on request
          titleSv: null, // Will be filled when translated
          summarySv: aiResult.summary, // AI summary (original language for now)
          readingTime: `${readingMinutes} min`,
          isBreaking: aiResult.isBreaking || false,
          updatedAt: new Date()
        };
      } catch (error) {
        console.error(`Error processing article "${article.title}":`, error.message);
        // Return article without AI translation as fallback
        return {
          articleHash: article.id,
          sourceId: sources.find(s => s.code === article.sourceCode)?.id,
          sourceCode: article.sourceCode,
          title: article.title,
          link: article.link,
          description: article.description,
          content: article.description,
          pubDate: new Date(article.pubDate),
          imageUrl: article.imageUrl,
          author: article.author,
          category: article.category,
          region: article.region,
          language: article.language,
          isTranslated: false,
          titleSv: article.title, // Use original as fallback
          summarySv: article.description?.substring(0, 300) || '',
          readingTime: '2 min',
          isBreaking: false,
          updatedAt: new Date()
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to be nice to AI API rate limits
    if (i + AI_BATCH_SIZE < articlesToProcess.length) {
      await new Promise(resolve => setTimeout(resolve, AI_BATCH_DELAY_MS));
    }
  }

  return results;
}

/**
 * Main refresh function - fetches RSS, processes with AI, stores in DB
 */
async function refreshNews() {
  if (isRefreshing) {
    console.log('Refresh already in progress, skipping...');
    return;
  }
  isRefreshing = true;

  const startTime = Date.now();
  console.log('--- Background Refresh Started (Database Persistence) ---');

  try {
    // Fetch active sources
    const sources = await db.select().from(rssSources).where(eq(rssSources.isActive, true));
    console.log(`Found ${sources.length} active sources`);

    // Fetch articles from RSS feeds
    const result = await fetchFromSources(sources);
    let fetchedArticles = deduplicateArticles(result.articles);
    console.log(`Fetched ${fetchedArticles.length} articles from RSS sources.`);

    // Get existing article hashes to avoid re-processing
    const existingHashes = await db
      .select({ hash: articles.articleHash })
      .from(articles);
    const existingHashSet = new Set(existingHashes.map(e => e.hash));

    // Filter to only new articles
    const newArticles = fetchedArticles.filter(a => !existingHashSet.has(a.id));
    console.log(`${newArticles.length} new articles to process`);

    if (newArticles.length > 0) {
      // Process new articles with parallel AI translation
      const processedArticles = await processArticlesBatch(newArticles, sources);

      // Batch insert into database
      if (processedArticles.length > 0) {
        await db.insert(articles).values(processedArticles);
        console.log(`✓ Stored ${processedArticles.length} NEW articles in database.`);
      }
    }

    // --- Update Cache from DB (Source of Truth) ---
    await updateCache(sources);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`--- Background Refresh Completed in ${duration}s ---`);

  } catch (error) {
    console.error('Background Refresh Error:', error);
  } finally {
    isRefreshing = false;
  }
}

/**
 * Update cache with latest articles from database
 */
async function updateCache(sources) {
  try {
    // Build source name map
    const sourceMap = new Map(sources.map(s => [s.code, s.name]));

    // Fetch latest articles from DB
    const allRecentArticles = await db
      .select()
      .from(articles)
      .orderBy(desc(articles.createdAt))
      .limit(100);

    // Map to API format with source names
    const mappedArticles = allRecentArticles.map(a => ({
      id: a.id,
      articleHash: a.articleHash,
      title: a.title || "No Title",
      titleSv: a.titleSv || a.title || "Rubrik saknas",
      summarySv: a.summarySv || a.description || "Ingen sammanfattning tillgänglig.",
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

    // Update main cache
    cache.set('news_all_all_sv', mappedArticles);

    // Update category-specific caches
    const categories = [...new Set(mappedArticles.map(a => a.category))];
    for (const cat of categories) {
      const catArticles = mappedArticles.filter(a => a.category === cat);
      cache.set(`category_${cat}_sv`, catArticles);
    }

    // Update region-specific caches
    const regions = [...new Set(mappedArticles.map(a => a.region))];
    for (const region of regions) {
      const regionArticles = mappedArticles.filter(a => a.region === region);
      cache.set(`region_${region}_sv`, regionArticles);
    }

    console.log(`Cache updated with ${mappedArticles.length} articles`);
  } catch (error) {
    console.error('Cache update error:', error);
  }
}

/**
 * Start the background worker with configurable interval
 */
function startBackgroundWorker(intervalMs = REFRESH_INTERVAL_MS) {
  console.log(`Starting background worker with ${intervalMs/1000/60} minute interval`);

  // Initial run
  refreshNews();

  // Schedule periodic runs
  setInterval(refreshNews, intervalMs);
}

module.exports = {
  startBackgroundWorker,
  refreshNews,
  updateCache
};
