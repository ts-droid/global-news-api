const { db } = require('./db');
const { rssSources, articles, newsEvents } = require('./db/schema');
const { eq, desc, gte } = require('drizzle-orm');
const { fetchFromSources, deduplicateArticles, sortByDate } = require('./rssFetcher');
const { summarizeAndCategorize, matchArticleToEvent, updateEventSummary } = require('./aiService');
const cache = require('./newsCache');

let isRefreshing = false;

// Configuration from environment or defaults
const AI_BATCH_SIZE = parseInt(process.env.AI_BATCH_SIZE) || 5;
const AI_BATCH_DELAY_MS = parseInt(process.env.AI_BATCH_DELAY_MS) || 1000;
const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS) || 15 * 60 * 1000;
const EVENT_WINDOW_HOURS = 48; // Look back 48 hours for related events

/**
 * Get recent events for matching (last 48 hours)
 */
async function getRecentEvents() {
  const cutoffDate = new Date(Date.now() - EVENT_WINDOW_HOURS * 60 * 60 * 1000);
  return db
    .select()
    .from(newsEvents)
    .where(gte(newsEvents.lastUpdatedAt, cutoffDate))
    .orderBy(desc(newsEvents.lastUpdatedAt))
    .limit(50);
}

/**
 * Create a new event from an article
 */
async function createEvent(article, aiResult, sourceName) {
  // Create source details array with first source
  const sourceDetails = [{
    name: sourceName || article.sourceCode || 'Unknown',
    url: article.link,
    pubDate: article.pubDate
  }];

  const [newEvent] = await db.insert(newsEvents).values({
    title: aiResult.title || article.title,
    summary: aiResult.summary || article.description?.substring(0, 300) || '',
    category: aiResult.category || article.category,
    region: article.region,
    isBreaking: aiResult.isBreaking || false,
    sourceCount: 1,
    sourceDetails: JSON.stringify(sourceDetails),
    firstReportedAt: new Date(article.pubDate),
    lastUpdatedAt: new Date(),
  }).returning();

  return newEvent;
}

/**
 * Update an existing event with new information
 */
async function updateEvent(eventId, newArticleTitle, newArticleSummary, newArticleLink, sourceName, pubDate) {
  // Get existing event
  const [existingEvent] = await db.select().from(newsEvents).where(eq(newsEvents.id, eventId));

  if (!existingEvent) return null;

  // Parse existing source details and add new source
  let sourceDetails = [];
  try {
    sourceDetails = existingEvent.sourceDetails ? JSON.parse(existingEvent.sourceDetails) : [];
  } catch (e) {
    sourceDetails = [];
  }

  // Add new source (avoid duplicates by URL)
  const existingUrls = new Set(sourceDetails.map(s => s.url));
  if (!existingUrls.has(newArticleLink)) {
    sourceDetails.push({
      name: sourceName || 'Unknown',
      url: newArticleLink,
      pubDate: pubDate || new Date().toISOString()
    });
  }

  // Merge summaries using AI
  const updatedContent = await updateEventSummary(
    existingEvent.title,
    existingEvent.summary,
    newArticleTitle,
    newArticleSummary
  );

  // Update event in DB
  const [updatedEvent] = await db.update(newsEvents)
    .set({
      title: updatedContent.title,
      summary: updatedContent.summary,
      sourceCount: sourceDetails.length,
      sourceDetails: JSON.stringify(sourceDetails),
      lastUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(newsEvents.id, eventId))
    .returning();

  return updatedEvent;
}

/**
 * Process articles with event matching
 */
async function processArticlesBatch(articlesToProcess, sources) {
  const results = [];

  // Get recent events for matching
  const recentEvents = await getRecentEvents();
  console.log(`Found ${recentEvents.length} recent events for matching`);

  // Process in batches
  for (let i = 0; i < articlesToProcess.length; i += AI_BATCH_SIZE) {
    const batch = articlesToProcess.slice(i, i + AI_BATCH_SIZE);

    console.log(`Processing batch ${Math.floor(i/AI_BATCH_SIZE) + 1}/${Math.ceil(articlesToProcess.length/AI_BATCH_SIZE)} (${batch.length} articles)`);

    const batchPromises = batch.map(async (article) => {
      try {
        // Step 1: Summarize and categorize
        console.log(`  → Summarizing: "${article.title.substring(0, 50)}..."`);
        const aiResult = await summarizeAndCategorize(article.title, article.description, article.category);
        console.log(`  ✓ Result: "${aiResult.title?.substring(0, 50)}..." (category: ${aiResult.category})`);

        // Step 2: Match against existing events
        let eventId = null;
        let isPrimarySource = false;

        if (recentEvents.length > 0) {
          const matchResult = await matchArticleToEvent(
            aiResult.title || article.title,
            aiResult.summary || article.description,
            recentEvents
          );

          console.log(`  → Event match: ${matchResult.matchType} (confidence: ${matchResult.confidence})`);

          // Get source name from sources array
          const sourceName = sources.find(s => s.code === article.sourceCode)?.name || article.sourceCode;

          if (matchResult.matchType === 'duplicate' && matchResult.confidence > 0.8) {
            // Skip duplicate articles
            console.log(`  ⊘ Skipping duplicate article`);
            return null;
          } else if (matchResult.matchType === 'update' && matchResult.eventId) {
            // Update existing event with source details
            const updatedEvent = await updateEvent(
              matchResult.eventId,
              aiResult.title || article.title,
              aiResult.summary || article.description,
              article.link,
              sourceName,
              article.pubDate
            );
            eventId = matchResult.eventId;
            console.log(`  ↻ Updated event: ${updatedEvent?.title?.substring(0, 40)}...`);
          } else {
            // Create new event with source details
            const newEvent = await createEvent(article, aiResult, sourceName);
            eventId = newEvent.id;
            isPrimarySource = true;
            console.log(`  ✚ Created new event: ${newEvent.title?.substring(0, 40)}...`);
          }
        } else {
          // No recent events - create new one with source details
          const sourceName = sources.find(s => s.code === article.sourceCode)?.name || article.sourceCode;
          const newEvent = await createEvent(article, aiResult, sourceName);
          eventId = newEvent.id;
          isPrimarySource = true;
          console.log(`  ✚ Created new event (first): ${newEvent.title?.substring(0, 40)}...`);
        }

        // Calculate reading time
        const wordCount = (article.description || '').split(/\s+/).length;
        const readingMinutes = Math.max(2, Math.ceil(wordCount / 200));

        return {
          articleHash: article.id,
          sourceId: sources.find(s => s.code === article.sourceCode)?.id,
          sourceCode: article.sourceCode,
          title: aiResult.title || article.title,
          link: article.link,
          description: article.description,
          content: article.description,
          pubDate: new Date(article.pubDate),
          imageUrl: null, // Images removed
          author: article.author,
          eventId: eventId,
          isPrimarySource: isPrimarySource,
          category: aiResult.category || article.category,
          region: article.region,
          language: article.language,
          isTranslated: false,
          titleSv: null,
          summarySv: aiResult.summary,
          readingTime: `${readingMinutes} min`,
          isBreaking: aiResult.isBreaking || false,
          updatedAt: new Date()
        };
      } catch (error) {
        console.error(`Error processing article "${article.title}":`, error.message);
        return null; // Skip errored articles
      }
    });

    const batchResults = await Promise.all(batchPromises);
    // Filter out nulls (duplicates and errors)
    results.push(...batchResults.filter(r => r !== null));

    // Delay between batches
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
  console.log('--- Background Refresh Started (Event-Based Deduplication) ---');

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
      // Process new articles with event matching
      const processedArticles = await processArticlesBatch(newArticles, sources);

      // Batch insert into database
      if (processedArticles.length > 0) {
        await db.insert(articles).values(processedArticles);
        console.log(`✓ Stored ${processedArticles.length} articles in database.`);
      }
    }

    // Update Cache from DB
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
 * Update cache with latest events from database
 */
async function updateCache(sources) {
  try {
    const sourceMap = new Map(sources.map(s => [s.code, s.name]));

    // Fetch latest events (not articles) - this is what iOS will display
    const recentEvents = await db
      .select()
      .from(newsEvents)
      .orderBy(desc(newsEvents.lastUpdatedAt))
      .limit(100);

    // Map events to API format
    const mappedEvents = recentEvents.map(e => ({
      id: e.id,
      title: e.title || "No Title",
      titleSv: e.title, // Will be translated on request
      summarySv: e.summary,
      description: e.summary || "",
      link: "#", // Events don't have direct links
      pubDate: e.firstReportedAt ? e.firstReportedAt.toISOString() : new Date().toISOString(),
      createdAt: e.createdAt ? e.createdAt.toISOString() : new Date().toISOString(),
      lastUpdatedAt: e.lastUpdatedAt ? e.lastUpdatedAt.toISOString() : new Date().toISOString(),
      source: `${e.sourceCount} ${e.sourceCount === 1 ? 'källa' : 'källor'}`,
      sourceCount: e.sourceCount,
      category: e.category || "general",
      region: e.region || "global",
      readingTime: "2 min",
      imageUrl: null,
      isBreaking: !!e.isBreaking,
      isTranslated: false,
      isEvent: true // Flag to indicate this is an event, not a single article
    }));

    // Update caches
    cache.set('news_all_all_sv', mappedEvents);

    const categories = [...new Set(mappedEvents.map(e => e.category))];
    for (const cat of categories) {
      const catEvents = mappedEvents.filter(e => e.category === cat);
      cache.set(`category_${cat}_sv`, catEvents);
    }

    console.log(`Cache updated with ${mappedEvents.length} events`);
  } catch (error) {
    console.error('Cache update error:', error);
  }
}

/**
 * Start the background worker
 */
function startBackgroundWorker(intervalMs = REFRESH_INTERVAL_MS) {
  console.log(`Starting background worker with ${intervalMs/1000/60} minute interval`);
  refreshNews();
  setInterval(refreshNews, intervalMs);
}

module.exports = {
  startBackgroundWorker,
  refreshNews,
  updateCache
};
