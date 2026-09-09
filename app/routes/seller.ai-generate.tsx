import type { ActionFunctionArgs } from "react-router";
import { GoogleGenAI } from "@google/genai";
import { requireSellerSession } from "../seller-session.server";

type AiMode = "write" | "improve";

type AiRequest = {
  mode?: AiMode;
  details?: Record<string, unknown>;
};

const CREATIVE_DIRECTIONS = [
  "polished luxury retail copy with a clean, confident opening",
  "warm beauty-boutique copy that feels personal and inviting",
  "modern concise ecommerce copy with strong product clarity",
  "editorial beauty copy with sophisticated but natural wording",
  "direct shopper-focused copy that emphasizes useful buying details",
  "elevated conversational copy that sounds human, not templated",
];

function cleanDetails(details: Record<string, unknown>) {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details || {})) {
    if (typeof value === "string") {
      const cleaned = value.trim().slice(0, 2000);
      if (cleaned) output[key] = cleaned;
      continue;
    }

    if (Array.isArray(value)) {
      const cleaned = value
        .filter((item) => typeof item === "string")
        .map((item) => String(item).trim().slice(0, 250))
        .filter(Boolean)
        .slice(0, 30);
      if (cleaned.length) output[key] = cleaned;
    }
  }

  return output;
}

function buildPrompt(
  mode: AiMode,
  businessName: string,
  details: Record<string, unknown>,
) {
  const direction =
    CREATIVE_DIRECTIONS[Math.floor(Math.random() * CREATIVE_DIRECTIONS.length)];

  return `You are HairGrab AI, the listing-writing assistant inside the HairGrab hair marketplace.

Seller storefront: ${businessName}
Task: ${mode === "improve" ? "Improve the seller's existing product description" : "Write a new product description"}.
Creative direction for THIS generation: ${direction}.

PRODUCT DATA PROVIDED BY THE SELLER:
${JSON.stringify(details, null, 2)}

RULES:
- Write original ecommerce copy specifically from the supplied product data.
- Use the seller/storefront name naturally only when it improves the copy; do not force it into every description.
- Never invent hair origin, grade, virgin/remy status, material, lace type, density, length, color, weight, cap size, construction, certifications, processing, durability, shipping promises, or any specification that is not supplied.
- Never make medical or therapeutic claims.
- Do not mention competing marketplaces.
- Do not use crown branding or crown language.
- Avoid generic repeated AI phrases such as "elevate your look," "luxurious locks," "effortless elegance," "turn heads," and "perfect for any occasion."
- Vary openings, sentence rhythm, structure, and closing language between generations.
- Do not use the HairGrab tagline unless it genuinely fits; never use it as a mandatory closing.
- If little information is supplied, write a shorter accurate description rather than inventing details.
- Make the description shopper-friendly, natural, and ready to paste into a product listing.
- Aim for roughly 80-150 words unless the supplied details justify less.
- Output ONLY the finished product description. No heading, notes, quotation marks, markdown, or explanation.`;
}

async function callGroq(prompt: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: "Follow the user's listing-writing instructions exactly. Return only final listing copy." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_completion_tokens: 500,
      reasoning_effort: "low",
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Groq ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("Groq returned an empty response.");
  return text;
}

async function callGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const ai = new GoogleGenAI({ apiKey });
  const interaction = await ai.interactions.create({
    model: "gemini-3.8-flash",
    input: prompt,
  });

  const text = String(interaction.output_text || "").trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { seller } = await requireSellerSession(request);

  if (request.method !== "POST") {
    return Response.json({ message: "Method not allowed." }, { status: 405 });
  }

  let body: AiRequest;
  try {
    body = (await request.json()) as AiRequest;
  } catch {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }

  const mode: AiMode = body.mode === "improve" ? "improve" : "write";
  const details = cleanDetails(body.details || {});

  if (Object.keys(details).length === 0) {
    return Response.json(
      { message: "Add some product details first so HairGrab AI has something accurate to work with." },
      { status: 400 },
    );
  }

  const prompt = buildPrompt(mode, seller.businessName, details);

  try {
    const text = await callGroq(prompt);
    return Response.json({ text, provider: "groq" });
  } catch (groqError) {
    console.error("[HairGrab AI] Groq failed; trying Gemini fallback:", groqError);

    try {
      const text = await callGemini(prompt);
      return Response.json({ text, provider: "gemini" });
    } catch (geminiError) {
      console.error("[HairGrab AI] Gemini fallback failed:", geminiError);
      return Response.json(
        { message: "HairGrab AI is busy right now. Please wait a moment and try again." },
        { status: 503 },
      );
    }
  }
};
