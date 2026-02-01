/**
 * User Authentication Module
 * Handles email, Apple Sign-In, and Google Sign-In for end users
 */

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { db } = require("./db");
const { users } = require("./db/schema");
const { eq, and } = require("drizzle-orm");

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || "default_secret_change_me_in_prod";
const JWT_ACCESS_EXPIRY = "15m"; // 15 minutes
const JWT_REFRESH_EXPIRY = "30d"; // 30 days
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// ============================================
// PASSWORD HASHING
// ============================================

async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// ============================================
// TOKEN GENERATION
// ============================================

/**
 * Generate an access token (short-lived)
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      type: "access"
    },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
}

/**
 * Generate a refresh token (long-lived)
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

/**
 * Generate both tokens for a user
 */
async function generateTokens(user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const refreshTokenExpires = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Store refresh token in database
  await db.update(users)
    .set({
      refreshToken,
      refreshTokenExpires,
      lastLogin: new Date(),
      updatedAt: new Date()
    })
    .where(eq(users.id, user.id));

  return {
    accessToken,
    refreshToken,
    expiresIn: 900 // 15 minutes in seconds
  };
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Middleware to verify JWT access token
 */
function authenticateUser(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ status: "error", message: "Authentication required" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ status: "error", message: "Token expired", code: "TOKEN_EXPIRED" });
      }
      return res.status(403).json({ status: "error", message: "Invalid token" });
    }

    if (decoded.type !== "access") {
      return res.status(403).json({ status: "error", message: "Invalid token type" });
    }

    req.user = decoded;
    next();
  });
}

/**
 * Optional authentication - continues even without valid token
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err || decoded.type !== "access") {
      req.user = null;
    } else {
      req.user = decoded;
    }
    next();
  });
}

// ============================================
// EMAIL AUTHENTICATION
// ============================================

/**
 * Register a new user with email/password
 */
async function registerWithEmail(email, password, name = null) {
  // Check if user exists
  const existing = await db.select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("An account with this email already exists");
  }

  // Validate password
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const passwordHash = await hashPassword(password);

  // Create user
  const [newUser] = await db.insert(users)
    .values({
      email: email.toLowerCase(),
      authProvider: "email",
      passwordHash,
      name,
      language: "sv",
      onboardingCompleted: false
    })
    .returning();

  return newUser;
}

/**
 * Login with email/password
 */
async function loginWithEmail(email, password) {
  const [user] = await db.select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (user.authProvider !== "email") {
    throw new Error(`This account uses ${user.authProvider} sign-in`);
  }

  if (!user.passwordHash) {
    throw new Error("No password set for this account");
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password");
  }

  return user;
}

// ============================================
// APPLE SIGN-IN
// ============================================

/**
 * Authenticate with Apple Sign-In
 * @param {object} appleData - { identityToken, authorizationCode, user (first time only) }
 */
async function authenticateWithApple(appleData) {
  const { identityToken, user: appleUser } = appleData;

  // In production, verify the identityToken with Apple's servers
  // For now, we'll decode it without verification (DO verify in production!)

  let decoded;
  try {
    // Decode without verification - in production use apple-signin-auth library
    decoded = jwt.decode(identityToken);
  } catch (err) {
    throw new Error("Invalid Apple identity token");
  }

  if (!decoded || !decoded.sub) {
    throw new Error("Invalid Apple identity token");
  }

  const appleUserId = decoded.sub;
  const email = decoded.email || appleUser?.email;

  if (!email) {
    throw new Error("Email is required");
  }

  // Check if user exists by Apple ID
  let [user] = await db.select()
    .from(users)
    .where(
      and(
        eq(users.authProvider, "apple"),
        eq(users.authProviderId, appleUserId)
      )
    )
    .limit(1);

  if (!user) {
    // Check if email exists with different provider
    const [existingEmail] = await db.select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingEmail) {
      throw new Error(`An account with this email already exists using ${existingEmail.authProvider}`);
    }

    // Create new user
    [user] = await db.insert(users)
      .values({
        email: email.toLowerCase(),
        authProvider: "apple",
        authProviderId: appleUserId,
        name: appleUser?.fullName?.givenName
          ? `${appleUser.fullName.givenName} ${appleUser.fullName.familyName || ""}`.trim()
          : null,
        language: "sv",
        onboardingCompleted: false
      })
      .returning();
  }

  return user;
}

// ============================================
// GOOGLE SIGN-IN
// ============================================

/**
 * Authenticate with Google Sign-In
 * @param {object} googleData - { idToken }
 */
async function authenticateWithGoogle(googleData) {
  const { idToken } = googleData;

  // In production, verify the idToken with Google's servers
  // For now, we'll decode it without verification (DO verify in production!)

  let decoded;
  try {
    decoded = jwt.decode(idToken);
  } catch (err) {
    throw new Error("Invalid Google ID token");
  }

  if (!decoded || !decoded.sub) {
    throw new Error("Invalid Google ID token");
  }

  const googleUserId = decoded.sub;
  const email = decoded.email;
  const name = decoded.name;
  const picture = decoded.picture;

  if (!email) {
    throw new Error("Email is required");
  }

  // Check if user exists by Google ID
  let [user] = await db.select()
    .from(users)
    .where(
      and(
        eq(users.authProvider, "google"),
        eq(users.authProviderId, googleUserId)
      )
    )
    .limit(1);

  if (!user) {
    // Check if email exists with different provider
    const [existingEmail] = await db.select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingEmail) {
      throw new Error(`An account with this email already exists using ${existingEmail.authProvider}`);
    }

    // Create new user
    [user] = await db.insert(users)
      .values({
        email: email.toLowerCase(),
        authProvider: "google",
        authProviderId: googleUserId,
        name,
        avatarUrl: picture,
        language: "sv",
        onboardingCompleted: false
      })
      .returning();
  } else {
    // Update avatar if changed
    if (picture && picture !== user.avatarUrl) {
      await db.update(users)
        .set({ avatarUrl: picture, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }
  }

  return user;
}

// ============================================
// TOKEN REFRESH
// ============================================

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(refreshToken) {
  const [user] = await db.select()
    .from(users)
    .where(eq(users.refreshToken, refreshToken))
    .limit(1);

  if (!user) {
    throw new Error("Invalid refresh token");
  }

  if (!user.refreshTokenExpires || new Date() > new Date(user.refreshTokenExpires)) {
    throw new Error("Refresh token expired");
  }

  return await generateTokens(user);
}

// ============================================
// USER DATA
// ============================================

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const [user] = await db.select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user || null;
}

/**
 * Get user profile (safe data)
 */
function getUserProfile(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    language: user.language,
    authProvider: user.authProvider,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt
  };
}

/**
 * Update user profile
 */
async function updateUserProfile(userId, updates) {
  const allowedFields = ["name", "language", "pushToken"];
  const safeUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      safeUpdates[field] = updates[field];
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    throw new Error("No valid fields to update");
  }

  safeUpdates.updatedAt = new Date();

  await db.update(users)
    .set(safeUpdates)
    .where(eq(users.id, userId));

  return await getUserById(userId);
}

/**
 * Mark onboarding as completed
 */
async function completeOnboarding(userId) {
  await db.update(users)
    .set({
      onboardingCompleted: true,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId));
}

/**
 * Logout - invalidate refresh token
 */
async function logout(userId) {
  await db.update(users)
    .set({
      refreshToken: null,
      refreshTokenExpires: null,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId));
}

module.exports = {
  // Password utils
  hashPassword,
  verifyPassword,

  // Token generation
  generateAccessToken,
  generateRefreshToken,
  generateTokens,

  // Middleware
  authenticateUser,
  optionalAuth,

  // Email auth
  registerWithEmail,
  loginWithEmail,

  // SSO
  authenticateWithApple,
  authenticateWithGoogle,

  // Token refresh
  refreshAccessToken,

  // User data
  getUserById,
  getUserProfile,
  updateUserProfile,
  completeOnboarding,
  logout
};
