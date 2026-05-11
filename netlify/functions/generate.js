import OpenAI from "openai";

export async function handler(event) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY" })
      };
    }

    const { source } = JSON.parse(event.body);

    if (!source) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No source text provided" })
      };
    }

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

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
}