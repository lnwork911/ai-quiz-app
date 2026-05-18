/**
 * tokenOptimization.js — keep prompts and stored strings small to reduce
 * OpenAI input/output tokens and Redis payload size.
 *
 * Beginners: shorter strings = fewer tokens = lower cost and faster responses.
 */

/** Collapse repeated whitespace and trim ends (cheap “compression”). */
export function compressWhitespace(str) {
  if (typeof str !== "string") return "";
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Truncate a string to a maximum UTF-8 length (approximate) for safety caps.
 * @param {string} str
 * @param {number} maxChars
 */
export function truncateChars(str, maxChars) {
  if (typeof str !== "string") return "";
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars - 1) + "…";
}

/**
 * Clamp lesson/topic text used in prompts so huge pastes do not blow the context window.
 * @param {string} topic
 * @param {number} maxChars
 */
export function clampTopicForPrompt(topic, maxChars = 6000) {
  return truncateChars(compressWhitespace(topic || ""), maxChars);
}

/**
 * Hard-cap explanation length after model returns (saves tokens on next round if echoed).
 * @param {string} text
 * @param {number} maxWords
 */
export function capExplanationWords(text, maxWords = 80) {
  if (typeof text !== "string") return "";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ") + "…";
}

/**
 * Build a tiny “adaptive hint” block — only a few tokens vs sending full history.
 * @param {{ weakTopics?: string[], lastScorePercent?: number } | null | undefined} adaptive
 */
export function buildCompactAdaptiveBlock(adaptive) {
  if (!adaptive || typeof adaptive !== "object") return "";
  const topics = Array.isArray(adaptive.weakTopics)
    ? adaptive.weakTopics.filter((t) => typeof t === "string").slice(0, 5)
    : [];
  const score =
    typeof adaptive.lastScorePercent === "number"
      ? Math.max(0, Math.min(100, Math.round(adaptive.lastScorePercent)))
      : null;
  const parts = [];
  if (topics.length) parts.push(`Weak topics: ${topics.join(", ")}.`);
  if (score !== null) parts.push(`Last score ~${score}%.`);
  return parts.join(" ");
}

/**
 * Strip redundant prose wrappers the model might add around JSON (first pass before repair).
 * @param {string} raw
 */
export function stripPrologueEpilogue(raw) {
  if (typeof raw !== "string") return "";
  let s = raw.trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  return s;
}
