const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
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
const { db } = require('./db');
const { adminUsers, rssSources, aiPrompts, articles: articlesTable } = require('./db/schema');
const { eq, desc } = require('drizzle-orm');

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
const packageJson = require('./package.json');

app.get('/api/health', async (req, res) => {
  try {
    const sourcesCount = await db.select().from(rssSources);
    const { apiConfig } = require('./config/apiConfig');
    const aiConfigured = !!(apiConfig.deepseek.apiKey && apiConfig.deepseek.apiKey !== "no-key");

    res.json({
      status: 'success',
      message: 'Global Intelligence News API is running',
      timestamp: new Date().toISOString(),
      version: packageJson.version,
      sources: sourcesCount.length,
      backgroundWorker: 'active',
      aiTranslation: aiConfigured ? 'configured' : 'NOT CONFIGURED - set AI_INTEGRATIONS_DEEPSEEK_API_KEY'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/news
 * Get latest news (Defaulting to translated Swedish if available)
 */
app.get('/api/news', async (req, res) => {
  try {
    const { limit, offset, category, region, lang = 'sv' } = req.query;
    
    // Attempt to get the translated feed first
    const cacheKey = lang === 'sv' ? 'news_all_all_sv' : `news_${category || 'all'}_${region || 'all'}`;
    let articles = cache.get(cacheKey);
    
    if (!articles) {
      console.log('Cache miss - fetching from DB articles table');
      
      let query = db.select().from(articlesTable).orderBy(articlesTable.pubDate, "desc").limit(100);
      
      // Basic filtering
      if (category) query = query.where(eq(articlesTable.category, category));
      if (region) query = query.where(eq(articlesTable.region, region));
      
      const dbArticles = await query;
      
      if (dbArticles.length > 0) {
        // Fetch sources for name mapping
        const sources = await db.select().from(rssSources);
        const sourceMap = new Map(sources.map(s => [s.code, s.name]));

        articles = dbArticles.map(a => ({
            id: a.id, // Use real UUID
            articleHash: a.articleHash,
            title: a.title || "No Title",
            titleSv: a.titleSv || a.title || "Rubrik saknas",
            summarySv: a.summarySv || a.description || "Ingen sammanfattning tillgänglig.",
            description: a.description || "",
            link: a.link || "#",
            pubDate: a.pubDate ? a.pubDate.toISOString() : new Date().toISOString(),
            createdAt: a.createdAt ? a.createdAt.toISOString() : new Date().toISOString(),
            source: sourceMap.get(a.sourceCode) || a.sourceCode || "Unknown Source",
            sourceCode: a.sourceCode,
            author: a.author || null,
            category: a.category || "general",
            region: a.region || "global",
            readingTime: a.readingTime || "2 min",
            imageUrl: a.imageUrl || null,
            isBreaking: !!a.isBreaking,
            isTranslated: !!a.isTranslated
        }));
        
        cache.set(cacheKey, articles);
      } else {
        // Fallback to fetch from sources if DB empty (cold start)
        console.log('DB empty - triggering fetch from sources');
        // We trigger background refresh but return mock/empty for now to avoid hanging
        refreshNews(); // Async trigger
        articles = swedishMockArticles;
      }
    }
    
    const paginatedData = paginate(articles, limit, offset);
    res.json({ status: 'success', data: paginatedData });
  } catch (error) {
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
 * GET /api/test-ai
 * Test AI translation directly
 */
app.get('/api/test-ai', async (req, res) => {
  const { translateAndSummarize } = require('./aiService');
  const { apiConfig } = require('./config/apiConfig');

  try {
    const testTitle = "Tesla announces new electric vehicle";
    const testContent = "Tesla CEO Elon Musk announced today a new electric vehicle model that will cost $25,000. The car will have a range of 300 miles and will be available in 2026.";

    console.log("Testing AI with config:", {
      hasApiKey: !!apiConfig.deepseek.apiKey,
      baseUrl: apiConfig.deepseek.baseUrl,
      model: apiConfig.deepseek.model
    });

    const result = await translateAndSummarize(testTitle, testContent, "tech");

    res.json({
      status: 'success',
      config: {
        hasApiKey: !!apiConfig.deepseek.apiKey,
        keyPrefix: apiConfig.deepseek.apiKey ? apiConfig.deepseek.apiKey.substring(0, 10) + '...' : 'none',
        baseUrl: apiConfig.deepseek.baseUrl,
        model: apiConfig.deepseek.model
      },
      input: { title: testTitle, content: testContent },
      output: result,
      wasTranslated: result.title !== testTitle
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      stack: error.stack
    });
  }
});

/**
 * GET /api/news/search
 * Search articles by query
 */
app.get('/api/news/search', async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Search query must be at least 2 characters'
      });
    }

    const searchQuery = q.toLowerCase().trim();

    // Try cache first
    let articles = cache.get('news_all_all_sv');

    if (!articles) {
      // Fetch from DB if cache miss
      const sources = await db.select().from(rssSources);
      const sourceMap = new Map(sources.map(s => [s.code, s.name]));

      const dbArticles = await db
        .select()
        .from(articlesTable)
        .orderBy(articlesTable.createdAt, "desc")
        .limit(500); // Search within latest 500 articles

      articles = dbArticles.map(a => ({
        id: a.id,
        articleHash: a.articleHash,
        title: a.title || "No Title",
        titleSv: a.titleSv || a.title,
        summarySv: a.summarySv || a.description,
        description: a.description || "",
        link: a.link || "#",
        pubDate: a.pubDate ? a.pubDate.toISOString() : new Date().toISOString(),
        createdAt: a.createdAt ? a.createdAt.toISOString() : new Date().toISOString(),
        source: sourceMap.get(a.sourceCode) || a.sourceCode || "Unknown Source",
        sourceCode: a.sourceCode,
        author: a.author || null,
        category: a.category || "general",
        region: a.region || "global",
        readingTime: a.readingTime || "2 min",
        imageUrl: a.imageUrl || null,
        isBreaking: !!a.isBreaking,
        isTranslated: !!a.isTranslated
      }));
    }

    // Search in title, titleSv, description, summarySv
    const searchResults = articles.filter(article => {
      const titleMatch = (article.title || '').toLowerCase().includes(searchQuery);
      const titleSvMatch = (article.titleSv || '').toLowerCase().includes(searchQuery);
      const descMatch = (article.description || '').toLowerCase().includes(searchQuery);
      const summaryMatch = (article.summarySv || '').toLowerCase().includes(searchQuery);
      const sourceMatch = (article.source || '').toLowerCase().includes(searchQuery);

      return titleMatch || titleSvMatch || descMatch || summaryMatch || sourceMatch;
    });

    const paginatedData = paginate(searchResults, limit, offset);

    res.json({
      status: 'success',
      query: q,
      data: paginatedData
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ status: 'error', message: 'Search failed' });
  }
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
    
    // Get recent articles
    const recentArticles = await db.select().from(articlesTable).orderBy(desc(articlesTable.pubDate)).limit(50);

    // Map source names
    const sourceMap = new Map(sources.map(s => [s.code, s.name]));
    
    res.json({
      status: 'success',
      data: {
        totalSources: sources.length,
        byRegion: regions,
        byCategory: categories,
        cacheStats: cache.getStats(),
        recentArticles: recentArticles.map(a => ({
          title: a.titleSv || a.title,
          source: sourceMap.get(a.sourceCode) || a.sourceCode,
          pubDate: a.pubDate ? new Date(a.pubDate).toISOString() : null
        }))
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
// AI PROMPT MANAGEMENT (Protected)
// ============================================

/**
 * GET /api/admin/prompts
 * List all AI category prompts
 */
app.get('/api/admin/prompts', authenticateAdmin, async (req, res) => {
  try {
    const prompts = await db.select().from(aiPrompts);
    res.json({ status: 'success', data: prompts });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/admin/prompts
 * Update or create an AI prompt
 */
app.post('/api/admin/prompts', authenticateAdmin, async (req, res) => {
  try {
    const { category, prompt } = req.body;
    
    // Check if exists
    const [existing] = await db.select().from(aiPrompts).where(eq(aiPrompts.category, category)).limit(1);
    
    if (existing) {
      await db.update(aiPrompts)
        .set({ prompt, updatedAt: new Date() })
        .where(eq(aiPrompts.category, category));
    } else {
      await db.insert(aiPrompts).values({
        category,
        prompt,
        updatedAt: new Date()
      });
    }
    
    res.json({ status: 'success', message: 'Prompt sparad' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
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
 * POST /api/admin/sources/test
 * Test an RSS feed URL
 */
app.post('/api/admin/sources/test', authenticateAdmin, async (req, res) => {
  try {
    const { rssUrl } = req.body;
    if (!rssUrl) return res.status(400).json({ status: 'error', message: 'RSS URL required' });
    
    const fetch = require('node-fetch');
    const RSSParser = require('rss-parser');
    const parser = new RSSParser();
    
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml;q=0.9, */*;q=0.8'
      },
      timeout: 8000
    });
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const xml = await response.text();
    const feed = await parser.parseString(xml);
    
    res.json({ 
      status: 'success', 
      data: {
        title: feed.title,
        description: feed.description,
        itemCount: feed.items.length,
        items: feed.items.slice(0, 3).map(item => ({ title: item.title }))
      } 
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: `Test misslyckades: ${error.message}` });
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

const { ensureSchema } = require('./db/migrate');

// Start server
app.listen(PORT, '0.0.0.0', async () => {
  console.log('='.repeat(50));
  console.log(`🚀 Global Intelligence News API (v${packageJson.version})`);
  console.log('='.repeat(50));
  
  // Ensure DB Schema
  await ensureSchema();
  
  console.log(`✓ Server running on port ${PORT}`);
  console.log(`✓ AI Background Worker: Active`);
  console.log('='.repeat(50));
});

module.exports = app;
