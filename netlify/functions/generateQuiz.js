/**
 * generateQuiz — authenticated teachers request an AI-generated quiz.
 *
 * Also handles: { "action": "create_checkout_session", "plan": "starter"|"pro"|"school" }
 * so pricing can use one secured endpoint without adding a third function file.
 *
 * Method: POST
 * Headers: Authorization: Bearer <identity-jwt>, Content-Type: application/json
 */

const Stripe = require("stripe");
const { requireAuthUser, jsonResponse } = require("./shared/auth");
const {
  validateGenerateQuizBody,
  validateCheckoutBody,
} = require("./shared/validation");
const { generateQuizWithOpenAI } = require("./shared/openai");
const { getJson, setJson, quizCacheKey } = require("./shared/redis");

/**
 * Resolves the Stripe Price ID for a plan from environment variables.
 * @param {'starter'|'pro'|'school'} plan
 */
function priceIdForPlan(plan) {
  const map = {
    starter: process.env.STRIPE_PRICE_ID_STARTER,
    pro: process.env.STRIPE_PRICE_ID_PRO,
    school: process.env.STRIPE_PRICE_ID_SCHOOL,
  };
  return map[plan] || null;
}

/**
 * Public site URL for Stripe redirects (override in Netlify env).
 */
function siteUrl() {
  const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  return "http://localhost:8888";
}

/**
 * Redis can return 401 Unauthorized if Upstash credentials are wrong — skip cache, still generate.
 * @param {string} key
 */
async function safeGetJson(key) {
  try {
    return await getJson(key);
  } catch (e) {
    console.warn(
      JSON.stringify({
        service: "generateQuiz",
        msg: "redis_get_skipped",
        detail: e instanceof Error ? e.message : String(e),
      })
    );
    return null;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {number} ttlSeconds
 */
async function safeSetJson(key, value, ttlSeconds) {
  try {
    await setJson(key, value, ttlSeconds);
  } catch (e) {
    console.warn(
      JSON.stringify({
        service: "generateQuiz",
        msg: "redis_set_skipped",
        detail: e instanceof Error ? e.message : String(e),
      })
    );
  }
}

/**
 * True when OpenAI rejected the API key (401).
 * @param {unknown} err
 */
function isOpenAiAuthError(err) {
  if (!err || typeof err !== "object") return false;
  const o = /** @type {{ status?: number, statusCode?: number, message?: string }} */ (err);
  if (o.status === 401 || o.statusCode === 401) return true;
  const msg = typeof o.message === "string" ? o.message : String(err);
  return /401|incorrect api key|invalid api key|authentication/i.test(msg);
}

/**
 * @type {import('@netlify/functions').Handler}
 */
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  try {
    const auth = requireAuthUser(event);

    // --- Stripe checkout branch (subscriptions / billing) ---
    if (body && typeof body === "object" && "action" in body) {
      const { plan } = validateCheckoutBody(body);
      const secret = process.env.STRIPE_SECRET_KEY;
      if (!secret) {
        return jsonResponse(500, {
          error:
            "Stripe is not configured (missing STRIPE_SECRET_KEY on the server).",
        });
      }

      const priceId = priceIdForPlan(plan);
      if (!priceId) {
        return jsonResponse(500, {
          error:
            `Missing Stripe price ID env for plan "${plan}". ` +
            "Set STRIPE_PRICE_ID_STARTER, STRIPE_PRICE_ID_PRO, and/or STRIPE_PRICE_ID_SCHOOL.",
        });
      }

      const stripe = new Stripe(secret);
      const base = siteUrl();

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${base}/dashboard.html?checkout=success`,
        cancel_url: `${base}/pricing.html?checkout=cancel`,
        client_reference_id: auth.userId,
        customer_email: auth.email || undefined,
        allow_promotion_codes: true,
        metadata: {
          netlify_user_id: auth.userId,
          plan,
        },
      });

      if (!session.url) {
        return jsonResponse(500, { error: "Stripe did not return a checkout URL" });
      }

      return jsonResponse(200, { url: session.url });
    }

    // --- Quiz generation branch ---
    const params = validateGenerateQuizBody(body);

    const cacheKey = quizCacheKey(auth.userId, params);
    const ttl = parseInt(process.env.QUIZ_CACHE_TTL_SECONDS || "86400", 10);

    const cached = await safeGetJson(cacheKey);
    if (cached && typeof cached === "object") {
      return jsonResponse(200, {
        quiz: cached,
        cached: true,
      });
    }

    const quiz = await generateQuizWithOpenAI(params);
    await safeSetJson(cacheKey, quiz, ttl);

    return jsonResponse(200, {
      quiz,
      cached: false,
    });
  } catch (err) {
    const status = /** @type {{ statusCode?: number }} */ (err).statusCode || 500;
    const message =
      err instanceof Error ? err.message : "Server error";

    if (isOpenAiAuthError(err)) {
      return jsonResponse(503, {
        error:
          "OpenAI rejected the API key. Set a valid OPENAI_API_KEY in Netlify environment variables.",
        detail: message,
      });
    }

    return jsonResponse(status, { error: message });
  }
};
