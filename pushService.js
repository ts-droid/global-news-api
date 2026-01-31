/**
 * Push Notification Service
 * Handles APNs (Apple Push Notification service) for iOS devices
 */

const { db } = require('./db');
const { deviceTokens } = require('./db/schema');
const { eq, and } = require('drizzle-orm');

// APNs configuration
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.tsdroid.NewsLens';
const APNS_PRODUCTION = process.env.NODE_ENV === 'production';

// Rate limiting: Max 1 push per 30 minutes for breaking news
const BREAKING_NEWS_COOLDOWN_MS = 30 * 60 * 1000;
let lastBreakingNewsPush = 0;

/**
 * Create APNs JWT token for authentication
 * Uses ES256 algorithm with the .p8 key file
 */
function createAPNsToken() {
  if (!APNS_KEY_ID || !APNS_TEAM_ID) {
    console.warn('APNs credentials not configured');
    return null;
  }

  try {
    const jwt = require('jsonwebtoken');
    const fs = require('fs');
    const path = require('path');

    // Read the .p8 key file
    const keyPath = process.env.APNS_KEY_PATH || path.join(__dirname, 'apns-key.p8');

    if (!fs.existsSync(keyPath)) {
      console.warn(`APNs key file not found at ${keyPath}`);
      return null;
    }

    const privateKey = fs.readFileSync(keyPath, 'utf8');

    const token = jwt.sign(
      {},
      privateKey,
      {
        algorithm: 'ES256',
        keyid: APNS_KEY_ID,
        issuer: APNS_TEAM_ID,
        expiresIn: '1h',
      }
    );

    return token;
  } catch (error) {
    console.error('Failed to create APNs token:', error.message);
    return null;
  }
}

/**
 * Send push notification to a single device
 */
async function sendPushToDevice(token, payload) {
  const apnsToken = createAPNsToken();
  if (!apnsToken) {
    return { success: false, error: 'APNs not configured' };
  }

  const host = APNS_PRODUCTION
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';

  const url = `https://${host}/3/device/${token}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${apnsToken}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { success: true };
    } else {
      const errorBody = await response.text();

      // Handle invalid tokens
      if (response.status === 400 || response.status === 410) {
        // Mark token as inactive
        await db.update(deviceTokens)
          .set({ isActive: false })
          .where(eq(deviceTokens.token, token));
        console.log(`Marked invalid token as inactive: ${token.substring(0, 20)}...`);
      }

      return {
        success: false,
        error: `APNs error ${response.status}: ${errorBody}`
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send breaking news push notification to all subscribed devices
 */
async function sendBreakingNewsPush(article) {
  // Rate limiting
  const now = Date.now();
  if (now - lastBreakingNewsPush < BREAKING_NEWS_COOLDOWN_MS) {
    console.log('Breaking news push rate limited, skipping');
    return { sent: 0, skipped: 'rate_limited' };
  }

  if (!article.isBreaking) {
    return { sent: 0, skipped: 'not_breaking' };
  }

  console.log(`📱 Sending breaking news push: "${article.title?.substring(0, 50)}..."`);

  // Get all active devices that want breaking news notifications
  const devices = await db.select()
    .from(deviceTokens)
    .where(and(
      eq(deviceTokens.isActive, true),
      eq(deviceTokens.notifyBreaking, true)
    ));

  if (devices.length === 0) {
    console.log('No devices registered for breaking news');
    return { sent: 0, total: 0 };
  }

  console.log(`Found ${devices.length} devices to notify`);

  // Build notification payload
  const payload = {
    aps: {
      alert: {
        title: '🔴 Breaking News',
        subtitle: article.category || 'World',
        body: article.titleSv || article.title,
      },
      sound: 'default',
      badge: 1,
      'mutable-content': 1,
      'thread-id': 'breaking-news',
    },
    articleId: article.id,
    category: article.category,
    isBreaking: true,
  };

  // Send to all devices (in parallel batches)
  const BATCH_SIZE = 50;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < devices.length; i += BATCH_SIZE) {
    const batch = devices.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(device => sendPushToDevice(device.token, payload))
    );

    for (const result of results) {
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }
  }

  lastBreakingNewsPush = now;

  console.log(`📱 Push complete: ${successCount} sent, ${failCount} failed`);

  return {
    sent: successCount,
    failed: failCount,
    total: devices.length,
  };
}

/**
 * Send a custom push notification to specific devices or all devices
 */
async function sendCustomPush(title, body, data = {}, deviceTokensList = null) {
  let devices;

  if (deviceTokensList && deviceTokensList.length > 0) {
    // Send to specific devices
    devices = await db.select()
      .from(deviceTokens)
      .where(and(
        eq(deviceTokens.isActive, true),
        // Filter by token list would require inArray
      ));
    devices = devices.filter(d => deviceTokensList.includes(d.token));
  } else {
    // Send to all active devices
    devices = await db.select()
      .from(deviceTokens)
      .where(eq(deviceTokens.isActive, true));
  }

  if (devices.length === 0) {
    return { sent: 0, total: 0 };
  }

  const payload = {
    aps: {
      alert: { title, body },
      sound: 'default',
    },
    ...data,
  };

  let successCount = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < devices.length; i += BATCH_SIZE) {
    const batch = devices.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(device => sendPushToDevice(device.token, payload))
    );

    successCount += results.filter(r => r.success).length;
  }

  return { sent: successCount, total: devices.length };
}

/**
 * Register or update a device token
 */
async function registerDevice(token, platform = 'ios', preferences = {}) {
  if (!token || token.length < 32) {
    throw new Error('Invalid device token');
  }

  const { notifyBreaking = true, preferredLanguage = 'sv', focusCountries = null } = preferences;

  try {
    // Upsert: insert or update on conflict
    await db.insert(deviceTokens).values({
      token,
      platform,
      isActive: true,
      notifyBreaking,
      preferredLanguage,
      focusCountries: focusCountries ? JSON.stringify(focusCountries) : null,
      lastUsedAt: new Date(),
    }).onConflictDoUpdate({
      target: deviceTokens.token,
      set: {
        isActive: true,
        notifyBreaking,
        preferredLanguage,
        focusCountries: focusCountries ? JSON.stringify(focusCountries) : null,
        lastUsedAt: new Date(),
      },
    });

    console.log(`✓ Registered device token: ${token.substring(0, 20)}...`);
    return { success: true };
  } catch (error) {
    console.error('Failed to register device:', error.message);
    throw error;
  }
}

/**
 * Unregister a device token
 */
async function unregisterDevice(token) {
  await db.update(deviceTokens)
    .set({ isActive: false })
    .where(eq(deviceTokens.token, token));

  console.log(`✓ Unregistered device token: ${token.substring(0, 20)}...`);
  return { success: true };
}

/**
 * Update device preferences
 */
async function updateDevicePreferences(token, preferences) {
  const updates = {};

  if (preferences.notifyBreaking !== undefined) {
    updates.notifyBreaking = preferences.notifyBreaking;
  }
  if (preferences.preferredLanguage !== undefined) {
    updates.preferredLanguage = preferences.preferredLanguage;
  }
  if (preferences.focusCountries !== undefined) {
    updates.focusCountries = preferences.focusCountries
      ? JSON.stringify(preferences.focusCountries)
      : null;
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, message: 'No changes' };
  }

  await db.update(deviceTokens)
    .set(updates)
    .where(eq(deviceTokens.token, token));

  return { success: true };
}

/**
 * Get device statistics
 */
async function getDeviceStats() {
  const allDevices = await db.select().from(deviceTokens);

  const activeDevices = allDevices.filter(d => d.isActive);
  const breakingSubscribers = activeDevices.filter(d => d.notifyBreaking);

  const platformCounts = {};
  for (const device of activeDevices) {
    platformCounts[device.platform] = (platformCounts[device.platform] || 0) + 1;
  }

  return {
    total: allDevices.length,
    active: activeDevices.length,
    inactive: allDevices.length - activeDevices.length,
    breakingSubscribers: breakingSubscribers.length,
    platforms: platformCounts,
  };
}

module.exports = {
  sendBreakingNewsPush,
  sendCustomPush,
  registerDevice,
  unregisterDevice,
  updateDevicePreferences,
  getDeviceStats,
};
