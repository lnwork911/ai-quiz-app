import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event) {
  const { userId, email } = JSON.parse(event.body);

  const existing = await redis.get(`users:${userId}`);

  if (!existing) {
    await redis.set(`users:${userId}`, JSON.stringify({
      role: "student",
      email
    }));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ initialized: true })
  };
}