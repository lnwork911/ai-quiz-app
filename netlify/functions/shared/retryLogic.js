/**
 * retryLogic.js — OpenAI call retries, JSON recovery (markdown fences, trailing commas),
 * and orchestration hooks for repair + simplified regeneration.
 *
 * Beginners: networks glitch; models slip fences — we recover in layers, not panic.
 */

import { stripPrologueEpilogue } from "./tokenOptimization.js";

/** Sleep helper for exponential backoff. */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * True if OpenAI SDK error looks transient.
 * @param {unknown} err
 */
export function isRetryableOpenAIError(err) {
  if (!err || typeof err !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (err);
  const status = o.status ?? o.statusCode;
  if (status === 429) return true;
  if (status === 408) return true;
  if (typeof status === "number" && status >= 500) return true;
  const code = o.code;
  if (code === "ECONNRESET" || code === "ETIMEDOUT") return true;
  return false;
}

/**
 * Wrap an async factory with exponential backoff (max 3 attempts total).
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseMs?: number }} opts
 */
export async function withOpenAIRetries(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseMs = opts.baseMs ?? 400;
  let lastErr = /** @type {unknown} */ (null);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableOpenAIError(err) || attempt === maxAttempts) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 120);
      await sleep(baseMs * 2 ** (attempt - 1) + jitter);
    }
  }
  throw lastErr;
}

/**
 * Remove ```json ... ``` wrappers if present.
 * @param {string} raw
 */
export function stripMarkdownFences(raw) {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```$/i, "");
  return s.trim();
}

/**
 * Best-effort removal of illegal trailing commas before } or ].
 * @param {string} jsonish
 */
export function removeTrailingCommas(jsonish) {
  if (typeof jsonish !== "string") return "";
  return jsonish.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * First-pass recovery: fences, prologue trim, trailing commas, then JSON.parse.
 * @param {string} raw
 */
export function tryParseJsonLenient(raw) {
  if (typeof raw !== "string") throw new Error("empty model output");
  let s = stripMarkdownFences(raw).trim();
  s = stripPrologueEpilogue(s);
  s = removeTrailingCommas(s);
  return JSON.parse(s);
}

/**
 * Merge OpenAI usage counters.
 * @param {Record<string, number>} acc
 * @param {Record<string, number> | undefined} add
 */
export function mergeUsage(acc, add) {
  if (!add) return acc;
  acc.prompt_tokens = (acc.prompt_tokens || 0) + (add.prompt_tokens || 0);
  acc.completion_tokens = (acc.completion_tokens || 0) + (add.completion_tokens || 0);
  acc.total_tokens = (acc.total_tokens || 0) + (add.total_tokens || 0);
  return acc;
}
