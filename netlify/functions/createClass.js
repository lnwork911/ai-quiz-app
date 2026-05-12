import { Redis } from "@upstash/redis";
import crypto from "crypto";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event) {
  try {

    const body = JSON.parse(event.body || "{}");
    const userId = body.userId;

    if (!userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing userId" })
      };
    }

    const userRaw = await redis.get(`users:${userId}`);

    if (!userRaw) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "User role not found" })
      };
    }

    const user = JSON.parse(userRaw);

    if (user.role !== "teacher") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Only teachers can create classes" })
      };
    }

    const classId = crypto.randomBytes(4).toString("hex");

    await redis.set(`class:${classId}`, JSON.stringify({ teacherId: userId }));
    await redis.set(`classMembers:${classId}`, JSON.stringify([]));

    return {
      statusCode: 200,
      body: JSON.stringify({ classId })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
}