import { GoogleGenAI, Type } from '@google/genai';

export const runtime = 'nodejs';

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    amount: { type: Type.NUMBER },
    people: { type: Type.INTEGER },
    each: { type: Type.NUMBER },
    description: { type: Type.STRING },
  },
  required: ['amount', 'people', 'each', 'description'],
};

const prompt = (sentence) => `Parse this expense into a split.

Return ONLY JSON matching this exact shape:
{"amount":1200,"people":3,"each":400,"description":"dinner"}

Rules:
- amount is the total expense amount.
- people is the total number of people sharing, including the person who wrote the sentence.
- "split with N friends" means N + 1 people.
- "just me" means 1 person.
- each is amount divided equally by people.
- description is a short description of the expense.
- Infer people from named people when possible.
- Do not include markdown, code fences, or any extra text.

Sentence: ${sentence}`;

function parseResponse(text) {
  const json = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const result = JSON.parse(json);

  if (
    typeof result.amount !== 'number' ||
    !Number.isFinite(result.amount) ||
    !Number.isInteger(result.people) ||
    result.people < 1 ||
    typeof result.each !== 'number' ||
    !Number.isFinite(result.each) ||
    typeof result.description !== 'string' ||
    !result.description.trim()
  ) {
    throw new Error('Gemini returned an invalid split shape');
  }

  return {
    amount: result.amount,
    people: result.people,
    each: result.each,
    description: result.description.trim(),
  };
}

export async function POST(request) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: 'GEMINI_API_KEY is not configured on the server' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  if (typeof body?.text !== 'string' || !body.text.trim()) {
    return Response.json({ error: 'text must be a non-empty string' }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: prompt(body.text.trim()),
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    return Response.json(parseResponse(response.text));
  } catch (error) {
    console.error('Gemini split request failed', error);
    return Response.json({ error: 'Unable to parse that expense right now' }, { status: 502 });
  }
}
