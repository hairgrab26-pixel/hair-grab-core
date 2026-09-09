import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
} from "react-router";

import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { GoogleGenAI } from "@google/genai";

import {
  requireSellerSession,
} from "../seller-session.server";


// ==========================================================
// TYPES
// ==========================================================

type AssistantMode =
  | "description"
  | "title"
  | "improve"
  | "social"
  | "ask";

type ActionData = {
  success?: boolean;
  result?: string;
  error?: string;
  mode?: AssistantMode;
  prompt?: string;
};


// ==========================================================
// LOADER
// ==========================================================

export const loader = async ({
  request,
}: LoaderFunctionArgs) => {
  const {
    seller,
  } =
    await requireSellerSession(
      request,
    );

  return {
    seller: {
      businessName:
        seller.businessName,

      sellerCode:
        seller.sellerCode,
    },
  };
};


// ==========================================================
// HAIRGRAB AI INSTRUCTIONS
// ==========================================================

function buildHairGrabPrompt(
  mode: AssistantMode,
  sellerPrompt: string,
  businessName: string,
) {
  const baseInstructions = `
You are the HairGrab AI Seller Assistant.

HairGrab is an online marketplace for hair products sold by independent sellers.

You are helping a HairGrab seller named "${businessName}".

Your job is to help sellers create clear, professional, shopper-friendly content for hair products.

HairGrab product categories can include:
- Wigs
- Bundles
- Closures and Frontals
- Extensions
- Braiding Hair
- Crochet Hair
- Locs / Locks
- Hair Essentials

Hair textures can include:
- Straight
- Body Wave
- Deep Wave
- Water Wave
- Curly
- Kinky / Coily
- and other seller-provided textures.

IMPORTANT RULES:

1. Never invent product specifications that the seller did not provide.
2. Never claim hair is virgin, raw, Remy, human hair, synthetic, medical grade, ethically sourced, or any other material/quality unless the seller states it.
3. Never invent lace type, density, length, color, origin, weight, cap size, processing method, shipping speed, return policy, or included accessories.
4. Do not make medical claims.
5. Do not promise results that cannot be verified.
6. Do not include competitor marketplace names.
7. Keep language polished but natural.
8. Avoid excessive hype, fake urgency, and misleading claims.
9. Do not use a crown symbol or crown branding for HairGrab.
10. HairGrab's tagline is "Find It. Love It. Grab It."
11. When information is missing, write around the missing information instead of making it up.
12. Return only the content the seller requested. Do not explain your reasoning.
`;

  if (
    mode ===
    "description"
  ) {
    return `${baseInstructions}

TASK:
Write a polished HairGrab product description using ONLY the product information supplied by the seller.

Make it easy to scan and attractive to hair shoppers.

Use approximately 1-3 short paragraphs unless the seller asks for something different.

SELLER PRODUCT INFORMATION:
${sellerPrompt}
`;
  }

  if (
    mode ===
    "title"
  ) {
    return `${baseInstructions}

TASK:
Create a clean, shopper-friendly HairGrab product title.

Keep the title concise.

Include the most useful identifying details supplied by the seller, such as texture, product type, length, lace size, or color when relevant.

Do not add specifications that were not provided.

Return only the title.

SELLER PRODUCT INFORMATION:
${sellerPrompt}
`;
  }

  if (
    mode ===
    "improve"
  ) {
    return `${baseInstructions}

TASK:
Improve the seller's existing product description.

Preserve all factual product information.

Improve clarity, grammar, flow, professionalism, and shopper appeal.

Do not add facts that are not in the original description.

SELLER'S CURRENT DESCRIPTION:
${sellerPrompt}
`;
  }

  if (
    mode ===
    "social"
  ) {
    return `${baseInstructions}

TASK:
Create a short social media caption for this HairGrab product.

Make it suitable for Instagram, Facebook, or TikTok.

Keep it engaging but not spammy.

You may use a few appropriate emojis and hashtags.

Do not invent a sale, discount, product feature, or shipping promise.

SELLER PRODUCT INFORMATION:
${sellerPrompt}
`;
  }

  return `${baseInstructions}

TASK:
Answer the seller's question as a HairGrab seller assistant.

You may help with:
- writing listings
- improving product presentation
- general hair-product merchandising
- seller organization
- product titles
- social captions
- basic HairGrab selling guidance

If the seller asks about a HairGrab rule, fee, payout policy, shipping policy, or feature that you cannot know from the information provided, tell them to confirm it with HairGrab Support rather than inventing an answer.

SELLER QUESTION:
${sellerPrompt}
`;
}


// ==========================================================
// ACTION
// ==========================================================

export const action = async ({
  request,
}: ActionFunctionArgs) => {
  const {
    seller,
  } =
    await requireSellerSession(
      request,
    );

  const formData =
    await request.formData();

  const rawMode =
    String(
      formData.get(
        "mode",
      ) || "description",
    );

  const allowedModes:
    AssistantMode[] = [
      "description",
      "title",
      "improve",
      "social",
      "ask",
    ];

  const mode:
    AssistantMode =
    allowedModes.includes(
      rawMode as AssistantMode,
    )
      ? (
          rawMode as
            AssistantMode
        )
      : "description";

  const prompt =
    String(
      formData.get(
        "prompt",
      ) || "",
    ).trim();

  if (
    !prompt
  ) {
    return {
      success:
        false,

      error:
        "Tell HairGrab AI what you need help with.",

      mode,

      prompt,
    } satisfies ActionData;
  }

  if (
    prompt.length >
    6000
  ) {
    return {
      success:
        false,

      error:
        "Please shorten your request to 6,000 characters or less.",

      mode,

      prompt,
    } satisfies ActionData;
  }

  const apiKey =
    process.env.GEMINI_API_KEY;

  if (
    !apiKey
  ) {
    console.error(
      "[HairGrab AI] GEMINI_API_KEY is not configured.",
    );

    return {
      success:
        false,

      error:
        "HairGrab AI is temporarily unavailable. Please try again later.",

      mode,

      prompt,
    } satisfies ActionData;
  }

  try {
    const ai =
      new GoogleGenAI({
        apiKey,
      });

    const interaction =
      await ai.interactions.create({
        model:
          "gemini-3.8-flash",

        input:
          buildHairGrabPrompt(
            mode,
            prompt,
            seller.businessName,
          ),
      });

    const result =
      String(
        interaction.output_text ||
          "",
      ).trim();

    if (
      !result
    ) {
      throw new Error(
        "Gemini returned an empty response.",
      );
    }

    return {
      success:
        true,

      result,

      mode,

      prompt,
    } satisfies ActionData;
  } catch (
    error
  ) {
    console.error(
      "[HairGrab AI] Generation failed:",
      error,
    );

    return {
      success:
        false,

      error:
        "HairGrab AI could not complete that request. Please try again.",

      mode,

      prompt,
    } satisfies ActionData;
  }
};


// ==========================================================
// PAGE
// ==========================================================

export default function SellerAiAssistant() {
  const {
    seller,
  } =
    useLoaderData<
      typeof loader
    >();

  const actionData =
    useActionData<
      ActionData
    >();

  const navigation =
    useNavigation();

  const generating =
    navigation.state ===
    "submitting";

  const currentMode =
    actionData?.mode ||
    "description";

  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "#faf8fc",

        fontFamily:
          "Arial, Helvetica, sans-serif",

        color:
          "#21152a",
      }}
    >
      <header
        style={{
          background:
            "#4B1678",

          color:
            "white",

          padding:
            "18px 24px",
        }}
      >
        <div
          style={{
            maxWidth:
              "1000px",

            margin:
              "0 auto",

            display:
              "flex",

            justifyContent:
              "space-between",

            alignItems:
              "center",

            gap:
              "16px",

            flexWrap:
              "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize:
                  "10px",

                fontWeight:
                  "800",

                letterSpacing:
                  "1px",

                opacity:
                  0.8,
              }}
            >
              HAIRGRAB SELLER
            </div>

            <div
              style={{
                fontSize:
                  "23px",

                fontWeight:
                  "800",
              }}
            >
              ✨ HairGrab AI Assistant
            </div>
          </div>

          <Link
            to="/seller"
            style={{
              background:
                "white",

              color:
                "#4B1678",

              textDecoration:
                "none",

              fontWeight:
                "800",

              fontSize:
                "12px",

              padding:
                "10px 14px",

              borderRadius:
                "8px",
            }}
          >
            ← Seller Dashboard
          </Link>
        </div>
      </header>

      <main
        style={{
          maxWidth:
            "1000px",

          margin:
            "0 auto",

          padding:
            "30px 20px 60px",
        }}
      >
        <section
          style={{
            marginBottom:
              "22px",
          }}
        >
          <div
            style={{
              color:
                "#4B1678",

              fontSize:
                "11px",

              fontWeight:
                "800",

              letterSpacing:
                "0.8px",
            }}
          >
            {seller.sellerCode}
          </div>

          <h1
            style={{
              color:
                "#4B1678",

              fontSize:
                "30px",

              margin:
                "6px 0",
            }}
          >
            Create better listings, faster.
          </h1>

          <div
            style={{
              color:
                "#6f6575",

              fontSize:
                "14px",

              lineHeight:
                1.6,
            }}
          >
            HairGrab AI can help {seller.businessName} write product
            descriptions, improve titles, create social captions, and
            answer general selling questions.
          </div>
        </section>

        <section
          style={{
            background:
              "#f2eafa",

            border:
              "1px solid #e2d1ef",

            borderRadius:
              "12px",

            padding:
              "14px 16px",

            marginBottom:
              "20px",

            fontSize:
              "12px",

            lineHeight:
              1.5,

            color:
              "#4B1678",
          }}
        >
          <strong>
            AI Tip:
          </strong>{" "}
          Give the assistant accurate product details for the best
          results. Always review generated content before publishing it.
        </section>

        <Form
          method="post"
          style={{
            background:
              "white",

            border:
              "1px solid #e5dce9",

            borderRadius:
              "14px",

            padding:
              "22px",
          }}
        >
          <label
            htmlFor="mode"
            style={{
              display:
                "block",

              color:
                "#4B1678",

              fontWeight:
                "800",

              fontSize:
                "13px",

              marginBottom:
                "7px",
            }}
          >
            What would you like HairGrab AI to do?
          </label>

          <select
            id="mode"
            name="mode"
            defaultValue={
              currentMode
            }
            style={{
              width:
                "100%",

              padding:
                "12px",

              border:
                "1px solid #d8cadf",

              borderRadius:
                "8px",

              fontSize:
                "14px",

              background:
                "white",

              marginBottom:
                "18px",
            }}
          >
            <option value="description">
              Write Product Description
            </option>

            <option value="title">
              Create Product Title
            </option>

            <option value="improve">
              Improve My Description
            </option>

            <option value="social">
              Create Social Media Caption
            </option>

            <option value="ask">
              Ask HairGrab
            </option>
          </select>

          <label
            htmlFor="prompt"
            style={{
              display:
                "block",

              color:
                "#4B1678",

              fontWeight:
                "800",

              fontSize:
                "13px",

              marginBottom:
                "7px",
            }}
          >
            Tell us about your product or question
          </label>

          <textarea
            id="prompt"
            name="prompt"
            defaultValue={
              actionData?.prompt ||
              ""
            }
            placeholder="Example: 24 inch body wave wig, 5x5 HD lace, natural black, 180% density, glueless..."
            rows={
              8
            }
            maxLength={
              6000
            }
            style={{
              width:
                "100%",

              boxSizing:
                "border-box",

              padding:
                "14px",

              border:
                "1px solid #d8cadf",

              borderRadius:
                "8px",

              fontSize:
                "14px",

              fontFamily:
                "inherit",

              lineHeight:
                1.5,

              resize:
                "vertical",
            }}
          />

          <button
            type="submit"
            disabled={
              generating
            }
            style={{
              marginTop:
                "16px",

              border:
                "none",

              background:
                generating
                  ? "#8d6aa6"
                  : "#4B1678",

              color:
                "white",

              padding:
                "12px 20px",

              borderRadius:
                "8px",

              fontSize:
                "13px",

              fontWeight:
                "800",

              cursor:
                generating
                  ? "wait"
                  : "pointer",
            }}
          >
            {generating
              ? "✨ HairGrab AI is writing..."
              : "✨ Generate with HairGrab AI"}
          </button>
        </Form>

        {actionData?.error && (
          <section
            style={{
              marginTop:
                "18px",

              background:
                "#fff4f4",

              border:
                "1px solid #e6b8b8",

              borderRadius:
                "12px",

              padding:
                "16px",

              color:
                "#8a2525",

              fontSize:
                "13px",
            }}
          >
            {actionData.error}
          </section>
        )}

        {actionData?.success &&
          actionData.result && (
            <section
              style={{
                marginTop:
                  "20px",

                background:
                  "white",

                border:
                  "1px solid #d9c7e5",

                borderRadius:
                  "14px",

                padding:
                  "22px",
              }}
            >
              <div
                style={{
                  color:
                    "#4B1678",

                  fontSize:
                    "11px",

                  fontWeight:
                    "800",

                  letterSpacing:
                    "0.7px",

                  marginBottom:
                    "8px",
                }}
              >
                ✨ HAIRGRAB AI RESULT
              </div>

              <div
                style={{
                  whiteSpace:
                    "pre-wrap",

                  fontSize:
                    "14px",

                  lineHeight:
                    1.65,

                  color:
                    "#2b1b35",
                }}
              >
                {actionData.result}
              </div>

              <div
                style={{
                  marginTop:
                    "18px",

                  paddingTop:
                    "14px",

                  borderTop:
                    "1px solid #eee6f1",

                  color:
                    "#756b79",

                  fontSize:
                    "11px",
                }}
              >
                AI-generated content may contain errors. Review product
                details before publishing.
              </div>
            </section>
          )}
      </main>
    </div>
  );
}