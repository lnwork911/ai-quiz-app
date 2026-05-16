import { Redis } from "@upstash/redis";
import { parseStoredValue } from "./redisValue.js";

const redis=new Redis({url:process.env.UPSTASH_REDIS_REST_URL,token:process.env.UPSTASH_REDIS_REST_TOKEN});

export async function handler(){
const keys=await redis.keys("results:*");
let board=[];
for(const key of keys){
let results=await redis.lrange(key,0,-1);
if(results.length>0){
let parsed=results.map(r=>parseStoredValue(r));
let avg=parsed.reduce((a,b)=>a+b.score/b.total,0)/parsed.length;
board.push({user:key.replace("results:",""),average:avg});
}
}
board.sort((a,b)=>b.average-a.average);
return{statusCode:200,body:JSON.stringify(board.slice(0,10))};
}