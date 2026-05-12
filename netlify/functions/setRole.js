import { Redis } from "@upstash/redis";

const redis=new Redis({
url:process.env.UPSTASH_REDIS_REST_URL,
token:process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event){
const {userId,role}=JSON.parse(event.body);
await redis.set(`users:${userId}`,JSON.stringify({role}));
return{statusCode:200,body:"ok"};
}