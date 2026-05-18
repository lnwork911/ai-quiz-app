/**
 * OpenAI client wrapper for quiz generation.
 * Requires OPENAI_API_KEY in Netlify environment variables.
 */

const OpenAI = require("openai");

/**
 * Lazily creates a singleton OpenAI client (cold starts reuse the module cache).
 * @returns {OpenAI}
 */
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Add it in Netlify → Site settings → Environment variables."
    );
  }

  return new OpenAI({ apiKey });
}

/**
 * Builds a strict JSON-shaped quiz using the Chat Completions API.
 * @param {{ topic: string, gradeLevel: string, questionCount: number, difficulty: string }} params
 * @returns {Promise<{ title: string, questions: Array<{ id: string, question: string, options: string[], correctIndex: number, explanation: string }> }>}
 */
async function generateQuizWithOpenAI(params) {
  const client = getOpenAIClient();

  const system = `You are an expert instructional designer for K–12 and higher education.
You write clear, age-appropriate multiple-choice questions.
You MUST respond with valid JSON only — no markdown, no prose outside JSON.`;

  const user = `Create a quiz as JSON with this exact shape:
{
  "title": string,
  "questions": [
    {
      "id": string (short unique id, e.g. "q1"),
      "question": string,
      "options": string[] (exactly 4 distinct options),
      "correctIndex": number (0-3),
      "explanation": string (1-3 sentences, why the correct answer is right)
    }
  ]
}

Constraints:
- Topic: ${params.topic}
- Grade / audience: ${params.gradeLevel}
- Difficulty: ${params.difficulty}
- Exactly ${params.questionCount} questions
- Each question must have exactly 4 options
- No duplicate questions
- Avoid trick questions; test understanding
- Keep language inclusive and classroom-safe`;

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned an empty response");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("OpenAI returned non-JSON content");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.title !== "string" ||
    !Array.isArray(parsed.questions)
  ) {
    throw new Error("OpenAI JSON did not match expected quiz shape");
  }

  /** @type {unknown[]} */
  const questions = parsed.questions;
  if (questions.length !== params.questionCount) {
    throw new Error("OpenAI returned the wrong number of questions");
  }

  /** @type {Array<{ id: string, question: string, options: string[], correctIndex: number, explanation: string }>} */
  const normalized = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object") {
      throw new Error("Invalid question object");
    }
    const obj = /** @type {Record<string, unknown>} */ (q);
    const id = typeof obj.id === "string" ? obj.id : `q${i + 1}`;
    const question = typeof obj.question === "string" ? obj.question : "";
    const options = Array.isArray(obj.options) ? obj.options.map(String) : [];
    const correctIndex =
      typeof obj.correctIndex === "number" ? obj.correctIndex : -1;
    const explanation =
      typeof obj.explanation === "string" ? obj.explanation : "";

    if (!question || options.length !== 4 || correctIndex < 0 || correctIndex > 3) {
      throw new Error("Invalid question structure from model");
    }

    normalized.push({ id, question, options, correctIndex, explanation });
  }

  return { title: parsed.title, questions: normalized };
}

module.exports = {
  getOpenAIClient,
  generateQuizWithOpenAI,
};
