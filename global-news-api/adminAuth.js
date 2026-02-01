const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { db } = require("./db");
const { adminUsers } = require("./db/schema");
const { eq } = require("drizzle-orm");

const JWT_SECRET = process.env.JWT_SECRET || "default_secret_change_me_in_prod";

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

/**
 * Verify a password using bcrypt
 */
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a JWT for an admin user
 */
function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      isSuperAdmin: user.isSuperAdmin 
    }, 
    JWT_SECRET, 
    { expiresIn: "24h" }
  );
}

/**
 * Middleware to verify JWT and check if user is admin
 */
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ status: "error", message: "Login required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ status: "error", message: "Invalid or expired session" });
    }
    req.admin = user;
    next();
  });
}

/**
 * Generate a 2FA TOTP secret and QR code
 */
async function generate2FA(email) {
  const secret = speakeasy.generateSecret({
    name: `Global News Admin (${email})`,
    issuer: "GlobalNewsAPI",
  });

  const qrImageUrl = await qrcode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,
    qrImageUrl,
    otpauthUrl: secret.otpauth_url,
  };
}

/**
 * Verify a 2FA TOTP token
 */
function verify2FA(secret, token) {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 1, // Allow 30s drift
  });
}

/**
 * Generate a secure password reset token
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a password reset request for a user
 * Returns the reset token if successful
 */
async function createPasswordResetRequest(email) {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);

  if (!user) {
    // Return null but don't reveal if email exists or not
    return null;
  }

  const resetToken = generateResetToken();
  const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  await db.update(adminUsers)
    .set({
      resetToken,
      resetTokenExpires,
      updatedAt: new Date()
    })
    .where(eq(adminUsers.id, user.id));

  return {
    resetToken,
    email: user.email,
    expires: resetTokenExpires
  };
}

/**
 * Verify a password reset token and reset the password
 */
async function verifyResetTokenAndSetPassword(token, newPassword) {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.resetToken, token)).limit(1);

  if (!user) {
    throw new Error("Invalid or expired reset token");
  }

  if (!user.resetTokenExpires || new Date() > new Date(user.resetTokenExpires)) {
    throw new Error("Reset token has expired");
  }

  const passwordHash = await hashPassword(newPassword);

  await db.update(adminUsers)
    .set({
      passwordHash,
      resetToken: null,
      resetTokenExpires: null,
      forcePasswordChange: false,
      updatedAt: new Date()
    })
    .where(eq(adminUsers.id, user.id));

  return { success: true, email: user.email };
}

/**
 * Validate a reset token without changing password
 */
async function validateResetToken(token) {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.resetToken, token)).limit(1);

  if (!user) {
    return { valid: false, message: "Invalid reset token" };
  }

  if (!user.resetTokenExpires || new Date() > new Date(user.resetTokenExpires)) {
    return { valid: false, message: "Reset token has expired" };
  }

  return { valid: true, email: user.email };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  authenticateAdmin,
  generate2FA,
  verify2FA,
  generateResetToken,
  createPasswordResetRequest,
  verifyResetTokenAndSetPassword,
  validateResetToken,
};
