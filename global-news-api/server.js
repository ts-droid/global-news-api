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
  verify2FA,
  createPasswordResetRequest,
  verifyResetTokenAndSetPassword,
  validateResetToken
} = require('./adminAuth');
const jwt = require('jsonwebtoken');
const { db } = require('./db');
const {
  adminUsers,
  rssSources,
  aiPrompts,
  aiStyleOverlays,
  articles,
  users,
  userCategoryPreferences,
  userLocationPreferences
} = require('./db/schema');
const { eq, desc, ilike, or, and, sql, inArray } = require('drizzle-orm');

// User authentication
const {
  authenticateUser,
  optionalAuth,
  registerWithEmail,
  loginWithEmail,
  authenticateWithApple,
  authenticateWithGoogle,
  generateTokens,
  refreshAccessToken,
  getUserById,
  getUserProfile,
  updateUserProfile,
  completeOnboarding,
  logout
} = require('./userAuth');

// Constants
const { getCategoriesArray, getCategory, getSubcategories } = require('./constants/categories');
const { getContinentsArray, getCountriesArray, searchCountries, getCountryByIso } = require('./constants/geography');

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
// PASSWORD RESET ROUTES
// ============================================

/**
 * POST /api/admin/password-reset/request
 * Request a password reset link
 */
app.post('/api/admin/password-reset/request', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required' });
    }

    const result = await createPasswordResetRequest(email);

    // Always return success to prevent email enumeration
    // In production, you would send an email here with the reset link
    if (result) {
      console.log(`[Password Reset] Reset token generated for ${email}`);
      console.log(`[Password Reset] Reset link: /admin/reset-password.html?token=${result.resetToken}`);
      // TODO: Send email with reset link
      // For now, log the token (remove in production!)
    }

    res.json({
      status: 'success',
      message: 'If an account with that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ status: 'error', message: 'Failed to process request' });
  }
});

/**
 * GET /api/admin/password-reset/validate/:token
 * Validate a reset token
 */
app.get('/api/admin/password-reset/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await validateResetToken(token);

    if (!result.valid) {
      return res.status(400).json({ status: 'error', message: result.message });
    }

    res.json({ status: 'success', email: result.email });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to validate token' });
  }
});

/**
 * POST /api/admin/password-reset/confirm
 * Set new password using reset token
 */
app.post('/api/admin/password-reset/confirm', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
    }

    const result = await verifyResetTokenAndSetPassword(token, newPassword);

    console.log(`[Password Reset] Password successfully reset for ${result.email}`);

    res.json({ status: 'success', message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Password reset confirm error:', error);
    res.status(400).json({ status: 'error', message: error.message || 'Failed to reset password' });
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

// ============================================
// USER AUTH ROUTES (for app users)
// ============================================

/**
 * POST /api/auth/register
 * Register with email/password
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required' });
    }

    const user = await registerWithEmail(email, password, name);
    const tokens = await generateTokens(user);

    res.json({
      status: 'success',
      data: {
        user: getUserProfile(user),
        ...tokens
      }
    });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/auth/login
 * Login with email/password
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required' });
    }

    const user = await loginWithEmail(email, password);
    const tokens = await generateTokens(user);

    res.json({
      status: 'success',
      data: {
        user: getUserProfile(user),
        ...tokens
      }
    });
  } catch (error) {
    res.status(401).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/auth/apple
 * Authenticate with Apple Sign-In
 */
app.post('/api/auth/apple', async (req, res) => {
  try {
    const { identityToken, user: appleUser } = req.body;

    if (!identityToken) {
      return res.status(400).json({ status: 'error', message: 'Identity token is required' });
    }

    const user = await authenticateWithApple({ identityToken, user: appleUser });
    const tokens = await generateTokens(user);

    res.json({
      status: 'success',
      data: {
        user: getUserProfile(user),
        ...tokens,
        isNewUser: !user.onboardingCompleted
      }
    });
  } catch (error) {
    res.status(401).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/auth/google
 * Authenticate with Google Sign-In
 */
app.post('/api/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ status: 'error', message: 'ID token is required' });
    }

    const user = await authenticateWithGoogle({ idToken });
    const tokens = await generateTokens(user);

    res.json({
      status: 'success',
      data: {
        user: getUserProfile(user),
        ...tokens,
        isNewUser: !user.onboardingCompleted
      }
    });
  } catch (error) {
    res.status(401).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ status: 'error', message: 'Refresh token is required' });
    }

    const tokens = await refreshAccessToken(refreshToken);

    res.json({
      status: 'success',
      data: tokens
    });
  } catch (error) {
    res.status(401).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/auth/logout
 * Logout current user
 */
app.post('/api/auth/logout', authenticateUser, async (req, res) => {
  try {
    await logout(req.user.id);
    res.json({ status: 'success', message: 'Logged out' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
app.get('/api/auth/me', authenticateUser, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }
    res.json({
      status: 'success',
      data: getUserProfile(user)
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================
// CATEGORIES & GEOGRAPHY ROUTES
// ============================================

/**
 * GET /api/categories
 * Get all categories with subcategories
 */
app.get('/api/categories', (req, res) => {
  try {
    const { lang = 'sv' } = req.query;
    const categories = getCategoriesArray(lang);

    res.json({
      status: 'success',
      data: { categories }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/categories/:code
 * Get a single category with subcategories
 */
app.get('/api/categories/:code', (req, res) => {
  try {
    const { code } = req.params;
    const { lang = 'sv' } = req.query;
    const category = getCategory(code, lang);

    if (!category) {
      return res.status(404).json({ status: 'error', message: 'Category not found' });
    }

    res.json({
      status: 'success',
      data: category
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/geography/continents
 * Get all continents
 */
app.get('/api/geography/continents', (req, res) => {
  try {
    const { lang = 'sv' } = req.query;
    const continents = getContinentsArray(lang);

    res.json({
      status: 'success',
      data: { continents }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/geography/countries
 * Get countries with optional filtering and search
 */
app.get('/api/geography/countries', (req, res) => {
  try {
    const { lang = 'sv', continent, q, limit = 200 } = req.query;

    let countries;
    if (q) {
      countries = searchCountries(q, lang, parseInt(limit));
    } else {
      countries = getCountriesArray({
        lang,
        continent,
        limit: parseInt(limit)
      });
    }

    res.json({
      status: 'success',
      data: {
        countries,
        total: countries.length
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/geography/countries/:iso
 * Get a single country by ISO code
 */
app.get('/api/geography/countries/:iso', (req, res) => {
  try {
    const { iso } = req.params;
    const { lang = 'sv' } = req.query;
    const country = getCountryByIso(iso, lang);

    if (!country) {
      return res.status(404).json({ status: 'error', message: 'Country not found' });
    }

    res.json({
      status: 'success',
      data: country
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================
// USER PREFERENCES ROUTES
// ============================================

/**
 * GET /api/user/preferences
 * Get user's category and location preferences
 */
app.get('/api/user/preferences', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get category preferences
    const categoryPrefs = await db.select()
      .from(userCategoryPreferences)
      .where(eq(userCategoryPreferences.userId, userId));

    // Get location preferences
    const locationPrefs = await db.select()
      .from(userLocationPreferences)
      .where(eq(userLocationPreferences.userId, userId));

    const homeCountry = locationPrefs.find(p => p.isHomeCountry);

    res.json({
      status: 'success',
      data: {
        categories: categoryPrefs.map(p => ({
          code: p.categoryCode,
          subcategory: p.subcategoryCode,
          notificationEnabled: p.notificationEnabled
        })),
        countries: locationPrefs.map(p => ({
          iso: p.countryIso,
          isHomeCountry: p.isHomeCountry,
          notificationEnabled: p.notificationEnabled
        })),
        homeCountry: homeCountry?.countryIso || null
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * PUT /api/user/preferences
 * Save user's preferences (categories and countries)
 */
app.put('/api/user/preferences', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { categories = [], countries = [], homeCountry } = req.body;

    // Delete existing preferences
    await db.delete(userCategoryPreferences)
      .where(eq(userCategoryPreferences.userId, userId));
    await db.delete(userLocationPreferences)
      .where(eq(userLocationPreferences.userId, userId));

    // Insert category preferences
    if (categories.length > 0) {
      const categoryValues = categories.map(cat => ({
        userId,
        categoryCode: typeof cat === 'string' ? cat : cat.code,
        subcategoryCode: typeof cat === 'object' ? cat.subcategory : null,
        isEnabled: true,
        notificationEnabled: typeof cat === 'object' ? (cat.notificationEnabled || false) : false
      }));

      await db.insert(userCategoryPreferences).values(categoryValues);
    }

    // Insert location preferences
    if (countries.length > 0 || homeCountry) {
      const countrySet = new Set(countries.map(c => typeof c === 'string' ? c : c.iso));
      if (homeCountry) countrySet.add(homeCountry);

      const locationValues = Array.from(countrySet).map(iso => ({
        userId,
        countryIso: iso,
        isHomeCountry: iso === homeCountry,
        notificationEnabled: false
      }));

      await db.insert(userLocationPreferences).values(locationValues);
    }

    res.json({
      status: 'success',
      message: 'Preferences saved'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/user/onboarding/complete
 * Mark onboarding as completed
 */
app.post('/api/user/onboarding/complete', authenticateUser, async (req, res) => {
  try {
    await completeOnboarding(req.user.id);
    res.json({
      status: 'success',
      message: 'Onboarding completed'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * PATCH /api/user/profile
 * Update user profile
 */
app.patch('/api/user/profile', authenticateUser, async (req, res) => {
  try {
    const user = await updateUserProfile(req.user.id, req.body);
    res.json({
      status: 'success',
      data: getUserProfile(user)
    });
  } catch (error) {
    res.status(400).json({ status: 'error', message: error.message });
  }
});

// ============================================
// PERSONALIZED NEWS ROUTES
// ============================================

/**
 * GET /api/news/feed
 * Get personalized news feed based on user preferences
 */
app.get('/api/news/feed', authenticateUser, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query;
    const userId = req.user.id;

    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const safeOffset = parseInt(offset) || 0;

    // Get user preferences
    const categoryPrefs = await db.select()
      .from(userCategoryPreferences)
      .where(eq(userCategoryPreferences.userId, userId));

    const locationPrefs = await db.select()
      .from(userLocationPreferences)
      .where(eq(userLocationPreferences.userId, userId));

    // Build query conditions
    let conditions = [];

    if (categoryPrefs.length > 0) {
      const categoryCodes = categoryPrefs.map(p => p.categoryCode);
      conditions.push(inArray(articles.category, categoryCodes));
    }

    if (locationPrefs.length > 0) {
      const countryCodes = locationPrefs.map(p => p.countryIso);
      conditions.push(inArray(articles.countryIso, countryCodes));
    }

    // Fetch articles
    let query = db.select().from(articles);

    if (conditions.length > 0) {
      query = query.where(or(...conditions));
    }

    const dbArticles = await query
      .orderBy(desc(articles.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

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
      subcategory: a.subcategory,
      countryIso: a.countryIso,
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
          limit: safeLimit,
          offset: safeOffset,
          hasMore: apiArticles.length === safeLimit
        }
      }
    });
  } catch (error) {
    console.error('Error fetching personalized feed:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/news/category/:code
 * Get news for a specific category
 */
app.get('/api/news/category/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { subcategory, limit = 20, offset = 0 } = req.query;

    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const safeOffset = parseInt(offset) || 0;

    let conditions = [eq(articles.category, code)];
    if (subcategory) {
      conditions.push(eq(articles.subcategory, subcategory));
    }

    const dbArticles = await db.select()
      .from(articles)
      .where(and(...conditions))
      .orderBy(desc(articles.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

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
      category: a.category,
      subcategory: a.subcategory,
      countryIso: a.countryIso,
      readingTime: a.readingTime ? `${a.readingTime} min` : null,
      isBreaking: a.isBreaking
    }));

    res.json({
      status: 'success',
      data: {
        articles: apiArticles,
        pagination: {
          limit: safeLimit,
          offset: safeOffset,
          hasMore: apiArticles.length === safeLimit
        }
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/news/country/:iso
 * Get news for a specific country
 */
app.get('/api/news/country/:iso', async (req, res) => {
  try {
    const { iso } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const safeOffset = parseInt(offset) || 0;

    const dbArticles = await db.select()
      .from(articles)
      .where(eq(articles.countryIso, iso.toUpperCase()))
      .orderBy(desc(articles.createdAt))
      .limit(safeLimit)
      .offset(safeOffset);

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
      category: a.category,
      subcategory: a.subcategory,
      countryIso: a.countryIso,
      readingTime: a.readingTime ? `${a.readingTime} min` : null,
      isBreaking: a.isBreaking
    }));

    res.json({
      status: 'success',
      data: {
        articles: apiArticles,
        pagination: {
          limit: safeLimit,
          offset: safeOffset,
          hasMore: apiArticles.length === safeLimit
        }
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================
// AI STYLE OVERLAYS ADMIN ROUTES
// ============================================

/**
 * GET /api/admin/style-overlays
 * Get all style overlays (optionally filtered by language or category)
 */
app.get('/api/admin/style-overlays', authenticateAdmin, async (req, res) => {
  try {
    const { language, category } = req.query;

    let conditions = [];
    if (language) {
      conditions.push(eq(aiStyleOverlays.language, language));
    }
    if (category) {
      conditions.push(eq(aiStyleOverlays.categoryCode, category));
    }

    let query = db.select().from(aiStyleOverlays);
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const overlays = await query.orderBy(aiStyleOverlays.categoryCode, aiStyleOverlays.language);

    res.json({
      status: 'success',
      data: overlays
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/admin/style-overlays/:categoryCode/:language
 * Get a specific style overlay
 */
app.get('/api/admin/style-overlays/:categoryCode/:language', authenticateAdmin, async (req, res) => {
  try {
    const { categoryCode, language } = req.params;

    const [overlay] = await db.select()
      .from(aiStyleOverlays)
      .where(
        and(
          eq(aiStyleOverlays.categoryCode, categoryCode),
          eq(aiStyleOverlays.language, language)
        )
      )
      .limit(1);

    if (!overlay) {
      return res.status(404).json({ status: 'error', message: 'Style overlay not found' });
    }

    res.json({
      status: 'success',
      data: overlay
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * POST /api/admin/style-overlays
 * Create a new style overlay
 */
app.post('/api/admin/style-overlays', authenticateAdmin, async (req, res) => {
  try {
    const { categoryCode, language, name, stylePrompt, description, exampleInput, exampleOutput } = req.body;

    if (!categoryCode || !language || !name || !stylePrompt) {
      return res.status(400).json({
        status: 'error',
        message: 'categoryCode, language, name, and stylePrompt are required'
      });
    }

    // Check if already exists
    const [existing] = await db.select()
      .from(aiStyleOverlays)
      .where(
        and(
          eq(aiStyleOverlays.categoryCode, categoryCode),
          eq(aiStyleOverlays.language, language)
        )
      )
      .limit(1);

    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'A style overlay for this category and language already exists'
      });
    }

    const [overlay] = await db.insert(aiStyleOverlays)
      .values({
        categoryCode,
        language,
        name,
        stylePrompt,
        description,
        exampleInput,
        exampleOutput,
        isActive: true
      })
      .returning();

    res.json({
      status: 'success',
      data: overlay,
      message: 'Style overlay created'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * PUT /api/admin/style-overlays/:id
 * Update a style overlay
 */
app.put('/api/admin/style-overlays/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, stylePrompt, description, exampleInput, exampleOutput, isActive } = req.body;

    const updates = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (stylePrompt !== undefined) updates.stylePrompt = stylePrompt;
    if (description !== undefined) updates.description = description;
    if (exampleInput !== undefined) updates.exampleInput = exampleInput;
    if (exampleOutput !== undefined) updates.exampleOutput = exampleOutput;
    if (isActive !== undefined) updates.isActive = isActive;

    const [overlay] = await db.update(aiStyleOverlays)
      .set(updates)
      .where(eq(aiStyleOverlays.id, id))
      .returning();

    if (!overlay) {
      return res.status(404).json({ status: 'error', message: 'Style overlay not found' });
    }

    res.json({
      status: 'success',
      data: overlay,
      message: 'Style overlay updated'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * DELETE /api/admin/style-overlays/:id
 * Delete a style overlay
 */
app.delete('/api/admin/style-overlays/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [deleted] = await db.delete(aiStyleOverlays)
      .where(eq(aiStyleOverlays.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ status: 'error', message: 'Style overlay not found' });
    }

    res.json({
      status: 'success',
      message: 'Style overlay deleted'
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * GET /api/style-overlay/:categoryCode/:language
 * Public endpoint to get active style overlay (for AI service)
 */
app.get('/api/style-overlay/:categoryCode/:language', async (req, res) => {
  try {
    const { categoryCode, language } = req.params;

    const [overlay] = await db.select()
      .from(aiStyleOverlays)
      .where(
        and(
          eq(aiStyleOverlays.categoryCode, categoryCode),
          eq(aiStyleOverlays.language, language),
          eq(aiStyleOverlays.isActive, true)
        )
      )
      .limit(1);

    if (!overlay) {
      // Return default style if none found
      return res.json({
        status: 'success',
        data: {
          categoryCode,
          language,
          stylePrompt: 'Inkludera specifika namn, platser och datum. Var konkret och tydlig.',
          isDefault: true
        }
      });
    }

    res.json({
      status: 'success',
      data: overlay
    });
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
