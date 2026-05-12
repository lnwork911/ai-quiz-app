import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event) {
  const { userId, classId } = JSON.parse(event.body);

  let members = JSON.parse(await redis.get(`classMembers:${classId}`) || "[]");

  if (!members.includes(userId)) {
    members.push(userId);
    await redis.set(`classMembers:${classId}`, JSON.stringify(members));
  }

  return { statusCode: 200, body: JSON.stringify({ joined: true }) };
}