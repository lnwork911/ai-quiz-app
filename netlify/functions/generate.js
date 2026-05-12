import OpenAI from "openai";
import { Redis } from "@upstash/redis";
import crypto from "crypto";

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

    // Check user exists in Redis
    const userRaw = await redis.get(`users:${userId}`);

    if (!userRaw) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "User not initialized" })
      };
    }

    const user = JSON.parse(userRaw);

    // Only teachers can generate quizzes
    if (user.role !== "teacher") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Only teachers can generate quizzes" })
      };
    }

    // Create reuse detection hash
    const hash = crypto
      .createHash("sha256")
      .update(source + difficulty)
      .digest("hex");

    // Check if quiz already exists
    const existingQuiz = await redis.get(`quizHash:${hash}`);

    if (existingQuiz) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          quiz: JSON.parse(existingQuiz),
          reused: true
        })
      };
    }

    // Ensure API key exists
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OPENAI_API_KEY missing in environment" })
      };
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Build prompt
    const prompt = `
Create 10 ${difficulty} difficulty multiple choice questions.

Rules:
- Do not cut sentences.
- Each question must test understanding.
- Provide 4 answer options.
- Include correctIndex (0–3).
- Include short explanation.

Return strict JSON format:

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

    // Safe JSON parsing (fixes [object Object] error)
    let parsed;
    const content = completion.choices[0].message.content;

    if (typeof content === "string") {
      const cleaned = content.replace(/```json|```/g, "");
      parsed = JSON.parse(cleaned);
    } else {
      parsed = content;
    }

    // Store quiz for reuse
    await redis.set(`quizHash:${hash}`, JSON.stringify(parsed));

    // Optional: store quiz under class
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