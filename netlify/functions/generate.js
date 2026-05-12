import OpenAI from "openai";
import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event) {
  const { source, userId, difficulty, classId } = JSON.parse(event.body);

  if (!userId) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const user = await redis.get(`users:${userId}`);
  if (!user) {
    await redis.set(`users:${userId}`, JSON.stringify({ role: "student" }));
  }

  const parsedUser = user ? JSON.parse(user) : { role: "student" };

  if (parsedUser.role !== "teacher") {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Only teachers can generate quizzes" })
    };
  }

  // QUIZ REUSE DETECTION
  const hash = crypto
    .createHash("sha256")
    .update(source + difficulty)
    .digest("hex");

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

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `
  Create 10 ${difficulty} difficulty multiple choice questions.
  Return strict JSON:
  {"questions":[{"question":"","options":["","","",""],"correctIndex":0,"explanation":""}]}
  Text:
  ${source}
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }]
  });

  const raw = completion.choices[0].message.content.replace(/```json|```/g, "");
  const parsed = JSON.parse(raw);

  await redis.set(`quizHash:${hash}`, JSON.stringify(parsed));
  await redis.rpush(`classQuizzes:${classId}`, hash);

  return {
    statusCode: 200,
    body: JSON.stringify({ quiz: parsed, reused: false })
  };
}