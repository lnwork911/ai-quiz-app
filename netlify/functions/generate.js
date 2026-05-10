import OpenAI from "openai";

export async function handler(event) {
  const { source } = JSON.parse(event.body);

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  const prompt = `
  Create 5 professional multiple choice questions from this text.
  Do NOT cut sentences.
  Provide 4 options.
  Clearly mark correct answer.
  Text:
  ${source}
  `;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [{ role: "user", content: prompt }],
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      quiz: completion.choices[0].message.content
    })
  };
}