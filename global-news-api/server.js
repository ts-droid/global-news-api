const express = require('express');
const cors = require('cors');
require('dotenv').config();

const cache = require('./newsCache');
const { 
  fetchFromSources, 
  deduplicateArticles, 
  sortByDate 
} = require('./rssFetcher');

const { startBackgroundWorker, refreshNews } = require('./backgroundWorker');
const { explainTopic } = require('./aiService');
const { 
  hashPassword, 
  verifyPassword, 
  generateToken, 
  authenticateAdmin, 
  generate2FA, 
  verify2FA 
} = require('./adminAuth');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const { adminUsers, rssSources, aiPrompts, articles } = require('./db/schema');
const { eq, desc, ilike, or, and, sql } = require('drizzle-orm');

const swedishMockArticles = [
  {
    id: "mock-1",
    title: "Globalt klimattoppmöte når historiskt avtal om koldioxidutsläpp",
    titleSv: "Globalt klimattoppmöte når historiskt avtal om koldioxidutsläpp",
    summarySv: "Världsledare har nått ett historiskt avtal vid det globala klimattoppmötet, där de åtar sig att minska koldioxidutsläppen med 50% före 2035.",
    description: "Världsledare har nått ett historiskt avtal vid det globala klimattoppmötet...",
    source: "Reuters",
    link: "https://reuters.com",
    pubDate: new Date(Date.now() - 3600000).toISOString(),
    category: "world",
    region: "Europe",
    readingTime: 4,
    imageUrl: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=1000&auto=format&fit=crop",
    isBreaking: true,
  },
  {
    id: "mock-2",
    title: "Teknikjättar presenterar nästa generations AI-assistent",
    titleSv: "Teknikjättar presenterar nästa generations AI-assistent",
    summarySv: "Ledande teknikföretag har gemensamt tillkännagivit ett genombrott inom artificiell intelligens som lovar att förändra hur människor interagerar med datorer.",
    description: "Ledande teknikföretag har gemensamt tillkännagivit ett genombrott inom artificiell intelligens...",
    source: "TechCrunch",
    link: "https://techcrunch.com",
    pubDate: new Date(Date.now() - 7200000).toISOString(),
    category: "tech",
    region: "North America",
    readingTime: 3,
    imageUrl: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=1000&auto=format&fit=crop",
  }
];

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Start background worker
startBackgroundWorker();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * Helper function to paginate results
 */
const paginate = (articles, limit = 20, offset = 0) => {
  const maxLimit = 100;
  const safeLimit = Math.min(parseInt(limit) || 20, maxLimit);
  const safeOffset = parseInt(offset) || 0;
  
  const paginatedArticles = articles.slice(safeOffset, safeOffset + safeLimit);
  
  return {
    articles: paginatedArticles,
    pagination: {
      total: articles.length,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + safeLimit < articles.length
    }
  };
};

/**
 * Helper function to search articles
 */
const searchArticles = (articles, query) => {
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
app.get('/api/health', async (req, res) => {
  try {
    const sourcesCount = await db.select().from(rssSources);
    res.json({
      status: 'success',
      message: 'Global Intelligence News API is running',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      sources: sourcesCount.length,
      backgroundWorker: 'active'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/news
 * Get latest news from database (with Swedish translations)
 */
app.get('/api/news', async (req, res) => {
  try {
    const { limit = 20, offset = 0, category, region, lang = 'sv' } = req.query;

    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const safeOffset = parseInt(offset) || 0;

    // Try cache first
    const cacheKey = `news_${category || 'all'}_${region || 'all'}_sv`;
    let cachedArticles = cache.get(cacheKey);

    if (cachedArticles && !category && !region) {
      // Use cached data for main feed
      const paginatedData = paginate(cachedArticles, safeLimit, safeOffset);
      return res.json({ status: 'success', data: paginatedData });
    }

    // Build query with filters
    let conditions = [];
    if (category) {
      conditions.push(eq(articles.category, category));
    }
    if (region) {
      conditions.push(eq(articles.region, region));
    }

    // Fetch from database
    let query = db.select().from(articles);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const dbArticles = await query
      .orderBy(desc(articles.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

    // Get total count for pagination
    const countResult = await db.select({ count: sql`count(*)` }).from(articles);
    const total = parseInt(countResult[0]?.count || 0);

    // Transform to API format
    const apiArticles = dbArticles.map(a => ({
      id: a.id,
      title: a.title,
      titleSv: a.titleSv,
      summarySv: a.summarySv,
      description: a.description,
      link: a.link,
      imageUrl: a.imageUrl,
      pubDate: a.pubDate?.toISOString(),
      createdAt: a.createdAt?.toISOString(),
      source: a.sourceName,
      sourceCode: a.sourceCode,
      author: a.author,
      category: a.category,
      region: a.region,
      readingTime: a.readingTime ? `${a.readingTime} min` : null,
      isBreaking: a.isBreaking,
      isTranslated: a.isTranslated
    }));

    // Fallback to mock data if database is empty
    if (apiArticles.length === 0 && safeOffset === 0) {
      console.log('No articles in database - using mock data');
      const paginatedData = paginate(swedishMockArticles, safeLimit, safeOffset);
      return res.json({ status: 'success', data: paginatedData });
    }

    res.json({
      status: 'success',
      data: {
        articles: apiArticles,
        pagination: {
          total,
          limit: safeLimit,
          offset: safeOffset,
          hasMore: safeOffset + safeLimit < total
        }
      }
    });
  } catch (error) {
    console.error('Error fetching news:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/news/search
 * Search articles by query
 */
app.get('/api/news/search', async (req, res) => {
  try {
    const { q, limit = 20, offset = 0, lang = 'sv' } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query must be at least 2 characters'
      });
    }

    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const safeOffset = parseInt(offset) || 0;
    const searchTerm = `%${q.trim()}%`;

    // Search in both Swedish and English titles/summaries
    const searchResults = await db
      .select()
      .from(articles)
      .where(
        or(
          ilike(articles.title, searchTerm),
          ilike(articles.titleSv, searchTerm),
          ilike(articles.description, searchTerm),
          ilike(articles.summarySv, searchTerm)
        )
      )
      .orderBy(desc(articles.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

    // Transform to API format
    const apiArticles = searchResults.map(a => ({
      id: a.id,
      title: a.title,
      titleSv: a.titleSv,
      summarySv: a.summarySv,
      description: a.description,
      link: a.link,
      imageUrl: a.imageUrl,
      pubDate: a.pubDate?.toISOString(),
      createdAt: a.createdAt?.toISOString(),
      source: a.sourceName,
      sourceCode: a.sourceCode,
      author: a.author,
      category: a.category,
      region: a.region,
      readingTime: a.readingTime ? `${a.readingTime} min` : null,
      isBreaking: a.isBreaking,
      isTranslated: a.isTranslated
    }));

    res.json({
      status: 'success',
      data: {
        articles: apiArticles,
        pagination: {
          total: apiArticles.length,
          limit: safeLimit,
          offset: safeOffset,
          hasMore: apiArticles.length === safeLimit
        }
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/news/refresh
 * Manually trigger a background refresh
 */
app.post('/api/news/refresh', async (req, res) => {
  refreshNews();
  res.json({ status: 'success', message: 'Refresh triggered' });
});

/**
 * GET /api/news/:id/explain
 * Get an AI-powered background explanation for an article
 */
app.get('/api/news/:id/explain', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `article_sv_${id}`;
    const article = cache.get(cacheKey);
    
    if (!article) {
      return res.status(404).json({ status: 'error', message: 'Article not found or not yet processed' });
    }
    
    const explanationKey = `explain_${id}`;
    let explanation = cache.get(explanationKey);
    
    if (!explanation) {
      explanation = await explainTopic(article.titleSv || article.title, article.summarySv || article.description, article.category);
      cache.set(explanationKey, explanation, 3600);
    }
    
    res.json({ status: 'success', data: { explanation } });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/sources
 * Get all available news sources from DB
 */
app.get('/api/sources', async (req, res) => {
  try {
    const sources = await db.select().from(rssSources).where(eq(rssSources.isActive, true));
    
    res.json({
      status: 'success',
      data: {
        sources: sources,
        total: sources.length
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * GET /api/stats
 * Get API statistics from DB
 */
app.get('/api/stats', async (req, res) => {
  try {
    const sources = await db.select().from(rssSources);
    const regions = {};
    const categories = {};
    
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
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================
// ADMIN AUTH ROUTES
// ============================================

/**
 * POST /api/admin/login
 * Basic password authentication
 */
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }
    
    // If user needs to change password
    if (user.forcePasswordChange) {
      return res.json({ 
        status: 'success', 
        message: 'Password change required', 
        requirePasswordChange: true,
        token: generateToken(user) 
      });
    }
    
    // If TOTP is enabled, require 2FA
    if (user.totpEnabled) {
      return res.json({ 
        status: 'success', 
        message: '2FA required', 
        require2FA: true,
        tempToken: generateToken(user)
      });
    }
    
    // Full login successful
    const token = generateToken(user);
    res.json({ 
      status: 'success', 
      token,
      user: {
        email: user.email,
        isSuperAdmin: user.isSuperAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/admin/2fa/verify
 * Verify TOTP token
 */
app.post('/api/admin/2fa/verify', async (req, res) => {
  try {
    const { token, code } = req.body;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "default_secret_change_me_in_prod");
    
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, decoded.id)).limit(1);
    
    if (!user || !user.totpSecret) {
      return res.status(400).json({ status: 'error', message: '2FA not set up for this user' });
    }
    
    const isValid = verify2FA(user.totpSecret, code);
    if (!isValid) {
      return res.status(401).json({ status: 'error', message: 'Invalid 2FA code' });
    }
    
    // 2FA successful
    const authToken = generateToken(user);
    res.json({ 
      status: 'success', 
      token: authToken,
      user: {
        email: user.email,
        isSuperAdmin: user.isSuperAdmin
      }
    });
  } catch (error) {
    res.status(401).json({ status: 'error', message: 'Invalid session' });
  }
});

// ============================================
// CONFIGURATION MANAGEMENT (Protected)
// ============================================

/**
 * GET /api/admin/sources
 * List all sources from database
 */
app.get('/api/admin/sources', authenticateAdmin, async (req, res) => {
  try {
    const sources = await db.select().from(rssSources);
    res.json({ status: 'success', data: sources });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/admin/sources
 * Add a new news source
 */
app.post('/api/admin/sources', authenticateAdmin, async (req, res) => {
  try {
    const sourceData = req.body;
    await db.insert(rssSources).values({
      ...sourceData,
      updatedAt: new Date()
    });
    res.json({ status: 'success', message: 'Source added' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🚀 Global Intelligence News API (v2)');
  console.log('='.repeat(50));
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ AI Background Worker: Active`);
  console.log('='.repeat(50));
});

module.exports = app;
