/**
 * openai.js — OpenAI client + quiz generation, JSON repair, simplified regen, batch replacements.
 *
 * Beginners: we always ask for json_object mode, then still parse defensively on the server.
 */

import OpenAI from "openai";
import {
  SYSTEM_PROMPT,
  buildQuizUserPrompt,
  buildJsonRepairUserPrompt,
  buildSimplifiedQuizUserPrompt,
  buildReplacementBatchPrompt,
  buildAdaptivePromptSection,
} from "./prompts.js";
import {
  buildCompactAdaptiveBlock,
  clampTopicForPrompt,
} from "./tokenOptimization.js";
import {
  mergeUsage,
  tryParseJsonLenient,
  withOpenAIRetries,
} from "./retryLogic.js";
import {
  validateQuizPayload,
  validateQuestionsArray,
} from "./validation.js";

let openaiSingleton = /** @type {OpenAI | null} */ (null);

export function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY in environment variables");
  }
  if (!openaiSingleton) {
    openaiSingleton = new OpenAI({ apiKey: key });
  }
  return openaiSingleton;
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

/**
 * Low-level chat completion forcing JSON object mode.
 * @param {{
 *   system: string,
 *   user: string,
 *   temperature?: number,
 *   maxTokens?: number,
 * }} opts
 */
export async function chatJsonObject(opts) {
  const client = getOpenAIClient();
  const model = getOpenAIModel();
  const completion = await client.chat.completions.create({
    model,
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.25,
    max_tokens: opts.maxTokens ?? 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  const text = completion.choices[0]?.message?.content || "";
  const usage = completion.usage
    ? {
        prompt_tokens: completion.usage.prompt_tokens || 0,
        completion_tokens: completion.usage.completion_tokens || 0,
        total_tokens: completion.usage.total_tokens || 0,
      }
    : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  return { text, usage, model };
}

/**
 * Primary quiz generation (single OpenAI call, wrapped with transport retries outside).
 * @param {import("./validation.js").NormalizedGenerateParams} params
 */
export async function callPrimaryQuizModel(params) {
  const adaptiveBlock = buildCompactAdaptiveBlock(params.adaptive || undefined);
  const adaptiveSection = buildAdaptivePromptSection(
    adaptiveBlock,
    params.difficultyLevel
  );
  const user = buildQuizUserPrompt({
    topic: clampTopicForPrompt(params.topic, 8000),
    gradeLevel: params.gradeLevel,
    questionCount: params.questionCount,
    difficultyLevel: params.difficultyLevel,
    questionTypes: params.questionTypes,
    adaptiveSection,
  });
  return await chatJsonObject({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0.28,
    maxTokens: 8192,
  });
}

/**
 * Repair pass: model receives broken snippet + error string.
 */
export async function callJsonRepairModel(brokenText, parseError) {
  const snippet = brokenText.length > 12000 ? brokenText.slice(0, 12000) : brokenText;
  const user = buildJsonRepairUserPrompt(snippet, parseError);
  return await chatJsonObject({
    system: "Return only fixed valid JSON. No markdown.",
    user,
    temperature: 0,
    maxTokens: 8192,
  });
}

/**
 * Simplified quiz: fewer questions, mcq-only, lower temperature.
 */
export async function callSimplifiedQuizModel(params) {
  const adaptiveBlock = buildCompactAdaptiveBlock(params.adaptive || undefined);
  const adaptiveSection = buildAdaptivePromptSection(
    adaptiveBlock,
    Math.min(3, params.difficultyLevel)
  );
  const user = buildSimplifiedQuizUserPrompt({
    topic: clampTopicForPrompt(params.topic, 8000),
    gradeLevel: params.gradeLevel,
    questionCount: params.questionCount,
    difficultyLevel: params.difficultyLevel,
    questionTypes: ["mcq"],
    adaptiveSection,
  });
  return await chatJsonObject({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0.15,
    maxTokens: 6144,
  });
}

/**
 * Ask model for replacement question objects wrapped as { items: [...] }.
 */
export async function callReplacementBatchModel(ctx) {
  const user = buildReplacementBatchPrompt(ctx);
  return await chatJsonObject({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0.35,
    maxTokens: 6144,
  });
}

/**
 * Parse model output to object with lenient recovery.
 * @param {string} text
 */
export function parseQuizJsonFromText(text) {
  return tryParseJsonLenient(text);
}

/**
 * Full pipeline: primary → (optional repair) → validate; on hard failure caller may try simplified.
 * @param {import("./validation.js").NormalizedGenerateParams} params
 */
export async function generateValidatedQuizPipeline(params) {
  const usageAcc = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const phases = /** @type {string[]} */ ([]);

  const runPrimary = async () => {
    phases.push("primary");
    const r = await withOpenAIRetries(() => callPrimaryQuizModel(params));
    mergeUsage(usageAcc, r.usage);
    let parsed;
    try {
      parsed = parseQuizJsonFromText(r.text);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phases.push("repair_after_primary");
      const fix = await withOpenAIRetries(() => callJsonRepairModel(r.text, msg));
      mergeUsage(usageAcc, fix.usage);
      parsed = parseQuizJsonFromText(fix.text);
    }
    return parsed;
  };

  let parsed = await runPrimary();
  let v = validateQuizPayload(parsed);
  if (!v.ok) {
    phases.push("repair_after_schema_fail");
    const raw = JSON.stringify(parsed).slice(0, 14000);
    const fix = await withOpenAIRetries(() => callJsonRepairModel(raw, v.error));
    mergeUsage(usageAcc, fix.usage);
    parsed = parseQuizJsonFromText(fix.text);
    v = validateQuizPayload(parsed);
  }

  if (!v.ok) {
    return { ok: false, error: v.error, usage: usageAcc, phases };
  }

  const quiz = v.quiz;
  const qArr = /** @type {unknown[]} */ (quiz.questions);
  if (qArr.length !== params.questionCount) {
    return {
      ok: false,
      error: `Expected ${params.questionCount} questions, got ${qArr.length}`,
      usage: usageAcc,
      phases,
    };
  }

  return { ok: true, quiz, usage: usageAcc, phases };
}

/**
 * Last-resort simplified regeneration path.
 * @param {import("./validation.js").NormalizedGenerateParams} params
 */
export async function generateSimplifiedValidatedQuiz(params) {
  const usageAcc = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const phases = ["simplified"];
  const r = await withOpenAIRetries(() => callSimplifiedQuizModel(params));
  mergeUsage(usageAcc, r.usage);
  let parsed;
  try {
    parsed = parseQuizJsonFromText(r.text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fix = await withOpenAIRetries(() => callJsonRepairModel(r.text, msg));
    mergeUsage(usageAcc, fix.usage);
    parsed = parseQuizJsonFromText(fix.text);
  }
  let v = validateQuizPayload(parsed);
  if (!v.ok) {
    const fix = await withOpenAIRetries(() =>
      callJsonRepairModel(JSON.stringify(parsed).slice(0, 12000), v.error)
    );
    mergeUsage(usageAcc, fix.usage);
    parsed = parseQuizJsonFromText(fix.text);
    v = validateQuizPayload(parsed);
  }
  if (!v.ok) {
    return { ok: false, error: v.error, usage: usageAcc, phases };
  }
  const quiz = v.quiz;
  const n = quiz.questions.length;
  const target = Math.min(params.questionCount, Math.max(3, Math.floor(params.questionCount / 2)));
  if (n !== target) {
    return {
      ok: false,
      error: `Simplified quiz expected ${target} questions, got ${n}`,
      usage: usageAcc,
      phases,
    };
  }
  return { ok: true, quiz, usage: usageAcc, phases };
}

/**
 * Regenerate duplicate indices and merge back into quiz object.
 * @param {object} quiz
 * @param {number[]} replaceIndices sorted unique
 * @param {import("./validation.js").NormalizedGenerateParams} params
 */
export async function replaceDuplicateQuestions(quiz, replaceIndices, params) {
  const usageAcc = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const questions = /** @type {Array<Record<string, unknown>>} */ ([...quiz.questions]);
  const forbidden = replaceIndices.map((i) => String(questions[i]?.stem || ""));
  const count = replaceIndices.length;
  const ctx = {
    topic: clampTopicForPrompt(params.topic, 8000),
    gradeLevel: params.gradeLevel,
    difficultyLevel: params.difficultyLevel,
    questionTypes: params.questionTypes,
    forbiddenStems: forbidden,
    count,
  };
  const r = await withOpenAIRetries(() => callReplacementBatchModel(ctx));
  mergeUsage(usageAcc, r.usage);
  let parsed;
  try {
    parsed = parseQuizJsonFromText(r.text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const fix = await withOpenAIRetries(() => callJsonRepairModel(r.text, msg));
      mergeUsage(usageAcc, fix.usage);
      parsed = parseQuizJsonFromText(fix.text);
    } catch {
      return {
        ok: false,
        error: "Replacement batch JSON could not be parsed",
        usage: usageAcc,
      };
    }
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
    return { ok: false, error: "Replacement batch missing items[]", usage: usageAcc };
  }
  const arrVal = validateQuestionsArray(parsed.items);
  if (!arrVal.ok) {
    return { ok: false, error: arrVal.error, usage: usageAcc };
  }
  const newOnes = arrVal.questions;
  if (newOnes.length !== count) {
    return {
      ok: false,
      error: `Replacement expected ${count} items, got ${newOnes.length}`,
      usage: usageAcc,
    };
  }
  for (let k = 0; k < replaceIndices.length; k++) {
    questions[replaceIndices[k]] = /** @type {Record<string, unknown>} */ (newOnes[k]);
  }
  const merged = { ...quiz, questions };
  const v = validateQuizPayload(merged);
  if (!v.ok) {
    return { ok: false, error: v.error, usage: usageAcc };
  }
  return { ok: true, quiz: v.quiz, usage: usageAcc };
}
