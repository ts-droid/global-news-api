const { db } = require('./db');
const { rssSources, articles, newsEvents, tags, eventTags, eventTranslations } = require('./db/schema');
const { eq, desc, gte, and, isNull, notInArray } = require('drizzle-orm');
const { fetchFromSources, deduplicateArticles, sortByDate } = require('./rssFetcher');
const { summarizeAndCategorize, matchArticleToEvent, updateEventSummary, extractEntities, translateArticle, VALID_COUNTRY_CODES } = require('./aiService');
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
 * Extract country code from place tag like "London (GB)" -> "GB"
 */
function extractCountryCode(placeName) {
  const match = placeName.match(/\(([A-Z]{2})\)$/);
  if (match && VALID_COUNTRY_CODES.has(match[1])) {
    return match[1];
  }
  return null;
}

/**
 * Save extracted entities as tags and link them to an event
 */
async function saveEventTags(eventId, entities) {
  if (!entities || !eventId) return;

  const tagTypes = [
    { type: 'person', items: entities.people || [] },
    { type: 'place', items: entities.places || [] },
    { type: 'organization', items: entities.organizations || [] },
    { type: 'topic', items: entities.topics || [] },
  ];

  for (const { type, items } of tagTypes) {
    for (const name of items) {
      if (!name || name.length < 2) continue;

      try {
        // Extract country code for place tags
        const countryCode = type === 'place' ? extractCountryCode(name) : null;
        const normalizedName = name.toLowerCase().replace(/\s*\([A-Z]{2}\)$/, '').trim();

        // Upsert tag (find existing or create new)
        let [existingTag] = await db
          .select()
          .from(tags)
          .where(and(
            eq(tags.normalizedName, normalizedName),
            eq(tags.type, type)
          ))
          .limit(1);

        let tagId;
        if (existingTag) {
          tagId = existingTag.id;
          // Update country code if we have a better one
          if (countryCode && !existingTag.countryCode) {
            await db.update(tags)
              .set({ countryCode })
              .where(eq(tags.id, tagId));
          }
        } else {
          // Create new tag
          const [newTag] = await db.insert(tags).values({
            name: name.replace(/\s*\([A-Z]{2}\)$/, '').trim(), // Store clean name
            type,
            normalizedName,
            countryCode,
          }).returning();
          tagId = newTag.id;
        }

        // Link tag to event (ignore if already linked)
        await db.insert(eventTags).values({
          eventId,
          tagId,
          relevanceScore: 1.0,
        }).onConflictDoNothing();

      } catch (error) {
        // Ignore individual tag errors, continue with others
        console.warn(`  ⚠️ Failed to save tag "${name}": ${error.message}`);
      }
    }
  }
}

/**
 * Create a new event from an article
 */
async function createEvent(article, aiResult) {
  const [newEvent] = await db.insert(newsEvents).values({
    title: aiResult.title || article.title,
    summary: aiResult.summary || article.description?.substring(0, 300) || '',
    category: aiResult.category || article.category,
    region: article.region,
    isBreaking: aiResult.isBreaking || false,
    sourceCount: 1,
    firstReportedAt: new Date(article.pubDate),
    lastUpdatedAt: new Date(),
  }).returning();

  // Extract and save entities as tags
  try {
    const entities = await extractEntities(
      aiResult.title || article.title,
      aiResult.summary || article.description,
      aiResult.category || article.category
    );
    await saveEventTags(newEvent.id, entities);
    console.log(`  🏷️ Saved ${(entities.people?.length || 0) + (entities.places?.length || 0) + (entities.organizations?.length || 0) + (entities.topics?.length || 0)} tags`);
  } catch (error) {
    console.warn(`  ⚠️ Failed to extract entities: ${error.message}`);
  }

  return newEvent;
}

/**
 * Update an existing event with new information
 */
async function updateEvent(eventId, newArticleTitle, newArticleSummary) {
  // Get existing event
  const [existingEvent] = await db.select().from(newsEvents).where(eq(newsEvents.id, eventId));

  if (!existingEvent) return null;

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
      sourceCount: existingEvent.sourceCount + 1,
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

          if (matchResult.matchType === 'duplicate' && matchResult.confidence > 0.8) {
            // Skip duplicate articles
            console.log(`  ⊘ Skipping duplicate article`);
            return null;
          } else if (matchResult.matchType === 'update' && matchResult.eventId) {
            // Update existing event
            const updatedEvent = await updateEvent(
              matchResult.eventId,
              aiResult.title || article.title,
              aiResult.summary || article.description
            );
            eventId = matchResult.eventId;
            console.log(`  ↻ Updated event: ${updatedEvent?.title?.substring(0, 40)}...`);
          } else {
            // Create new event
            const newEvent = await createEvent(article, aiResult);
            eventId = newEvent.id;
            isPrimarySource = true;
            console.log(`  ✚ Created new event: ${newEvent.title?.substring(0, 40)}...`);
          }
        } else {
          // No recent events - create new one
          const newEvent = await createEvent(article, aiResult);
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
 * Pre-translate recent events to Swedish
 * Runs after main refresh to ensure all events have Swedish translations
 */
async function preTranslateToSwedish() {
  const targetLang = 'sv';
  const BATCH_SIZE = 5;
  const MAX_EVENTS = 30; // Only translate most recent 30 events

  try {
    console.log('🌐 Starting pre-translation to Swedish...');

    // Get recent events that don't have Swedish translations
    const recentEventIds = await db.select({ id: newsEvents.id })
      .from(newsEvents)
      .orderBy(desc(newsEvents.lastUpdatedAt))
      .limit(MAX_EVENTS);

    if (recentEventIds.length === 0) {
      console.log('No events to translate');
      return;
    }

    const eventIdList = recentEventIds.map(e => e.id);

    // Find which events already have Swedish translations
    const existingTranslations = await db.select({ eventId: eventTranslations.eventId })
      .from(eventTranslations)
      .where(and(
        eq(eventTranslations.language, targetLang),
        // Only check events in our list
      ));

    const translatedEventIds = new Set(existingTranslations.map(t => t.eventId));

    // Filter to events that need translation
    const eventsNeedingTranslation = [];
    for (const id of eventIdList) {
      if (!translatedEventIds.has(id)) {
        const [event] = await db.select().from(newsEvents).where(eq(newsEvents.id, id));
        if (event) {
          eventsNeedingTranslation.push(event);
        }
      }
    }

    if (eventsNeedingTranslation.length === 0) {
      console.log('✅ All recent events already have Swedish translations');
      return;
    }

    console.log(`📝 Found ${eventsNeedingTranslation.length} events needing Swedish translation`);

    // Translate in batches
    for (let i = 0; i < eventsNeedingTranslation.length; i += BATCH_SIZE) {
      const batch = eventsNeedingTranslation.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (event) => {
        try {
          const translated = await translateArticle(event.title, event.summary, targetLang);

          await db.insert(eventTranslations).values({
            eventId: event.id,
            language: targetLang,
            title: translated.title,
            summary: translated.summary,
          }).onConflictDoNothing();

          console.log(`  ✓ Translated: "${event.title?.substring(0, 40)}..."`);
        } catch (err) {
          console.warn(`  ✗ Failed to translate event ${event.id}: ${err.message}`);
        }
      }));

      // Small delay between batches
      if (i + BATCH_SIZE < eventsNeedingTranslation.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`✅ Pre-translation complete: ${eventsNeedingTranslation.length} events translated`);
  } catch (error) {
    console.error('Pre-translation error:', error.message);
  }
}

/**
 * Start the background worker
 */
function startBackgroundWorker(intervalMs = REFRESH_INTERVAL_MS) {
  console.log(`Starting background worker with ${intervalMs/1000/60} minute interval`);
  refreshNews();
  setInterval(refreshNews, intervalMs);

  // Run pre-translation 2 minutes after startup, then every 10 minutes
  setTimeout(() => {
    preTranslateToSwedish();
    setInterval(preTranslateToSwedish, 10 * 60 * 1000);
  }, 2 * 60 * 1000);
}

module.exports = {
  startBackgroundWorker,
  refreshNews,
  updateCache,
  preTranslateToSwedish
};
