/**
 * Upstash Redis REST client for caching and future features
 * (leaderboards, rate limits, analytics aggregates, adaptive quiz state).
 *
 * Env vars (set in Netlify):
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 */

const { Redis } = require("@upstash/redis");

let redisSingleton = null;

/**
 * Returns a Redis client or null if Upstash is not configured.
 * Beginners: it's OK to deploy without Redis — quiz generation still works.
 * @returns {InstanceType<typeof Redis> | null}
 */
function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  if (!redisSingleton) {
    redisSingleton = new Redis({ url, token });
  }

  return redisSingleton;
}

/**
 * Reads a JSON value from Redis.
 * @param {string} key
 * @returns {Promise<unknown | null>}
 */
async function getJson(key) {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(key);
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

/**
 * Writes JSON to Redis with TTL (seconds).
 * @param {string} key
 * @param {unknown} value
 * @param {number} ttlSeconds
 */
async function setJson(key, value, ttlSeconds) {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
}

/**
 * Stable cache key for quiz payloads (deterministic input hash substitute).
 * @param {string} userId
 * @param {object} params
 */
function quizCacheKey(userId, params) {
  const payload = JSON.stringify({
    u: userId,
    t: params.topic,
    g: params.gradeLevel,
    n: params.questionCount,
    d: params.difficulty,
  });
  // Short key: hash would need crypto; keep readable + bounded length for Upstash keys
  const slug = Buffer.from(payload).toString("base64url").slice(0, 180);
  return `quiz:v1:${slug}`;
}

module.exports = {
  getRedis,
  getJson,
  setJson,
  quizCacheKey,
};
