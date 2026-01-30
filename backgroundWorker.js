const { db } = require('./db');
const { rssSources, articles } = require('./db/schema');
const { eq } = require('drizzle-orm');
const { fetchFromSources, deduplicateArticles, sortByDate } = require('./rssFetcher');
const { translateAndSummarize } = require('./aiService');
const cache = require('./newsCache');

let isRefreshing = false;

async function refreshNews() {
  if (isRefreshing) return;
  isRefreshing = true;

  console.log('--- Background Refresh Started (Database Persistence) ---');
  try {
    const sources = await db.select().from(rssSources).where(eq(rssSources.isActive, true));
    const result = await fetchFromSources(sources);
    let fetchedArticles = deduplicateArticles(result.articles);

    console.log(`Fetched ${fetchedArticles.length} articles from RSS sources.`);

    let newArticlesCount = 0;

    for (const article of fetchedArticles) {
      // Check if article already exists (using hash)
      const existing = await db.select().from(articles).where(eq(articles.articleHash, article.id)).limit(1);
      
      if (existing.length === 0) {
        // New article! Translate and insert.
        const aiResult = await translateAndSummarize(article.title, article.description, article.category);
        
        await db.insert(articles).values({
          articleHash: article.id,
          sourceId: sources.find(s => s.code === article.sourceCode)?.id, // Look up source ID ref
          sourceCode: article.sourceCode,
          title: article.title,
          link: article.link,
          description: article.description,
          content: article.description, // Initial content same as desc
          pubDate: new Date(article.pubDate),
          imageUrl: article.imageUrl,
          author: article.author,
          category: article.category,
          region: article.region,
          language: article.language,
          
          isTranslated: true,
          titleSv: aiResult.title,
          summarySv: aiResult.summary,
          readingTime: Math.max(2, Math.ceil((article.description || '').split(/\s+/).length / 200)).toString() + " min",
          isBreaking: aiResult.isBreaking || false,
          updatedAt: new Date()
        });
        
        newArticlesCount++;
      }
    }

    console.log(`✓ Stored ${newArticlesCount} NEW articles in database.`);

    // --- Update Cache from DB (Source of Truth) ---
    // Fetch latest 100 articles from DB
    const allRecentArticles = await db.select().from(articles).orderBy(articles.pubDate, "desc").limit(100);
    
    // Map DB objects to API format (if needed, Drizzle returns clean info objects usually)
    // Add sorting just in case
    const sortedArticles = allRecentArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    // Update main feeds in cache (used by API for fast response)
    cache.set('news_all_all_sv', sortedArticles);
    
    // Also update category specific feeds
    const categories = [...new Set(sortedArticles.map(a => a.category))];
    for (const cat of categories) {
      const catArticles = sortedArticles.filter(a => a.category === cat);
      cache.set(`category_${cat}_sv`, catArticles);
    }
    
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
