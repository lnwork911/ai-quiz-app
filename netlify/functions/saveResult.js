import { Redis } from "@upstash/redis";

const redis=new Redis({
url:process.env.UPSTASH_REDIS_REST_URL,
token:process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event){
const {userId,score,total}=JSON.parse(event.body);
await redis.rpush(`results:${userId}`,{score,total,date:new Date().toISOString()});
return{statusCode:200,body:JSON.stringify({ok:true})};
}