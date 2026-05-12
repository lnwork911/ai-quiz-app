import { Redis } from "@upstash/redis";
const redis=new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN});

export async function handler(event){
const userId=event.queryStringParameters.userId;
const results=await redis.lrange(`results:${userId}`,0,-1);
return{statusCode:200,body:JSON.stringify(results.map(r=>JSON.parse(r)))};
}