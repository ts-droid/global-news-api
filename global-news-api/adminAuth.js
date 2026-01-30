const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const qrcode = require("qrcode");
const jwt = require("jsonwebtoken");
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

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  authenticateAdmin,
  generate2FA,
  verify2FA,
};
