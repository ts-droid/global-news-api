const crypto = require('crypto');
const { db } = require('./db');
const { rssSources, articles } = require('./db/schema');
const { eq, desc, sql } = require('drizzle-orm');
const { fetchFromSources, deduplicateArticles, sortByDate } = require('./rssFetcher');
const { translateAndSummarize } = require('./aiService');
const cache = require('./newsCache');

// Configuration from environment
const AI_BATCH_SIZE = parseInt(process.env.AI_BATCH_SIZE) || 5;
const AI_BATCH_DELAY_MS = parseInt(process.env.AI_BATCH_DELAY_MS) || 2000;
const MAX_ARTICLES_PER_REFRESH = parseInt(process.env.MAX_ARTICLES_PER_REFRESH) || 30;
const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS) || 15 * 60 * 1000;

let isRefreshing = false;

/**
 * Generate a hash for article deduplication
 */
function generateArticleHash(link) {
  return crypto.createHash('sha256').update(link).digest('hex');
}

/**
 * Map source code to readable source name
 */
function getSourceName(sourceCode) {
  const sourceNames = {
    // Europe
    'EU-R': 'Reuters', 'EU-BBC': 'BBC News', 'EU-TG': 'The Guardian',
    'EU-DW': 'Deutsche Welle', 'EU-F24': 'France 24',
    // North America
    'NA-NYT': 'The New York Times', 'NA-CNN': 'CNN', 'NA-WP': 'The Washington Post',
    'NA-NPR': 'NPR News', 'NA-CBC': 'CBC News', 'NA-GM': 'The Globe and Mail', 'NA-AP': 'Associated Press',
    // Middle East
    'ME-AJ': 'Al Jazeera English', 'ME-HA': 'Haaretz', 'ME-TOI': 'The Times of Israel',
    // Asia
    'AS-SCMP': 'South China Morning Post', 'AS-JT': 'The Japan Times', 'AS-NHK': 'NHK World-Japan',
    'AS-ST': 'The Straits Times', 'AS-TOI': 'The Times of India', 'AS-TH': 'The Hindu',
    'AS-AJ': 'Al Jazeera Asia', 'AS-CNA': 'Channel NewsAsia',
    // Africa
    'AF-AA': 'AllAfrica', 'AF-AN': 'Africanews', 'AF-BBC': 'BBC News Africa',
    'AF-AJ': 'Al Jazeera Africa', 'AF-F24': 'France 24 Africa', 'AF-DM': 'Daily Maverick', 'AF-N24': 'News24 South Africa',
    // South America
    'SA-BAT': 'Buenos Aires Times', 'SA-BR': 'Brazil Reports', 'SA-MND': 'Mexico News Daily',
    'SA-EP': 'El País English', 'SA-LAND': 'Latin America News Dispatch', 'SA-IC': 'InSight Crime', 'SA-DA': 'Diálogo Américas',
    // Oceania
    'OC-ABC': 'ABC News Australia', 'OC-SMH': 'Sydney Morning Herald', 'OC-NZH': 'New Zealand Herald',
    // Tech
    'TECH-TC': 'TechCrunch', 'TECH-W': 'Wired', 'TECH-TV': 'The Verge',
    // Sweden
    'SE-SVT': 'SVT Nyheter', 'SE-DN': 'Dagens Nyheter', 'SE-SVD': 'Svenska Dagbladet',
    'SE-AB': 'Aftonbladet', 'SE-EXP': 'Expressen'
  };
  return sourceNames[sourceCode] || sourceCode;
}

/**
 * Process articles in batches with AI translation
 */
async function processArticleBatch(articlesToProcess, existingHashes) {
  const results = [];

  for (let i = 0; i < articlesToProcess.length; i += AI_BATCH_SIZE) {
    const batch = articlesToProcess.slice(i, i + AI_BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i/AI_BATCH_SIZE) + 1}/${Math.ceil(articlesToProcess.length/AI_BATCH_SIZE)} (${batch.length} articles)`);

    // Process batch in parallel
    const batchPromises = batch.map(async (article) => {
      const articleHash = generateArticleHash(article.link);

      // Skip if already exists
      if (existingHashes.has(articleHash)) {
        return null;
      }

      try {
        // Call AI for translation
        const aiResult = await translateAndSummarize(
          article.title,
          article.description || article.content || '',
          article.category
        );

        const readingTime = Math.max(2, Math.ceil(
          (article.description || article.content || '').split(/\s+/).length / 200
        ));

        return {
          articleHash,
          title: article.title,
          description: article.description,
          content: article.content,
          link: article.link,
          imageUrl: article.imageUrl,
          pubDate: article.pubDate ? new Date(article.pubDate) : new Date(),
          author: article.author,
          sourceCode: article.sourceCode || 'UNKNOWN',
          sourceName: getSourceName(article.sourceCode) || article.source || 'Unknown Source',
          category: article.category,
          region: article.region,
          language: article.language || 'en',
          titleSv: aiResult.title,
          summarySv: aiResult.summary,
          isTranslated: aiResult.title !== article.title,
          isBreaking: aiResult.isBreaking || false,
          readingTime,
          updatedAt: new Date()
        };
      } catch (error) {
        console.error(`Error processing article: ${article.title}`, error.message);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(r => r !== null));

    // Delay between batches to avoid rate limiting
    if (i + AI_BATCH_SIZE < articlesToProcess.length) {
      const delay = AI_BATCH_DELAY_MS * Math.pow(1.5, Math.floor(i / AI_BATCH_SIZE / 3));
      await new Promise(resolve => setTimeout(resolve, Math.min(delay, 10000)));
    }
  }

  return results;
}

/**
 * Main refresh function - fetches RSS, translates with AI, saves to DB
 */
async function refreshNews() {
  if (isRefreshing) {
    console.log('Refresh already in progress, skipping...');
    return;
  }

  isRefreshing = true;
  console.log('='.repeat(50));
  console.log('Background Refresh Started');
  console.log('='.repeat(50));

  try {
    // 1. Get active RSS sources from DB
    const sources = await db.select().from(rssSources).where(eq(rssSources.isActive, true));
    console.log(`Found ${sources.length} active RSS sources`);

    if (sources.length === 0) {
      console.log('No active sources found, skipping refresh');
      await updateCache();
      return;
    }

    // 2. Fetch articles from RSS feeds
    const result = await fetchFromSources(sources);
    let fetchedArticles = deduplicateArticles(result.articles);
    fetchedArticles = sortByDate(fetchedArticles);
    console.log(`Fetched ${fetchedArticles.length} unique articles from RSS feeds`);

    // 3. Get existing article hashes from DB to avoid duplicates
    const existingArticles = await db.select({ hash: articles.articleHash }).from(articles);
    const existingHashes = new Set(existingArticles.map(a => a.hash));
    console.log(`${existingHashes.size} articles already in database`);

    // 4. Filter to only new articles and limit
    const newArticles = fetchedArticles.filter(a => !existingHashes.has(generateArticleHash(a.link)));
    const articlesToProcess = newArticles.slice(0, MAX_ARTICLES_PER_REFRESH);
    console.log(`${newArticles.length} new articles found, processing ${articlesToProcess.length}`);

    if (articlesToProcess.length === 0) {
      console.log('No new articles to process');
      await updateCache();
      return;
    }

    // 5. Process with AI translation
    const processedArticles = await processArticleBatch(articlesToProcess, existingHashes);
    console.log(`AI processed ${processedArticles.length} articles successfully`);

    // 6. Save to database
    if (processedArticles.length > 0) {
      await db.insert(articles).values(processedArticles);
      console.log(`Saved ${processedArticles.length} articles to database`);
    }

    // 7. Update cache
    await updateCache();

    console.log('='.repeat(50));
    console.log(`Background Refresh Completed: ${processedArticles.length} new articles`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Background Refresh Error:', error);
  } finally {
    isRefreshing = false;
  }
}

/**
 * Update the news cache from database
 */
async function updateCache() {
  try {
    // Fetch latest articles from DB (last 72 hours, limit 100)
    const cutoffDate = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const latestArticles = await db
      .select()
      .from(articles)
      .orderBy(desc(articles.createdAt))
      .limit(100);

    // Transform to API format
    const apiArticles = latestArticles.map(a => ({
      id: a.id,
      title: a.title,
      titleSv: a.titleSv,
      summarySv: a.summarySv,
      description: a.description,
      link: a.link,
      imageUrl: a.imageUrl,
      pubDate: a.pubDate?.toISOString(),
      createdAt: a.createdAt.toISOString(),
      source: a.sourceName,
      sourceCode: a.sourceCode,
      author: a.author,
      category: a.category,
      region: a.region,
      readingTime: a.readingTime ? `${a.readingTime} min` : null,
      isBreaking: a.isBreaking,
      isTranslated: a.isTranslated
    }));

    // Update main cache
    cache.set('news_all_all_sv', apiArticles);

    // Update category-specific caches
    const categories = [...new Set(apiArticles.map(a => a.category).filter(Boolean))];
    for (const cat of categories) {
      const catArticles = apiArticles.filter(a => a.category === cat);
      cache.set(`category_${cat}_sv`, catArticles);
    }

    // Update region-specific caches
    const regions = [...new Set(apiArticles.map(a => a.region).filter(Boolean))];
    for (const region of regions) {
      const regionArticles = apiArticles.filter(a => a.region === region);
      cache.set(`region_${region}_sv`, regionArticles);
    }

    console.log(`Cache updated with ${apiArticles.length} articles`);
  } catch (error) {
    console.error('Cache update error:', error);
  }
}

/**
 * Start the background worker
 */
function startBackgroundWorker(intervalMs = REFRESH_INTERVAL_MS) {
  console.log(`Starting background worker (interval: ${intervalMs / 60000} minutes)`);

  // Initial run after 5 seconds to let server start
  setTimeout(() => {
    refreshNews();
  }, 5000);

  // Schedule periodic runs
  setInterval(refreshNews, intervalMs);
}

module.exports = {
  startBackgroundWorker,
  refreshNews,
  updateCache
};
