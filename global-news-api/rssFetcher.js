const Parser = require('rss-parser');
const crypto = require('crypto');

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Global-News-API/1.0'
  }
});

/**
 * Generate a unique hash ID for an article based on title and link
 */
const generateArticleId = (title, link) => {
  const content = `${title}${link}`;
  return crypto.createHash('md5').update(content).digest('hex');
};

/**
 * Normalize article data from RSS feed
 */
const normalizeArticle = (item, source) => {
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
 * Extract image URL from RSS item
 */
const extractImageUrl = (item) => {
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
 * Fetch articles from a single RSS source
 */
const fetchFromSource = async (source) => {
  try {
    console.log(`Fetching from ${source.name} (${source.code})...`);
    const feed = await parser.parseURL(source.rssUrl);
    
    const articles = feed.items.map(item => normalizeArticle(item, source));
    
    console.log(`✓ Fetched ${articles.length} articles from ${source.name}`);
    return {
      success: true,
      source: source.code,
      articles: articles,
      count: articles.length
    };
  } catch (error) {
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
const fetchFromSources = async (sources) => {
  const promises = sources.map(source => fetchFromSource(source));
  const results = await Promise.allSettled(promises);
  
  const allArticles = [];
  const stats = {
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
const deduplicateArticles = (articles) => {
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
const sortByDate = (articles) => {
  return articles.sort((a, b) => {
    const dateA = new Date(a.pubDate);
    const dateB = new Date(b.pubDate);
    return dateB - dateA;
  });
};

module.exports = {
  fetchFromSource,
  fetchFromSources,
  deduplicateArticles,
  sortByDate,
  generateArticleId
};
