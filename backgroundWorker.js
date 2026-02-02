const { db } = require('./db');
const { rssSources, articles, newsEvents, tags, eventTags, eventTranslations, serverSettings, translationLanguages } = require('./db/schema');
const { eq, desc, gte, and, isNull, notInArray, lt, inArray } = require('drizzle-orm');
const { fetchFromSources, deduplicateArticles, sortByDate } = require('./rssFetcher');
const { summarizeAndCategorize, matchArticleToEvent, updateEventSummary, extractEntities, translateArticle, VALID_COUNTRY_CODES } = require('./aiService');
const cache = require('./newsCache');
const { sendBreakingNewsPush } = require('./pushService');

let isRefreshing = false;

// Configuration from environment or defaults
const AI_BATCH_SIZE = parseInt(process.env.AI_BATCH_SIZE) || 5;
const AI_BATCH_DELAY_MS = parseInt(process.env.AI_BATCH_DELAY_MS) || 1000;
const REFRESH_INTERVAL_MS = parseInt(process.env.REFRESH_INTERVAL_MS) || 15 * 60 * 1000;
const EVENT_WINDOW_HOURS = 48; // Look back 48 hours for related events
const MIN_WORDS_FOR_SUMMARY = 80; // Scrape fulltext if description has fewer words

/**
 * Scrape article content from URL
 * Returns the main text content or null if scraping fails
 */
async function scrapeArticleContent(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsLensBot/1.0; +https://newslens.app)',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`  ⚠️ Scrape failed: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Extract text content from common article containers
    // Remove scripts, styles, nav, header, footer, ads
    let text = html
      // Remove unwanted tags and their content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Try to find article content in common containers
    const articleMatch = text.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                         text.match(/<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         text.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

    if (articleMatch) {
      text = articleMatch[1];
    }

    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]+;/gi, ' ');

    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')
      .trim();

    // Check if we got meaningful content (at least 100 words)
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 100) {
      console.log(`  ⚠️ Scraped content too short (${wordCount} words)`);
      return null;
    }

    // Limit to first ~2000 words to avoid token limits
    const words = text.split(/\s+/).slice(0, 2000);
    const result = words.join(' ');

    console.log(`  ✓ Scraped ${words.length} words from article`);
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`  ⚠️ Scrape timeout for ${url}`);
    } else {
      console.log(`  ⚠️ Scrape error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Get content for summarization - scrapes if description is too short
 */
async function getArticleContent(article) {
  const description = article.description || '';
  const wordCount = description.split(/\s+/).filter(w => w.length > 0).length;

  if (wordCount >= MIN_WORDS_FOR_SUMMARY) {
    return description;
  }

  console.log(`  📄 Description too short (${wordCount} words), scraping fulltext...`);
  const scrapedContent = await scrapeArticleContent(article.link);

  if (scrapedContent) {
    return scrapedContent;
  }

  // Fallback to original description
  return description;
}

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

  // Send push notification for breaking news
  if (newEvent.isBreaking) {
    try {
      console.log(`  📱 Sending breaking news push for: "${newEvent.title?.substring(0, 40)}..."`);
      sendBreakingNewsPush(newEvent)
        .then(result => console.log(`  📱 Push result: ${result.sent} sent, ${result.failed || 0} failed`))
        .catch(err => console.warn(`  ⚠️ Push failed: ${err.message}`));
    } catch (error) {
      console.warn(`  ⚠️ Failed to send push: ${error.message}`);
    }
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
        // Step 0: Get article content (scrape if description too short)
        const articleContent = await getArticleContent(article);

        // Step 1: Summarize and categorize
        console.log(`  → Summarizing: "${article.title.substring(0, 50)}..."`);
        const aiResult = await summarizeAndCategorize(article.title, articleContent, article.category);
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

      // Insert articles one by one to handle foreign key errors gracefully
      if (processedArticles.length > 0) {
        let successCount = 0;
        let failCount = 0;

        for (const article of processedArticles) {
          try {
            await db.insert(articles).values(article);
            successCount++;
          } catch (err) {
            failCount++;
            // Log but don't fail the whole batch
            if (err.message?.includes('foreign key')) {
              console.warn(`⚠️ Skipped article (invalid event_id): ${article.title?.substring(0, 40)}...`);
            } else if (err.message?.includes('duplicate')) {
              // Duplicate - silently skip
            } else {
              console.error(`❌ Failed to insert article: ${err.message}`);
            }
          }
        }

        console.log(`✓ Stored ${successCount} articles in database${failCount > 0 ? ` (${failCount} skipped)` : ''}.`);
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
 * Get a server setting value from database
 */
async function getServerSetting(key, defaultValue) {
  try {
    const [setting] = await db.select()
      .from(serverSettings)
      .where(eq(serverSettings.key, key))
      .limit(1);
    return setting ? setting.value : defaultValue;
  } catch (error) {
    console.warn(`Failed to get setting ${key}, using default: ${defaultValue}`);
    return defaultValue;
  }
}

/**
 * Get active translation languages from database
 */
async function getActiveLanguages() {
  try {
    const languages = await db.select()
      .from(translationLanguages)
      .where(eq(translationLanguages.isActive, true))
      .orderBy(translationLanguages.priority);
    return languages.map(l => l.code);
  } catch (error) {
    console.warn('Failed to get active languages, defaulting to Swedish');
    return ['sv'];
  }
}

/**
 * Cleanup old events based on retention settings
 * Removes events older than retention_hours from database
 */
async function cleanupOldEvents() {
  try {
    const retentionHours = parseInt(await getServerSetting('retention_hours', '72'));
    const cutoffDate = new Date(Date.now() - retentionHours * 60 * 60 * 1000);

    console.log(`🧹 Starting cleanup of events older than ${retentionHours} hours (before ${cutoffDate.toISOString()})...`);

    // Get events to delete
    const oldEvents = await db.select({ id: newsEvents.id })
      .from(newsEvents)
      .where(lt(newsEvents.lastUpdatedAt, cutoffDate));

    if (oldEvents.length === 0) {
      console.log('✅ No old events to clean up');
      return;
    }

    const eventIds = oldEvents.map(e => e.id);
    console.log(`📦 Found ${eventIds.length} events to delete`);

    // Delete related data first (cascade should handle this, but being explicit)
    // 1. Delete translations for these events
    await db.delete(eventTranslations)
      .where(inArray(eventTranslations.eventId, eventIds));

    // 2. Delete event-tag links
    await db.delete(eventTags)
      .where(inArray(eventTags.eventId, eventIds));

    // 3. Delete articles linked to these events
    await db.delete(articles)
      .where(inArray(articles.eventId, eventIds));

    // 4. Delete the events themselves
    const deleted = await db.delete(newsEvents)
      .where(inArray(newsEvents.id, eventIds))
      .returning({ id: newsEvents.id });

    console.log(`✅ Cleanup complete: Deleted ${deleted.length} old events and related data`);

    // Also clean up orphaned tags (tags not linked to any event)
    const orphanedTags = await db.execute(sql`
      DELETE FROM tags
      WHERE id NOT IN (SELECT DISTINCT tag_id FROM event_tags)
      RETURNING id
    `);

    if (orphanedTags.rowCount > 0) {
      console.log(`  🏷️ Also removed ${orphanedTags.rowCount} orphaned tags`);
    }

  } catch (error) {
    console.error('Cleanup error:', error.message);
  }
}

/**
 * Pre-translate recent events to all active languages
 * Reads active languages from translation_languages table
 */
async function preTranslateToActiveLanguages() {
  const BATCH_SIZE = 5;

  try {
    // Get settings from database
    const preTranslationEnabled = await getServerSetting('pre_translation_enabled', 'true');
    if (preTranslationEnabled !== 'true') {
      console.log('🌐 Pre-translation is disabled in settings');
      return;
    }

    const maxEvents = parseInt(await getServerSetting('max_events_to_translate', '30'));
    const activeLanguages = await getActiveLanguages();

    if (activeLanguages.length === 0) {
      console.log('🌐 No active languages configured for pre-translation');
      return;
    }

    console.log(`🌐 Starting pre-translation to: ${activeLanguages.join(', ')} (max ${maxEvents} events per language)...`);

    // Get recent events
    const recentEvents = await db.select()
      .from(newsEvents)
      .orderBy(desc(newsEvents.lastUpdatedAt))
      .limit(maxEvents);

    if (recentEvents.length === 0) {
      console.log('No events to translate');
      return;
    }

    // Process each language
    for (const targetLang of activeLanguages) {
      console.log(`\n  📖 Processing language: ${targetLang}`);

      // Find which events already have translations for this language
      const existingTranslations = await db.select({ eventId: eventTranslations.eventId })
        .from(eventTranslations)
        .where(eq(eventTranslations.language, targetLang));

      const translatedEventIds = new Set(existingTranslations.map(t => t.eventId));

      // Filter to events that need translation
      const eventsNeedingTranslation = recentEvents.filter(e => !translatedEventIds.has(e.id));

      if (eventsNeedingTranslation.length === 0) {
        console.log(`  ✅ All recent events already have ${targetLang} translations`);
        continue;
      }

      console.log(`  📝 ${eventsNeedingTranslation.length} events need ${targetLang} translation`);

      // Translate in batches
      let translatedCount = 0;
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

            translatedCount++;
          } catch (err) {
            console.warn(`    ✗ Failed to translate event ${event.id}: ${err.message}`);
          }
        }));

        // Small delay between batches
        if (i + BATCH_SIZE < eventsNeedingTranslation.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`  ✅ Translated ${translatedCount} events to ${targetLang}`);
    }

    console.log(`\n✅ Pre-translation complete for all active languages`);
  } catch (error) {
    console.error('Pre-translation error:', error.message);
  }
}

/**
 * Start the background worker
 */
async function startBackgroundWorker(intervalMs = REFRESH_INTERVAL_MS) {
  console.log(`Starting background worker with ${intervalMs/1000/60} minute interval`);

  // Run initial refresh
  refreshNews();
  setInterval(refreshNews, intervalMs);

  // Schedule pre-translation: 2 minutes after startup, then every 10 minutes
  setTimeout(() => {
    preTranslateToActiveLanguages();
    setInterval(preTranslateToActiveLanguages, 10 * 60 * 1000);
  }, 2 * 60 * 1000);

  // Schedule cleanup: 5 minutes after startup, then based on cleanup_interval_hours setting
  setTimeout(async () => {
    await cleanupOldEvents();

    // Get cleanup interval from settings (default 6 hours)
    const cleanupIntervalHours = parseInt(await getServerSetting('cleanup_interval_hours', '6'));
    const cleanupIntervalMs = cleanupIntervalHours * 60 * 60 * 1000;

    console.log(`🧹 Cleanup job scheduled to run every ${cleanupIntervalHours} hours`);
    setInterval(cleanupOldEvents, cleanupIntervalMs);
  }, 5 * 60 * 1000);
}

module.exports = {
  startBackgroundWorker,
  refreshNews,
  updateCache,
  preTranslateToActiveLanguages,
  cleanupOldEvents,
  getServerSetting,
  getActiveLanguages,
};
