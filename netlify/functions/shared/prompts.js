/**
 * prompts.js — central prompt strings and builders (single source of truth).
 * Keep wording tight: every extra sentence costs tokens on every request.
 */

/** High-level behavior + strict output contract for the model. */
export const SYSTEM_PROMPT = `You are an expert K–12 instructional designer.
Output: ONE JSON object only. No markdown fences. No commentary before or after JSON.
Use classroom-safe, inclusive language. Avoid trick questions; assess understanding.
Each question MUST include concise explanation and separate feedback strings for correct vs incorrect attempts.`;

/** JSON shape description embedded in user message (compressed but exact). */
export const QUIZ_SCHEMA = `JSON shape (schemaVersion must be 2):
{
  "schemaVersion": 2,
  "title": string,
  "difficultyLevel": integer 1-5,
  "questions": [ QUESTION ... ]
}

QUESTION one of:
A) {"id":string,"type":"mcq","stem":string,"options":[4 distinct strings],"correctIndex":0-3,"explanation":string,"feedbackCorrect":string,"feedbackIncorrect":string}
B) {"id":string,"type":"true_false","stem":string,"correctBoolean":boolean,"explanation":string,"feedbackCorrect":string,"feedbackIncorrect":string}
C) {"id":string,"type":"short_answer","stem":string,"acceptableAnswers":[1..6 strings],"caseInsensitive":boolean,"explanation":string,"feedbackCorrect":string,"feedbackIncorrect":string}
D) {"id":string,"type":"fill_blank","stem":string,"blanks":[{"answers":[strings],"alternatives":[optional strings]}],"caseInsensitive":boolean,"explanation":string,"feedbackCorrect":string,"feedbackIncorrect":string}

Rules:
- stem <= 900 chars; explanation <= 450 chars; each feedback* <= 220 chars.
- mcq: exactly 4 options; correctIndex in range.
- true_false: stem is a clear statement; correctBoolean is the truth value.
- short_answer: acceptableAnswers non-empty; synonyms allowed.
- fill_blank: stem uses "_____" for each blank in order; blanks length equals blank count.
- ids unique: q1,q2,...
- No duplicate stems (rephrase if similar).`;

/**
 * Map numeric difficulty 1–5 to a short rubric line for the model.
 * @param {number} level
 */
export function difficultyRubricLine(level) {
  const n = Math.min(5, Math.max(1, Math.round(level)));
  const lines = {
    1: "Level 1: recall & definitions; very short stems.",
    2: "Level 2: basic understanding; straightforward wording.",
    3: "Level 3: apply concept to simple novel contexts.",
    4: "Level 4: multi-step reasoning within one stem.",
    5: "Level 5: rigorous analysis/synthesis; still fair and clear.",
  };
  return lines[n];
}

/**
 * Build adaptive hint paragraph (may be empty).
 * @param {string} compactAdaptiveBlock from tokenOptimization.buildCompactAdaptiveBlock
 * @param {number} difficultyLevel
 */
export function buildAdaptivePromptSection(compactAdaptiveBlock, difficultyLevel) {
  const base = difficultyRubricLine(difficultyLevel);
  if (!compactAdaptiveBlock) return `Adaptive: none. ${base}`;
  return `Adaptive signals: ${compactAdaptiveBlock} ${base}`;
}

/**
 * Primary quiz generation user message.
 * @param {{
 *   topic: string,
 *   gradeLevel: string,
 *   questionCount: number,
 *   difficultyLevel: number,
 *   questionTypes: string[],
 *   adaptiveSection: string,
 * }} p
 */
export function buildQuizUserPrompt(p) {
  const types = p.questionTypes.join(",");
  return `${QUIZ_SCHEMA}

Task: Create a quiz.
Title: reflect topic briefly.
${p.adaptiveSection}

Inputs:
- Topic/source: ${p.topic}
- Grade/audience: ${p.gradeLevel}
- difficultyLevel (1-5): ${p.difficultyLevel}
- questionCount: exactly ${p.questionCount}
- Use ONLY these types (distribute roughly evenly round-robin in this order): ${types}

Return JSON now.`;

}

/**
 * Ask model to fix broken JSON only.
 * @param {string} brokenSnippet truncated
 * @param {string} parseError human-readable
 */
export function buildJsonRepairUserPrompt(brokenSnippet, parseError) {
  return `The following text was supposed to be ONE valid JSON object but failed: ${parseError}

Fix it to valid JSON only. Preserve meaning. No markdown. No trailing commas. Max length similar.

Broken text:
${brokenSnippet}`;
}

/**
 * Simplified regeneration: fewer types, fewer items, shorter fields — last-resort recovery.
 */
export function buildSimplifiedQuizUserPrompt(p) {
  const n = Math.min(p.questionCount, Math.max(3, Math.floor(p.questionCount / 2)));
  return `${QUIZ_SCHEMA}

SIMPLIFIED MODE (reliability over variety):
- questionCount: exactly ${n}
- types: mcq ONLY
- difficultyLevel: ${Math.min(3, p.difficultyLevel)}
Topic: ${p.topic}
Grade: ${p.gradeLevel}
${p.adaptiveSection}
Return JSON now.`;
}

/**
 * Replace specific duplicate question indices — small JSON array output.
 * @param {{
 *   topic: string,
 *   gradeLevel: string,
 *   difficultyLevel: number,
 *   questionTypes: string[],
 *   forbiddenStems: string[],
 *   count: number,
 * }} ctx
 */
export function buildReplacementBatchPrompt(ctx) {
  const forbid = ctx.forbiddenStems.slice(0, 12).join(" | ");
  return `${QUIZ_SCHEMA}

Task: Write JSON object: {"items":[ ...${ctx.count} QUESTION objects ]}.
They must NOT be near-duplicates of these stems: ${forbid}
Topic: ${ctx.topic}
Grade: ${ctx.gradeLevel}
difficultyLevel: ${ctx.difficultyLevel}
Allowed types this batch: ${ctx.questionTypes.join(",")}

Return JSON only.`;
}
