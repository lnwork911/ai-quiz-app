import OpenAI from "openai";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export async function handler(event) {
  try {

    // 
    const { source, userId } = JSON.parse(event.body);

    if (!userId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    if (!source) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No source text provided" })
      };
    }

    // Get credits from Redis
    let credits = await redis.get(`credits:${userId}`);
    if (credits === null) {
      credits = 10;
      await redis.set(`credits:${userId}`, credits);
    }

    if (credits <= 0) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "No credits remaining" })
      };
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const prompt = `
Create 10 multiple choice questions from the text.

Rules:
- Do NOT cut sentences.
- Each question must test understanding.
- 4 options per question.
- Provide correct answer letter.
- Provide short explanation for the answer.

Return STRICT JSON format like this:

{
  "questions": [
    {
      "question": "text",
      "options": ["A text", "B text", "C text", "D text"],
      "correctIndex": 1,
      "explanation": "short reason"
    }
  ]
}

Text:
${source}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: prompt }],
    });

    credits -= 1;
    await redis.set(`credits:${userId}`, credits);

    return {
      statusCode: 200,
      body: JSON.stringify({
        quiz: JSON.parse(completion.choices[0].message.content),
        remainingCredits: credits
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}