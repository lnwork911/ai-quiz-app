/**
 * generateQuiz — authenticated teachers request an AI-generated quiz.
 *
 * Also handles: { "action": "create_checkout_session", "plan": "starter"|"pro"|"school" }
 * so pricing can use one secured endpoint without adding a third function file.
 * (You may split this into createCheckoutSession.js later as traffic grows.)
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
          error: `Missing Stripe price ID env for plan "${plan}". ` +
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

    const cached = await getJson(cacheKey);
    if (cached && typeof cached === "object") {
      return jsonResponse(200, {
        quiz: cached,
        cached: true,
      });
    }

    const quiz = await generateQuizWithOpenAI(params);
    await setJson(cacheKey, quiz, ttl);

    return jsonResponse(200, {
      quiz,
      cached: false,
    });
  } catch (err) {
    const status = /** @type {{ statusCode?: number }} */ (err).statusCode || 500;
    const message =
      status === 401
        ? "Unauthorized"
        : err instanceof Error
          ? err.message
          : "Server error";
    return jsonResponse(status, { error: message });
  }
};
