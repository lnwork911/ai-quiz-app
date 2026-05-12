import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event) {
  const { userId } = JSON.parse(event.body);

  const user = JSON.parse(await redis.get(`users:${userId}`));

  if (user.role !== "teacher") {
    return { statusCode: 403, body: "Not authorized" };
  }

  const classId = crypto.randomBytes(4).toString("hex");

  await redis.set(`class:${classId}`, JSON.stringify({ teacherId: userId }));
  await redis.set(`classMembers:${classId}`, JSON.stringify([]));

  return {
    statusCode: 200,
    body: JSON.stringify({ classId })
  };
}