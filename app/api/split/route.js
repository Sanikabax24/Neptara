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
    each: result.amount / result.people,
    description: result.description.trim(),
  };
}

function parseLocally(sentence) {
  const amountMatch = sentence.match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)/i);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const peopleMatch = sentence.match(
    /(?:split|shared?|divide|divided|among|between|for)\s+(?:this\s+)?(?:with\s+)?(\d+)\s+(?:friends?|people|persons?)/i,
  ) || sentence.match(/(\d+)\s+(?:friends?|people|persons?)/i);
  if (!peopleMatch && !/\b(?:just me|only me|myself)\b/i.test(sentence)) return null;
  const people = peopleMatch ? Number(peopleMatch[1]) + (/friends?/i.test(peopleMatch[0]) ? 1 : 0) : 1;
  const description = sentence
    .replace(amountMatch[0], '')
    .replace(/\b(?:split|shared?|divide|divided|equally|among|between|with|for|friends?|people|persons?)\b/gi, '')
    .replace(/\b\d+\b/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'expense';

  return { amount, people, each: amount / people, description };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const sentence = typeof body?.text === 'string' ? body.text.trim()
    : typeof body?.sentence === 'string' ? body.sentence.trim() : '';
  if (!sentence) {
    return Response.json({ error: 'text or sentence must be a non-empty string' }, { status: 400 });
  }

  const localResult = parseLocally(sentence);
  if (localResult) return Response.json(localResult);

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: 'Include an amount and number of people, such as “Dinner ₹1200 split with 3 friends”' }, { status: 400 });
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let response;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-flash-lite-latest',
          contents: prompt(sentence),
          config: {
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    return Response.json(parseResponse(response.text));
  } catch (error) {
    console.error('Gemini split request failed', error);
    return Response.json({ error: 'Unable to parse that expense. Include an amount and number of people.' }, { status: 422 });
  }
}
