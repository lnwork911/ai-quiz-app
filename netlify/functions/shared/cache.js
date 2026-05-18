/**
 * cache.js — Upstash Redis singleton + hash-based quiz cache keys + reusable detection.
 *
 * Beginners: same inputs → same hash → same cached quiz (saves money and latency).
 */

import { Redis } from "@upstash/redis";
import crypto from "crypto";

let redisSingleton = /** @type {Redis | null} */ (null);
let redisMissingLogged = false;

/**
 * Lazily construct Redis client from env; return null if not configured.
 */
export function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!redisMissingLogged) {
      redisMissingLogged = true;
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "Redis env missing; quiz cache + some rate limits skipped",
        })
      );
    }
    return null;
  }
  if (!redisSingleton) {
    redisSingleton = new Redis({ url, token });
  }
  return redisSingleton;
}

/**
 * Canonical JSON string for stable hashing (sorted keys recursively).
 * @param {unknown} value
 */
export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = /** @type {Record<string, unknown>} */ (value);
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * Build SHA-256 hex digest for cache key material.
 * @param {string} material
 */
export function sha256Hex(material) {
  return crypto.createHash("sha256").update(material).digest("hex");
}

/**
 * Primary cache key: full generation request fingerprint (schema version bumps invalidate).
 * @param {object} normalizedParams — output of validateGenerateQuizBody
 */
export function buildQuizRequestCacheKey(normalizedParams) {
  const SCHEMA_VERSION = "v2";
  const payload = {
    sv: SCHEMA_VERSION,
    topic: normalizedParams.topic,
    gradeLevel: normalizedParams.gradeLevel,
    questionCount: normalizedParams.questionCount,
    difficultyLevel: normalizedParams.difficultyLevel,
    questionTypes: normalizedParams.questionTypes,
    adaptive: normalizedParams.adaptive,
  };
  const hash = sha256Hex(stableStringify(payload));
  return `quiz:req:${SCHEMA_VERSION}:${hash}`;
}

/**
 * Secondary “library” key: same as request key but without adaptive noise if you want broader reuse.
 * Here we omit adaptive for broader reuse across users hitting same core brief.
 * @param {object} normalizedParams
 */
export function buildQuizLibraryCacheKey(normalizedParams) {
  const SCHEMA_VERSION = "v2";
  const payload = {
    sv: SCHEMA_VERSION,
    topic: normalizedParams.topic,
    gradeLevel: normalizedParams.gradeLevel,
    questionCount: normalizedParams.questionCount,
    difficultyLevel: normalizedParams.difficultyLevel,
    questionTypes: normalizedParams.questionTypes,
  };
  const hash = sha256Hex(stableStringify(payload));
  return `quiz:lib:${SCHEMA_VERSION}:${hash}`;
}

/**
 * Read JSON from Redis.
 * @param {Redis | null} redis
 * @param {string} key
 */
export async function cacheGetJson(redis, key) {
  if (!redis) return null;
  const raw = await redis.get(key);
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw;
  return null;
}

/**
 * Write JSON with TTL.
 * @param {Redis | null} redis
 * @param {string} key
 * @param {unknown} value
 * @param {number} ttlSeconds
 */
export async function cacheSetJson(redis, key, value, ttlSeconds) {
  if (!redis) return;
  await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
}

/**
 * Try request-level cache, then library-level cache (reusable across similar requests).
 * @param {Redis | null} redis
 * @param {object} normalizedParams
 */
export async function getCachedQuizBothTiers(redis, normalizedParams) {
  const reqKey = buildQuizRequestCacheKey(normalizedParams);
  const libKey = buildQuizLibraryCacheKey(normalizedParams);
  const direct = await cacheGetJson(redis, reqKey);
  if (direct && typeof direct === "object") return { quiz: direct, tier: "request" };
  const lib = await cacheGetJson(redis, libKey);
  if (lib && typeof lib === "object") return { quiz: lib, tier: "library" };
  return null;
}

/**
 * Store quiz in both keys so future requests hit fast path + library reuse.
 * @param {Redis | null} redis
 * @param {object} normalizedParams
 * @param {object} quiz
 */
export async function setCachedQuizBothTiers(redis, normalizedParams, quiz) {
  const ttl = parseInt(process.env.QUIZ_CACHE_TTL_SECONDS || "86400", 10) || 86400;
  const reqKey = buildQuizRequestCacheKey(normalizedParams);
  const libKey = buildQuizLibraryCacheKey(normalizedParams);
  await cacheSetJson(redis, reqKey, quiz, ttl);
  await cacheSetJson(redis, libKey, quiz, ttl);
}
