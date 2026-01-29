import Parser from 'rss-parser';
import crypto from 'crypto';
import { Article, FetchResult, FetchStats, MultiFetchResult, NewsSource } from '../types';

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Global-News-API/1.0'
  }
});

/**
 * Normalize article link by removing common tracking parameters
 */
export const normalizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // Common tracking parameters to remove
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'rss', 'ref'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch (e) {
    return url;
  }
};

/**
 * Generate a unique hash ID for an article based on title and normalized link
 */
export const generateArticleId = (title: string, link: string): string => {
  const normalizedLink = normalizeUrl(link);
  const content = `${title}${normalizedLink}`;
  return crypto.createHash('md5').update(content).digest('hex');
};

/**
 * Extract image URL from RSS item
 */
const extractImageUrl = (item: any): string | null => {
  // Try different common RSS image fields
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
    return item['media:content'].$.url;
  }
  if (item['media:thumbnail'] && item['media:thumbnail'].$ && item['media:thumbnail'].$.url) {
    return item['media:thumbnail'].$.url;
  }
  if (item.image && item.image.url) {
    return item.image.url;
  }
  
  // Try to extract from content
  if (item.content) {
    const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
    if (imgMatch) {
      return imgMatch[1];
    }
  }
  
  return null;
};

/**
 * Safely parse date from various RSS formats
 */
const parseSafeDate = (dateString: any): string => {
  if (!dateString) return new Date().toISOString();
  
  const date = new Date(dateString);
  // Check if date is valid
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }
  
  // Try to clean up common issues (e.g., extra whitespace or weird characters)
  try {
    const cleaned = String(dateString).trim();
    const fallbackDate = new Date(cleaned);
    if (!isNaN(fallbackDate.getTime())) {
      return fallbackDate.toISOString();
    }
  } catch (e) {}
  
  return new Date().toISOString();
};

/**
 * Normalize article data from RSS feed
 */
const normalizeArticle = (item: any, source: NewsSource): Article => {
  const link = item.link || '';
  const normalizedLink = normalizeUrl(link);
  
  return {
    id: generateArticleId(item.title || '', link),
    source: source.name,
    sourceCode: source.code,
    category: source.category,
    region: source.region,
    country: source.country,
    language: source.language,
    title: (item.title || 'No title').trim(),
    description: (item.contentSnippet || item.description || item.content || '').trim(),
    link: normalizedLink,
    pubDate: parseSafeDate(item.pubDate || item.isoDate),
    imageUrl: extractImageUrl(item),
    author: item.creator || item.author || source.name
  };
};

/**
 * Fetch articles from a single RSS source
 */
export const fetchFromSource = async (source: NewsSource): Promise<FetchResult> => {
  try {
    console.log(`Fetching from ${source.name} (${source.code})...`);
    const feed = await parser.parseURL(source.rssUrl);
    
    // Check if feed.items exists before mapping
    if (!feed.items) {
      throw new Error('No items found in feed');
    }

    const articles = feed.items.map(item => normalizeArticle(item, source));
    
    console.log(`✓ Fetched ${articles.length} articles from ${source.name}`);
    return {
      success: true,
      source: source.code,
      articles: articles,
      count: articles.length
    };
  } catch (error: any) {
    console.error(`✗ Error fetching from ${source.name}:`, error.message);
    return {
      success: false,
      source: source.code,
      error: error.message,
      articles: [],
      count: 0
    };
  }
};

/**
 * Fetch articles from multiple sources
 */
export const fetchFromSources = async (sources: NewsSource[]): Promise<MultiFetchResult> => {
  const promises = sources.map(source => fetchFromSource(source));
  const results = await Promise.allSettled(promises);
  
  const allArticles: Article[] = [];
  const stats: FetchStats = {
    total: sources.length,
    successful: 0,
    failed: 0,
    totalArticles: 0
  };
  
  const failedSources: string[] = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      stats.successful++;
      stats.totalArticles += result.value.count;
      allArticles.push(...result.value.articles);
    } else {
      stats.failed++;
      failedSources.push(sources[index].name);
      console.error(`Failed to fetch from ${sources[index].name}`);
    }
  });

  if (failedSources.length > 0) {
    console.warn(`Summary: ${failedSources.length} sources failed to fetch: ${failedSources.join(', ')}`);
  }
  
  return {
    articles: allArticles,
    stats: stats
  };
};

/**
 * Remove duplicate articles based on ID
 */
export const deduplicateArticles = (articles: Article[]): Article[] => {
  const seen = new Set();
  return articles.filter(article => {
    if (seen.has(article.id)) {
      return false;
    }
    seen.add(article.id);
    return true;
  });
};

/**
 * Sort articles by publication date (newest first)
 */
export const sortByDate = (articles: Article[]): Article[] => {
  return articles.sort((a, b) => {
    const dateA = new Date(a.pubDate);
    const dateB = new Date(b.pubDate);
    return dateB.getTime() - dateA.getTime();
  });
};
