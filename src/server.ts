import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import NodeCache from 'node-cache';
import dotenv from 'dotenv';
import { 
  getAllSources, 
  getSourceByCode, 
  getSourcesByCategory, 
  getSourcesByRegion 
} from './config/sources';
import { 
  fetchFromSources, 
  deduplicateArticles, 
  sortByDate 
} from './services/rssFetcher';
import { Article, PaginatedResponse } from './types';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize cache (TTL: 15 minutes)
const cache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * Helper function to paginate results
 */
const paginate = <T>(items: T[], limit: any = 20, offset: any = 0) => {
  const maxLimit = 100;
  const safeLimit = Math.min(parseInt(String(limit)) || 20, maxLimit);
  const safeOffset = parseInt(String(offset)) || 0;
  
  const paginatedItems = items.slice(safeOffset, safeOffset + safeLimit);
  
  return {
    items: paginatedItems,
    pagination: {
      total: items.length,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < items.length
    }
  };
};

/**
 * Helper function to search articles
 */
const searchArticles = (articles: Article[], query: string): Article[] => {
  const lowerQuery = query.toLowerCase();
  return articles.filter(article => 
    article.title.toLowerCase().includes(lowerQuery) ||
    article.description.toLowerCase().includes(lowerQuery)
  );
};

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'success',
    message: 'Global News API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    sources: getAllSources().length
  });
});

/**
 * GET /api/sources
 * Get all available news sources
 */
app.get('/api/sources', (req: Request, res: Response) => {
  try {
    const sources = getAllSources();
    res.json({
      status: 'success',
      data: {
        sources: sources,
        total: sources.length
      }
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/news
 * Get latest news from all sources (with optional category filter)
 */
app.get('/api/news', async (req: Request, res: Response) => {
  try {
    const { limit, offset, category, region } = req.query;
    
    // Generate cache key
    const cacheKey = `news_${category || 'all'}_${region || 'all'}`;
    
    // Check cache first
    let articles = cache.get<Article[]>(cacheKey);
    
    if (!articles) {
      console.log('Cache miss - fetching from sources...');
      
      // Determine which sources to fetch from
      let sources = getAllSources();
      
      if (category) {
        sources = getSourcesByCategory(String(category));
        if (sources.length === 0) {
          res.status(400).json({
            status: 'error',
            message: `Invalid category: ${category}`
          });
          return;
        }
      }
      
      if (region) {
        sources = getSourcesByRegion(String(region));
        if (sources.length === 0) {
          res.status(400).json({
            status: 'error',
            message: `Invalid region: ${region}`
          });
          return;
        }
      }
      
      // Fetch articles
      const result = await fetchFromSources(sources);
      articles = deduplicateArticles(result.articles);
      articles = sortByDate(articles);
      
      // Cache the results
      cache.set(cacheKey, articles);
      
      console.log(`Fetched ${articles.length} articles (${result.stats.successful}/${result.stats.total} sources successful)`);
    } else {
      console.log('Cache hit - returning cached articles');
    }
    
    // Paginate results
    const { items, pagination } = paginate(articles, limit, offset);
    
    res.json({
      status: 'success',
      data: {
        articles: items,
        pagination
      }
    });
  } catch (error: any) {
    console.error('Error in /api/news:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/news/source/:sourceCode
 * Get news from a specific source
 */
app.get('/api/news/source/:sourceCode', async (req: Request, res: Response) => {
  try {
    const { sourceCode } = req.params;
    const { limit } = req.query;
    
    const source = getSourceByCode(String(sourceCode));
    
    if (!source) {
      res.status(404).json({
        status: 'error',
        message: `Source not found: ${sourceCode}`
      });
      return;
    }
    
    // Check cache
    const cacheKey = `source_${sourceCode}`;
    let articles = cache.get<Article[]>(cacheKey);
    
    if (!articles) {
      console.log(`Cache miss - fetching from ${source.name}...`);
      const result = await fetchFromSources([source]);
      articles = sortByDate(result.articles);
      cache.set(cacheKey, articles);
    } else {
      console.log('Cache hit - returning cached articles');
    }
    
    // Paginate results (offset 0 for single source view usually)
    const { items, pagination } = paginate(articles, limit, 0);
    
    res.json({
      status: 'success',
      data: {
        articles: items,
        pagination
      }
    });
  } catch (error: any) {
    console.error('Error in /api/news/source:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/news/category/:category
 * Get news from a specific category
 */
app.get('/api/news/category/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const { limit, offset } = req.query;
    
    const sources = getSourcesByCategory(String(category));
    
    if (sources.length === 0) {
      res.status(404).json({
        status: 'error',
        message: `Category not found: ${category}`,
        availableCategories: ['swedish', 'international', 'tech']
      });
      return;
    }
    
    // Check cache
    const cacheKey = `category_${category}`;
    let articles = cache.get<Article[]>(cacheKey);
    
    if (!articles) {
      console.log(`Cache miss - fetching category ${category}...`);
      const result = await fetchFromSources(sources);
      articles = deduplicateArticles(result.articles);
      articles = sortByDate(articles);
      cache.set(cacheKey, articles);
    } else {
      console.log('Cache hit - returning cached articles');
    }
    
    // Paginate results
    const { items, pagination } = paginate(articles, limit, offset);
    
    res.json({
      status: 'success',
      data: {
        articles: items,
        pagination
      }
    });
  } catch (error: any) {
    console.error('Error in /api/news/category:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/news/search
 * Search news articles
 */
app.get('/api/news/search', async (req: Request, res: Response) => {
  try {
    const { q, limit, offset, sources: sourceCodes } = req.query;
    
    if (!q) {
      res.status(400).json({
        status: 'error',
        message: 'Query parameter "q" is required'
      });
      return;
    }
    
    // Determine which sources to search
    let sources = getAllSources();
    
    if (sourceCodes && typeof sourceCodes === 'string') {
      const codes = sourceCodes.split(',');
      const filteredSources = codes.map(code => getSourceByCode(code.trim())).filter((s): s is any => !!s);
      
      if (filteredSources.length > 0) {
        sources = filteredSources;
      } else {
        res.status(400).json({
          status: 'error',
          message: 'No valid source codes provided'
        });
        return;
      }
    }
    
    // Check cache for all articles
    const cacheKey = 'news_all_all';
    let articles = cache.get<Article[]>(cacheKey);
    
    if (!articles) {
      console.log('Cache miss - fetching all articles for search...');
      const result = await fetchFromSources(sources);
      articles = deduplicateArticles(result.articles);
      articles = sortByDate(articles);
      cache.set(cacheKey, articles);
    }
    
    // Search articles
    const searchResults = searchArticles(articles, String(q));
    
    // Paginate results
    const { items, pagination } = paginate(searchResults, limit, offset);
    
    res.json({
      status: 'success',
      data: {
        query: q,
        articles: items,
        pagination
      }
    });
  } catch (error: any) {
    console.error('Error in /api/news/search:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/stats
 * Get API statistics
 */
app.get('/api/stats', (req: Request, res: Response) => {
  const sources = getAllSources();
  const regions: Record<string, number> = {};
  const categories: Record<string, number> = {};
  
  sources.forEach(source => {
    regions[source.region] = (regions[source.region] || 0) + 1;
    categories[source.category] = (categories[source.category] || 0) + 1;
  });
  
  res.json({
    status: 'success',
    data: {
      totalSources: sources.length,
      byRegion: regions,
      byCategory: categories,
      cacheStats: cache.getStats()
    }
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/sources',
      'GET /api/news',
      'GET /api/news/source/:sourceCode',
      'GET /api/news/category/:category',
      'GET /api/news/search',
      'GET /api/stats'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🌍 Global News API Server');
  console.log('='.repeat(50));
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ Total sources: ${getAllSources().length}`);
  console.log(`✓ Cache TTL: 15 minutes`);
  console.log('='.repeat(50));
  console.log(`\n📡 API Endpoints:`);
  console.log(`   http://localhost:${PORT}/api/health`);
  console.log(`   http://localhost:${PORT}/api/sources`);
  console.log(`   http://localhost:${PORT}/api/news`);
  console.log(`   http://localhost:${PORT}/api/news/source/:sourceCode`);
  console.log(`   http://localhost:${PORT}/api/news/category/:category`);
  console.log(`   http://localhost:${PORT}/api/news/search?q=keyword`);
  console.log(`   http://localhost:${PORT}/api/stats`);
  console.log('\n');
});
