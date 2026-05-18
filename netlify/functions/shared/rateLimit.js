/**
 * rateLimit.js — Redis-backed per-window counters for guest / free / paid tiers.
 *
 * Beginners: without Redis configured, we skip limiting (dev-friendly) but log once.
 */

import crypto from "crypto";

/** @typedef {'guest'|'free'|'paid'} RateTier */

/**
 * Extract client IP from Netlify / common proxy headers.
 * @param {import('@netlify/functions').HandlerEvent} event
 */
export function getClientIp(event) {
  const h = event.headers || {};
  const xf = h["x-forwarded-for"] || h["X-Forwarded-For"];
  if (typeof xf === "string" && xf.length) {
    return xf.split(",")[0].trim().slice(0, 64);
  }
  const rip = h["client-ip"] || h["x-real-ip"];
  if (typeof rip === "string" && rip.length) return rip.trim().slice(0, 64);
  return "unknown";
}

/**
 * Pull Bearer token from Authorization header.
 * @param {import('@netlify/functions').HandlerEvent} event
 */
export function getBearerToken(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization;
  if (typeof raw !== "string" || !raw.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return raw.slice(7).trim();
}

/**
 * Verify HS256 JWT (Netlify Identity / GoTrue style) and return payload or null.
 * Set IDENTITY_JWT_SECRET in Netlify env to match your Identity JWT secret.
 * @param {string} token
 * @param {string} secret
 */
export function verifyJwtHs256Payload(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h64, p64, sig] = parts;
  try {
    const data = `${h64}.${p64}`;
    const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const header = JSON.parse(Buffer.from(h64, "base64url").toString("utf8"));
    if (!header || header.alg !== "HS256") return null;
    const payload = JSON.parse(Buffer.from(p64, "base64url").toString("utf8"));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Decide subscription tier from JWT claims (customize for your billing metadata).
 * @param {Record<string, unknown> | null} payload
 * @returns {RateTier}
 */
export function tierFromJwtPayload(payload) {
  if (!payload) return "guest";
  const meta = /** @type {Record<string, unknown>} */ (payload.app_metadata || {});
  const plan = typeof meta.plan === "string" ? meta.plan.toLowerCase() : "";
  const tier = typeof meta.subscription_tier === "string" ? meta.subscription_tier.toLowerCase() : "";
  if (plan === "paid" || plan === "pro" || plan === "school" || tier === "paid" || tier === "pro") {
    return "paid";
  }
  return "free";
}

/**
 * Build Redis rate-limit key for this window.
 * @param {RateTier} tier
 * @param {string} identityKey — user sub hash or guest ip hash
 */
export function rateLimitRedisKey(tier, identityKey) {
  const windowBucket = Math.floor(Date.now() / 1000 / 3600);
  return `rl:v1:${tier}:${windowBucket}:${identityKey}`;
}

/**
 * Hash a string to fixed length for Redis key components (avoid storing raw PII in keys).
 * @param {string} s
 */
export function hashKeyPart(s) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}

/**
 * Resolve tier + stable identity key for counters.
 * @param {import('@netlify/functions').HandlerEvent} event
 */
export function resolveRateIdentity(event) {
  const secret = process.env.IDENTITY_JWT_SECRET || process.env.JWT_SECRET || "";
  const token = getBearerToken(event);
  if (!token) {
    const ip = getClientIp(event);
    return { tier: /** @type {RateTier} */ ("guest"), key: hashKeyPart(`guest:${ip}`) };
  }
  const payload = verifyJwtHs256Payload(token, secret);
  if (payload && typeof payload.sub === "string") {
    const t = tierFromJwtPayload(payload);
    const tier = t === "paid" ? "paid" : "free";
    return { tier: /** @type {RateTier} */ (tier), key: hashKeyPart(`user:${payload.sub}`) };
  }
  // Bearer present but JWT not verified (missing/wrong secret): separate bucket from IP guests.
  return { tier: "free", key: hashKeyPart(`opaque:${hashKeyPart(token)}`) };
}

/**
 * Read tier limits from env with safe defaults.
 */
export function limitsForTier(tier) {
  const defaults = { guest: 8, free: 40, paid: 400 };
  const envMap = {
    guest: parseInt(process.env.RATE_LIMIT_GUEST_PER_HOUR || "", 10),
    free: parseInt(process.env.RATE_LIMIT_FREE_PER_HOUR || "", 10),
    paid: parseInt(process.env.RATE_LIMIT_PAID_PER_HOUR || "", 10),
  };
  const max = Number.isFinite(envMap[tier]) && envMap[tier] > 0 ? envMap[tier] : defaults[tier];
  const windowSeconds = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || "3600", 10) || 3600;
  return { max, windowSeconds };
}

/**
 * Increment counter; return { allowed, current, retryAfterSeconds }.
 * @param {import('@upstash/redis').Redis | null} redis
 * @param {RateTier} tier
 * @param {string} identityKey
 */
export async function consumeRateLimitToken(redis, tier, identityKey) {
  const { max, windowSeconds } = limitsForTier(tier);
  if (!redis) {
    return { allowed: true, current: 0, max, retryAfterSeconds: 0, skipped: true };
  }
  const key = rateLimitRedisKey(tier, identityKey);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }
  if (count > max) {
    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      current: count,
      max,
      retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      skipped: false,
    };
  }
  return { allowed: true, current: count, max, retryAfterSeconds: 0, skipped: false };
}
