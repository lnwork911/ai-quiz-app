import OpenAI from "openai";
import { Redis } from "@upstash/redis";

const redis=new Redis({
url:process.env.UPSTASH_REDIS_REST_URL,
token:process.env.UPSTASH_REDIS_REST_TOKEN
});

export async function handler(event){
const {source,userId,difficulty}=JSON.parse(event.body);
if(!userId)return{statusCode:401,body:JSON.stringify({error:"Unauthorized"})};

let credits=await redis.get(`credits:${userId}`);
if(credits===null){credits=10;await redis.set(`credits:${userId}`,credits);}
if(credits<=0)return{statusCode:403,body:JSON.stringify({error:"No credits"})};

const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});

const prompt=`
Create 10 ${difficulty} difficulty multiple choice questions.
Return strict JSON:
{
"questions":[{"question":"","options":["","","",""],"correctIndex":0,"explanation":""}]
}
Text:
${source}
`;

const completion=await openai.chat.completions.create({
model:"gpt-4.1-mini",
messages:[{role:"user",content:prompt}]
});

const raw=completion.choices[0].message.content.replace(/```json|```/g,"");
const parsed=JSON.parse(raw);

credits--;
await redis.set(`credits:${userId}`,credits);

return{
statusCode:200,
body:JSON.stringify({quiz:parsed,remainingCredits:credits})
};
}