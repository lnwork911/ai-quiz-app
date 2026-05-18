/**
 * validation.js — HTTP body validation + strict Ajv JSON Schema for quiz payloads.
 *
 * Beginners: the server never trusts the model; we validate shape before caching/serving.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

const QUIZ_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "title", "difficultyLevel", "questions"],
  properties: {
    schemaVersion: { type: "integer", const: 2 },
    title: { type: "string", minLength: 1, maxLength: 200 },
    difficultyLevel: { type: "integer", minimum: 1, maximum: 5 },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 25,
      items: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "type",
              "stem",
              "options",
              "correctIndex",
              "explanation",
              "feedbackCorrect",
              "feedbackIncorrect",
            ],
            properties: {
              id: { type: "string", maxLength: 40 },
              type: { const: "mcq" },
              stem: { type: "string", minLength: 1, maxLength: 900 },
              options: {
                type: "array",
                minItems: 4,
                maxItems: 4,
                items: { type: "string", minLength: 1, maxLength: 400 },
              },
              correctIndex: { type: "integer", minimum: 0, maximum: 3 },
              explanation: { type: "string", minLength: 1, maxLength: 450 },
              feedbackCorrect: { type: "string", minLength: 1, maxLength: 220 },
              feedbackIncorrect: { type: "string", minLength: 1, maxLength: 220 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "type",
              "stem",
              "correctBoolean",
              "explanation",
              "feedbackCorrect",
              "feedbackIncorrect",
            ],
            properties: {
              id: { type: "string", maxLength: 40 },
              type: { const: "true_false" },
              stem: { type: "string", minLength: 1, maxLength: 900 },
              correctBoolean: { type: "boolean" },
              explanation: { type: "string", minLength: 1, maxLength: 450 },
              feedbackCorrect: { type: "string", minLength: 1, maxLength: 220 },
              feedbackIncorrect: { type: "string", minLength: 1, maxLength: 220 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "type",
              "stem",
              "acceptableAnswers",
              "caseInsensitive",
              "explanation",
              "feedbackCorrect",
              "feedbackIncorrect",
            ],
            properties: {
              id: { type: "string", maxLength: 40 },
              type: { const: "short_answer" },
              stem: { type: "string", minLength: 1, maxLength: 900 },
              acceptableAnswers: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: { type: "string", minLength: 1, maxLength: 200 },
              },
              caseInsensitive: { type: "boolean" },
              explanation: { type: "string", minLength: 1, maxLength: 450 },
              feedbackCorrect: { type: "string", minLength: 1, maxLength: 220 },
              feedbackIncorrect: { type: "string", minLength: 1, maxLength: 220 },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: [
              "id",
              "type",
              "stem",
              "blanks",
              "caseInsensitive",
              "explanation",
              "feedbackCorrect",
              "feedbackIncorrect",
            ],
            properties: {
              id: { type: "string", maxLength: 40 },
              type: { const: "fill_blank" },
              stem: { type: "string", minLength: 1, maxLength: 900 },
              blanks: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["answers"],
                  properties: {
                    answers: {
                      type: "array",
                      minItems: 1,
                      maxItems: 8,
                      items: { type: "string", minLength: 1, maxLength: 120 },
                    },
                    alternatives: {
                      type: "array",
                      maxItems: 12,
                      items: { type: "string", minLength: 1, maxLength: 120 },
                    },
                  },
                },
              },
              caseInsensitive: { type: "boolean" },
              explanation: { type: "string", minLength: 1, maxLength: 450 },
              feedbackCorrect: { type: "string", minLength: 1, maxLength: 220 },
              feedbackIncorrect: { type: "string", minLength: 1, maxLength: 220 },
            },
          },
        ],
      },
    },
  },
};

const validateQuizAjv = ajv.compile(QUIZ_JSON_SCHEMA);

const ALLOWED_TYPES = ["mcq", "true_false", "short_answer", "fill_blank"];

/**
 * Count "_____" placeholders in fill-blank stem.
 * @param {string} stem
 */
export function countFillBlankSlots(stem) {
  if (typeof stem !== "string") return 0;
  const re = /_____/g;
  let m;
  let c = 0;
  while ((m = re.exec(stem)) !== null) c++;
  return c;
}

/**
 * Extra semantic checks Ajv cannot express cheaply.
 * @param {unknown} data
 */
export function semanticQuizChecks(data) {
  if (!data || typeof data !== "object") return "Quiz is not an object";
  const quiz = /** @type {Record<string, unknown>} */ (data);
  const questions = quiz.questions;
  if (!Array.isArray(questions)) return "questions not array";
  const ids = new Set();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object") return `Question ${i} invalid`;
    const o = /** @type {Record<string, unknown>} */ (q);
    const id = o.id;
    if (typeof id === "string") {
      if (ids.has(id)) return `Duplicate id ${id}`;
      ids.add(id);
    }
    if (o.type === "fill_blank") {
      const stem = typeof o.stem === "string" ? o.stem : "";
      const blanks = Array.isArray(o.blanks) ? o.blanks : [];
      const slots = countFillBlankSlots(stem);
      if (slots === 0) return `fill_blank ${i}: stem needs _____ placeholders`;
      if (blanks.length !== slots) {
        return `fill_blank ${i}: blanks length ${blanks.length} != placeholder count ${slots}`;
      }
    }
    if (o.type === "mcq" && Array.isArray(o.options)) {
      const opts = o.options.map(String);
      const sset = new Set(opts.map((x) => x.toLowerCase().trim()));
      if (sset.size !== opts.length) return `mcq ${i}: options must be distinct`;
    }
  }
  return null;
}

/**
 * Validate quiz object against JSON Schema + semantic rules.
 * @param {unknown} data
 * @returns {{ ok: true, quiz: object } | { ok: false, error: string }}
 */
export function validateQuizPayload(data) {
  if (!validateQuizAjv(data)) {
    const msg = ajv.errorsText(validateQuizAjv.errors, { separator: " | " });
    return { ok: false, error: msg || "Schema validation failed" };
  }
  const sem = semanticQuizChecks(data);
  if (sem) return { ok: false, error: sem };
  return { ok: true, quiz: /** @type {object} */ (data) };
}

/**
 * Validate replacement questions array (same item schema as quiz.questions items).
 * @param {unknown} data
 */
export function validateQuestionsArray(data) {
  if (!Array.isArray(data)) return { ok: false, error: "Expected array" };
  const itemSchema = /** @type {any} */ (QUIZ_JSON_SCHEMA.properties.questions).items;
  const checkOne = ajv.compile(itemSchema);
  for (let i = 0; i < data.length; i++) {
    if (!checkOne(data[i])) {
      return {
        ok: false,
        error: `Item ${i}: ${ajv.errorsText(checkOne.errors, { separator: " | " })}`,
      };
    }
    const sem = semanticQuizChecks({ schemaVersion: 2, title: "x", difficultyLevel: 3, questions: [data[i]] });
    if (sem) return { ok: false, error: `Item ${i}: ${sem}` };
  }
  return { ok: true, questions: data };
}

/**
 * @typedef {{
 *   topic: string,
 *   gradeLevel: string,
 *   questionCount: number,
 *   difficultyLevel: number,
 *   questionTypes: string[],
 *   adaptive: { weakTopics?: string[], lastScorePercent?: number } | null,
 * }} NormalizedGenerateParams
 */

/**
 * Validate incoming HTTP JSON body for quiz generation.
 * @param {unknown} body
 * @returns {{ ok: true, params: NormalizedGenerateParams } | { ok: false, error: string }}
 */
export function validateGenerateQuizBody(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = /** @type {Record<string, unknown>} */ (body);
  const rawTopic =
    (typeof b.topic === "string" && b.topic) ||
    (typeof b.source === "string" && b.source) ||
    (typeof b.sourceMaterial === "string" && b.sourceMaterial) ||
    "";
  const topic = rawTopic.trim();
  if (!topic) return { ok: false, error: "Missing topic (or legacy field source)" };

  const gradeLevel =
    typeof b.gradeLevel === "string" && b.gradeLevel.trim()
      ? b.gradeLevel.trim().slice(0, 80)
      : "General";

  const questionCount = Number(b.questionCount);
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 20) {
    return { ok: false, error: "questionCount must be integer 1-20" };
  }

  const difficultyLevel = Number(b.difficultyLevel);
  if (!Number.isInteger(difficultyLevel) || difficultyLevel < 1 || difficultyLevel > 5) {
    return { ok: false, error: "difficultyLevel must be integer 1-5" };
  }

  let questionTypes = b.questionTypes;
  if (!Array.isArray(questionTypes) || questionTypes.length === 0) {
    questionTypes = ["mcq"];
  }
  const types = [];
  for (const t of questionTypes) {
    if (typeof t !== "string") return { ok: false, error: "questionTypes must be strings" };
    if (!ALLOWED_TYPES.includes(t)) {
      return { ok: false, error: `Invalid question type: ${t}` };
    }
    types.push(t);
  }
  if (types.length > 4) {
    return { ok: false, error: "At most 4 distinct questionTypes entries" };
  }

  let adaptive = null;
  if (b.adaptive && typeof b.adaptive === "object") {
    const a = /** @type {Record<string, unknown>} */ (b.adaptive);
    const weakTopics = Array.isArray(a.weakTopics)
      ? a.weakTopics.filter((x) => typeof x === "string").map((x) => String(x).slice(0, 120)).slice(0, 10)
      : [];
    const lastScorePercent =
      typeof a.lastScorePercent === "number" && Number.isFinite(a.lastScorePercent)
        ? a.lastScorePercent
        : undefined;
    adaptive = { weakTopics, lastScorePercent };
  }

  return {
    ok: true,
    params: {
      topic: topic.slice(0, 12000),
      gradeLevel,
      questionCount,
      difficultyLevel,
      questionTypes: [...new Set(types)],
      adaptive,
    },
  };
}

export { QUIZ_JSON_SCHEMA };
