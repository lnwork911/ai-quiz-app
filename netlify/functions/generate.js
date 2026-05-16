import OpenAI from "openai";
import { Redis } from "@upstash/redis";
import crypto from "crypto";
import { parseStoredValue } from "./redisValue.js";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event) {
  try {
    // Parse request body safely
    const body = JSON.parse(event.body || "{}");
    const { source, userId, difficulty = "medium", classId = "default" } = body;

    // Basic validation
    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing userId" })
      };
    }

    if (!source) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing source text" })
      };
    }

    // Check environment variables
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OPENAI_API_KEY missing" })
      };
    }

    // Check user exists
    const userRaw = await redis.get(`users:${userId}`);

    if (!userRaw) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "User not initialized" })
      };
    }

    const user = parseStoredValue(userRaw);

    // Role check
    if (user.role !== "teacher") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Only teachers can generate quizzes" })
      };
    }

    // Quiz reuse detection
    const hash = crypto
      .createHash("sha256")
      .update(source + difficulty)
      .digest("hex");

    const existingQuiz = await redis.get(`quizHash:${hash}`);

    if (existingQuiz) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          quiz: parseStoredValue(existingQuiz),
          reused: true
        })
      };
    }

    // Call OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const prompt = `
Create 10 ${difficulty} difficulty multiple choice questions.

Rules:
- Do not cut sentences.
- Each question must test understanding.
- Provide 4 answer options.
- Include correctIndex (0–3).
- Include short explanation.

Return STRICT JSON:

{
  "questions": [
    {
      "question": "",
      "options": ["", "", "", ""],
      "correctIndex": 0,
      "explanation": ""
    }
  ]
}

Text:
${source}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }]
    });

    // SAFE JSON PARSING
    let parsed;
    const message = completion.choices[0].message;

    if (typeof message.content === "string") {
      const cleaned = message.content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      parsed = JSON.parse(cleaned);
    } else if (typeof message.content === "object") {
      parsed = message.content;
    } else {
      throw new Error("Unexpected OpenAI response format");
    }

    // Store quiz for reuse
    await redis.set(`quizHash:${hash}`, parsed);
    await redis.rpush(`classQuizzes:${classId}`, hash);

    return {
      statusCode: 200,
      body: JSON.stringify({
        quiz: parsed,
        reused: false
      })
    };

  } catch (error) {
    console.error("Generate Error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
}