const { db } = require('./db');
const { rssSources } = require('./db/schema');
const { eq } = require('drizzle-orm');
const { fetchFromSources, deduplicateArticles, sortByDate } = require('./rssFetcher');
const { translateAndSummarize } = require('./aiService');
const cache = require('./newsCache');

let isRefreshing = false;

async function refreshNews() {
  if (isRefreshing) return;
  isRefreshing = true;

  console.log('--- Background Refresh Started (Database Sources) ---');
  try {
    const sources = await db.select().from(rssSources).where(eq(rssSources.isActive, true));
    const result = await fetchFromSources(sources);
    let articles = deduplicateArticles(result.articles);
    articles = sortByDate(articles);

    // Limit to top 20 for AI processing to save tokens/time
    const topArticles = articles.slice(0, 20);
    const translatedArticles = [];

    console.log(`Processing AI translations for ${topArticles.length} articles...`);

    for (const article of topArticles) {
      // Create a unique cache key for translated version
      const cacheKey = `article_sv_${article.id}`;
      let translated = cache.get(cacheKey);

      if (!translated) {
        const aiResult = await translateAndSummarize(article.title, article.description, article.category);
        translated = {
          ...article,
          titleSv: aiResult.title,
          summarySv: aiResult.summary,
          readingTime: Math.max(2, Math.ceil((article.description || '').split(/\s+/).length / 200)),
          translatedAt: new Date().toISOString()
        };
        cache.set(cacheKey, translated, 3600); // Cache individual translated article for 1 hour
      }
      translatedArticles.push(translated);
    }

    // Update main feeds in cache
    cache.set('news_all_all_sv', translatedArticles);
    
    // Also update category specific feeds
    const categories = [...new Set(translatedArticles.map(a => a.category))];
    for (const cat of categories) {
      const catArticles = translatedArticles.filter(a => a.category === cat);
      cache.set(`category_${cat}_sv`, catArticles);
    }

    console.log(`--- Background Refresh Completed: ${translatedArticles.length} articles updated ---`);
  } catch (error) {
    console.error('Background Refresh Error:', error);
  } finally {
    isRefreshing = false;
  }
}

function startBackgroundWorker(intervalMs = 15 * 60 * 1000) {
  // Initial run
  refreshNews();
  
  // Schedule periodic runs
  setInterval(refreshNews, intervalMs);
}

module.exports = {
  startBackgroundWorker,
  refreshNews
};
