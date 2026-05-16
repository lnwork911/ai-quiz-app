import { Redis } from "@upstash/redis";
import { parseStoredValue } from "./redisValue.js";

const redis=new Redis({
url:process.env.UPSTASH_REDIS_REST_URL,
token:process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event){
const {userId,role}=JSON.parse(event.body);
const existing=parseStoredValue(await redis.get(`users:${userId}`),{});
await redis.set(`users:${userId}`,{...existing,role});
return{statusCode:200,body:"ok"};
}