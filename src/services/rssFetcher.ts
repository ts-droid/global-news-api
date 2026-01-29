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
 * Generate a unique hash ID for an article based on title and link
 */
export const generateArticleId = (title: string, link: string): string => {
  const content = `${title}${link}`;
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
 * Normalize article data from RSS feed
 */
const normalizeArticle = (item: any, source: NewsSource): Article => {
  return {
    id: generateArticleId(item.title || '', item.link || ''),
    source: source.name,
    sourceCode: source.code,
    category: source.category,
    region: source.region,
    country: source.country,
    language: source.language,
    title: item.title || 'No title',
    description: item.contentSnippet || item.description || item.content || '',
    link: item.link || '',
    pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
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
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      stats.successful++;
      stats.totalArticles += result.value.count;
      allArticles.push(...result.value.articles);
    } else {
      stats.failed++;
      console.error(`Failed to fetch from ${sources[index].name}`);
    }
  });
  
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
