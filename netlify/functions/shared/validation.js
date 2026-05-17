/**
 * Lightweight request validation (no extra dependencies).
 * Keeps inputs predictable for OpenAI prompts and Redis cache keys.
 */

const TOPIC_MAX = 500;
const GRADE_MAX = 80;

/**
 * @param {unknown} value
 * @returns {string}
 */
function asTrimmedString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Validates quiz generation payload from the client.
 * @param {unknown} rawBody Parsed JSON body
 * @returns {{ topic: string, gradeLevel: string, questionCount: number, difficulty: 'easy'|'medium'|'hard' }}
 */
function validateGenerateQuizBody(rawBody) {
  if (!rawBody || typeof rawBody !== "object") {
    const err = new Error("Invalid JSON body");
    err.statusCode = 400;
    throw err;
  }

  const body = /** @type {Record<string, unknown>} */ (rawBody);

  const topic = asTrimmedString(body.topic);
  if (!topic || topic.length > TOPIC_MAX) {
    const err = new Error(
      `topic is required and must be 1–${TOPIC_MAX} characters`
    );
    err.statusCode = 400;
    throw err;
  }

  const gradeLevel = asTrimmedString(body.gradeLevel);
  if (!gradeLevel || gradeLevel.length > GRADE_MAX) {
    const err = new Error(
      `gradeLevel is required and must be 1–${GRADE_MAX} characters`
    );
    err.statusCode = 400;
    throw err;
  }

  const rawCount = body.questionCount;
  const questionCount =
    typeof rawCount === "number"
      ? rawCount
      : typeof rawCount === "string"
        ? parseInt(rawCount, 10)
        : NaN;

  if (!Number.isFinite(questionCount) || questionCount < 1 || questionCount > 20) {
    const err = new Error("questionCount must be an integer from 1 to 20");
    err.statusCode = 400;
    throw err;
  }

  const difficultyRaw = asTrimmedString(body.difficulty).toLowerCase();
  const allowed = ["easy", "medium", "hard"];
  const difficulty = /** @type {'easy'|'medium'|'hard'} */ (
    allowed.includes(difficultyRaw) ? difficultyRaw : "medium"
  );

  return { topic, gradeLevel, questionCount, difficulty };
}

const CHECKOUT_PLANS = ["starter", "pro", "school"];

/**
 * Validates Stripe checkout payload (subscription checkout session).
 * @param {unknown} rawBody
 * @returns {{ plan: 'starter'|'pro'|'school' }}
 */
function validateCheckoutBody(rawBody) {
  if (!rawBody || typeof rawBody !== "object") {
    const err = new Error("Invalid JSON body");
    err.statusCode = 400;
    throw err;
  }

  const body = /** @type {Record<string, unknown>} */ (rawBody);
  const action = asTrimmedString(body.action).toLowerCase();
  if (action !== "create_checkout_session") {
    const err = new Error("Unknown action");
    err.statusCode = 400;
    throw err;
  }

  const planRaw = asTrimmedString(body.plan).toLowerCase();
  if (!CHECKOUT_PLANS.includes(planRaw)) {
    const err = new Error(
      `plan must be one of: ${CHECKOUT_PLANS.join(", ")}`
    );
    err.statusCode = 400;
    throw err;
  }

  return { plan: /** @type {'starter'|'pro'|'school'} */ (planRaw) };
}

module.exports = {
  validateGenerateQuizBody,
  validateCheckoutBody,
};
