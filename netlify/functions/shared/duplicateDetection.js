/**
 * duplicateDetection.js — normalize question stems and detect near-duplicates
 * inside a quiz (and optionally compare against prior stems).
 *
 * Beginners: we compare simplified text, not raw punctuation/case.
 */

/** Lowercase, strip punctuation, collapse spaces — good for fuzzy compare. */
export function normalizeForDedupe(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into word tokens (letters/numbers). */
export function tokenize(normalized) {
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/** Jaccard similarity on two string sets (0 = disjoint, 1 = identical). */
export function jaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * True if two stems are “too similar” for the same quiz.
 * @param {string} a
 * @param {string} b
 * @param {number} threshold — default 0.86 catches paraphrases that share most words
 */
export function isNearDuplicate(a, b, threshold = 0.86) {
  const na = normalizeForDedupe(a);
  const nb = normalizeForDedupe(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ja = jaccardSimilarity(tokenize(na), tokenize(nb));
  return ja >= threshold;
}

/**
 * Extract comparable stem text from a question object (all supported types use `stem`).
 * @param {Record<string, unknown>} q
 */
export function getQuestionStem(q) {
  if (!q || typeof q !== "object") return "";
  const stem = q.stem;
  return typeof stem === "string" ? stem : "";
}

/**
 * Return pairs of indices [i,j] where i<j and questions are near-duplicates.
 * @param {Array<Record<string, unknown>>} questions
 */
export function findDuplicateIndexPairs(questions) {
  const pairs = [];
  const n = questions.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const si = getQuestionStem(questions[i]);
      const sj = getQuestionStem(questions[j]);
      if (isNearDuplicate(si, sj)) pairs.push([i, j]);
    }
  }
  return pairs;
}

/**
 * Indices that should be replaced: for each duplicate pair, keep lower index, mark higher.
 * @param {Array<[number, number]>} pairs
 * @returns {number[]}
 */
export function indicesToReplaceFromPairs(pairs) {
  const toReplace = new Set();
  for (const [i, j] of pairs) {
    toReplace.add(j);
  }
  return [...toReplace].sort((a, b) => a - b);
}

/**
 * True if any options on an MCQ are too similar to each other (weak distractors / duplicates).
 * @param {string[]} options
 */
export function hasDuplicateOptions(options) {
  if (!Array.isArray(options)) return false;
  const n = options.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (isNearDuplicate(String(options[i]), String(options[j]), 0.92)) return true;
    }
  }
  return false;
}
