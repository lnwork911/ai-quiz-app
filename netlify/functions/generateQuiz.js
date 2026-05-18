/**
 * generateQuiz.js — Production AI Quiz Generation Engine (Netlify Function).
 *
 * Flow: validate body → rate limit → cache lookup → OpenAI pipeline → duplicate repair
 * → cache set → JSON response with meta (latency, tokens, phases).
 *
 * Beginners: everything important happens here on the server so keys stay secret.
 */

import {
  validateGenerateQuizBody,
  validateQuizPayload,
} from "./shared/validation.js";
import { getRedis, getCachedQuizBothTiers, setCachedQuizBothTiers } from "./shared/cache.js";
import {
  resolveRateIdentity,
  consumeRateLimitToken,
} from "./shared/rateLimit.js";
import {
  generateValidatedQuizPipeline,
  generateSimplifiedValidatedQuiz,
  replaceDuplicateQuestions,
} from "./shared/openai.js";
import { mergeUsage } from "./shared/retryLogic.js";
import {
  findDuplicateIndexPairs,
  indicesToReplaceFromPairs,
} from "./shared/duplicateDetection.js";

/**
 * Emit one structured JSON log line (easy to grep in Netlify logs).
 * @param {Record<string, unknown>} row
 */
function slog(row) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "generateQuiz",
      ...row,
    })
  );
}

/**
 * @param {import('@netlify/functions').HandlerEvent} event
 */
export async function handler(event) {
  const t0 = Date.now();
  const requestId =
    event.headers["x-nf-request-id"] ||
    event.headers["X-NF-Request-Id"] ||
    event.headers["x-request-id"] ||
    "";

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" }, requestId, t0);
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: "Invalid JSON body" }, requestId, t0);
  }

  const skipCache = !!(body && typeof body === "object" && body.skipCache);

  const validated = validateGenerateQuizBody(body);
  if (!validated.ok) {
    slog({ level: "warn", requestId, error: "validation_failed", detail: validated.error });
    return json(400, { error: validated.error }, requestId, t0);
  }
  const params = validated.params;

  const redis = getRedis();
  const identity = resolveRateIdentity(event);
  const rl = await consumeRateLimitToken(redis, identity.tier, identity.key);
  if (!rl.allowed) {
    slog({
      level: "warn",
      requestId,
      error: "rate_limited",
      tier: identity.tier,
      current: rl.current,
      max: rl.max,
    });
    return {
      statusCode: 429,
      headers: {
        ...corsHeaders(),
        "content-type": "application/json",
        "retry-after": String(rl.retryAfterSeconds || 60),
      },
      body: JSON.stringify({
        error: "Rate limit exceeded",
        retryAfterSeconds: rl.retryAfterSeconds,
        tier: identity.tier,
        maxPerWindow: rl.max,
      }),
    };
  }

  if (!skipCache) {
    const cached = await getCachedQuizBothTiers(redis, params);
    if (cached && cached.quiz) {
      const v = validateQuizPayload(cached.quiz);
      if (v.ok) {
        const latencyMs = Date.now() - t0;
        slog({
          level: "info",
          requestId,
          outcome: "cache_hit",
          cacheTier: cached.tier,
          latencyMs,
          tier: identity.tier,
        });
        return json(
          200,
          {
            quiz: v.quiz,
            meta: {
              cached: true,
              cacheTier: cached.tier,
              latencyMs,
              requestId,
              rateLimit: { tier: identity.tier, count: rl.current, max: rl.max },
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
              phases: ["cache"],
            },
          },
          requestId,
          t0,
          false
        );
      }
    }
  }

  const usageTotal = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const phases = /** @type {string[]} */ ([]);

  try {
    let gen = await generateValidatedQuizPipeline(params);
    mergeUsage(usageTotal, gen.usage);
    phases.push(...(gen.phases || []));

    if (!gen.ok) {
      slog({
        level: "warn",
        requestId,
        error: "primary_pipeline_failed",
        detail: gen.error,
      });
      const simple = await generateSimplifiedValidatedQuiz(params);
      mergeUsage(usageTotal, simple.usage);
      phases.push(...(simple.phases || []));
      if (!simple.ok) {
        slog({
          level: "error",
          requestId,
          error: "simplified_failed",
          detail: simple.error,
        });
        return json(
          422,
          {
            error: "Unable to generate a valid quiz",
            detail: simple.error,
            meta: {
              cached: false,
              latencyMs: Date.now() - t0,
              requestId,
              usage: usageTotal,
              phases,
            },
          },
          requestId,
          t0
        );
      }
      gen = simple;
    }

    let quiz = gen.quiz;
    for (let round = 0; round < 2; round++) {
      const pairs = findDuplicateIndexPairs(
        /** @type {Array<Record<string, unknown>>} */ (quiz.questions)
      );
      if (pairs.length === 0) break;
      const idx = indicesToReplaceFromPairs(pairs);
      slog({
        level: "info",
        requestId,
        msg: "duplicate_questions_detected",
        count: idx.length,
        round,
      });
      const rep = await replaceDuplicateQuestions(quiz, idx, params);
      mergeUsage(usageTotal, rep.usage);
      phases.push("duplicate_replace");
      if (!rep.ok) {
        slog({ level: "warn", requestId, error: "duplicate_replace_failed", detail: rep.error });
        break;
      }
      quiz = rep.quiz;
    }

    const finalCheck = validateQuizPayload(quiz);
    if (!finalCheck.ok) {
      return json(
        422,
        {
          error: "Quiz failed final validation",
          detail: finalCheck.error,
          meta: {
            cached: false,
            latencyMs: Date.now() - t0,
            requestId,
            usage: usageTotal,
            phases,
          },
        },
        requestId,
        t0
      );
    }

    if (!skipCache) {
      await setCachedQuizBothTiers(redis, params, finalCheck.quiz);
    }

    const latencyMs = Date.now() - t0;
    slog({
      level: "info",
      requestId,
      outcome: "generated",
      latencyMs,
      prompt_tokens: usageTotal.prompt_tokens,
      completion_tokens: usageTotal.completion_tokens,
      total_tokens: usageTotal.total_tokens,
      tier: identity.tier,
    });

    return json(
      200,
      {
        quiz: finalCheck.quiz,
        meta: {
          cached: false,
          latencyMs,
          requestId,
          rateLimit: { tier: identity.tier, count: rl.current, max: rl.max },
          usage: usageTotal,
          phases,
        },
      },
      requestId,
      t0,
      false
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    slog({
      level: "error",
      requestId,
      error: "unhandled_exception",
      detail: message,
    });
    return json(
      500,
      {
        error: "Server error",
        detail: message,
        meta: { latencyMs: Date.now() - t0, requestId, phases },
      },
      requestId,
      t0
    );
  }
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
  };
}

/**
 * @param {number} statusCode
 * @param {object} payload
 * @param {string} requestId
 * @param {number} t0
 * @param {boolean} [mergeLatency=true]
 */
function json(statusCode, payload, requestId, t0, mergeLatency = true) {
  const out =
    mergeLatency && payload && typeof payload === "object" && !payload.meta
      ? { ...payload, meta: { ...(payload.meta || {}), latencyMs: Date.now() - t0, requestId } }
      : mergeLatency && payload.meta
        ? {
            ...payload,
            meta: { ...payload.meta, latencyMs: Date.now() - t0, requestId },
          }
        : payload;
  return {
    statusCode,
    headers: { ...corsHeaders(), "content-type": "application/json" },
    body: JSON.stringify(out),
  };
}
