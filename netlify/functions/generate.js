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
    Create 5 professional multiple choice questions from this text.
    Do NOT cut sentences.
    Provide 4 options.
    Clearly mark correct answer.
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
        quiz: completion.choices[0].message.content,
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