import { NextRequest, NextResponse } from "next/server";
import {
  extractSkuCandidates,
  getAutoDeliverWinner,
  filterInventoryByScan,
  getAutoDeliverInventoryWinner,
  KnownProductLookup,
  ScannedInventoryProduct,
} from "../../../lib/ocrService";

interface OcrApiPayload {
  image?: string;
  rawText?: string;
  catalog?: KnownProductLookup[];
  inventory?: ScannedInventoryProduct[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as OcrApiPayload;
    const { image, rawText, catalog = [], inventory = [] } = body;

    let recognizedText = rawText || "";

    // 1. If image is provided and an external vision model / gateway is configured, attempt vision extraction
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;

    if (image && !recognizedText && (openRouterKey || openAiKey)) {
      try {
        const apiKey = openRouterKey || openAiKey;
        const endpoint = openRouterKey
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://api.openai.com/v1/chat/completions";
        const model = openRouterKey ? "google/gemini-2.0-flash-001" : "gpt-4o-mini";

        // Extract base64 part if it has data URL prefix
        const imageUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

        const aiResponse = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "You are an industrial warehouse barcode and SKU optical character recognition scanner. Read all text, product codes, SKU codes, numbers, and warehouse labels visible in this image. Return ONLY the identified alphanumeric codes separated by spaces or newlines. Do not include markdown or explanations.",
                  },
                  {
                    type: "image_url",
                    image_url: { url: imageUrl },
                  },
                ],
              },
            ],
            max_tokens: 150,
            temperature: 0.1,
          }),
        });

        if (aiResponse.ok) {
          const aiJson = await aiResponse.json();
          const content = aiJson.choices?.[0]?.message?.content;
          if (content && typeof content === "string") {
            recognizedText = content.trim();
          }
        }
      } catch (aiErr) {
        console.warn("[OCR API] Vision AI model inference skipped:", aiErr);
      }
    }

    // 2. Extract and score candidates using the high-precision fuzzy matcher and catalog lookups
    const candidates = extractSkuCandidates(recognizedText, catalog);
    const candidateWinner = getAutoDeliverWinner(candidates);

    // 3. Progressively filter inventory products if provided
    const filteredInventory =
      inventory && inventory.length > 0
        ? filterInventoryByScan(inventory, recognizedText, candidates)
        : [];
    const inventoryWinner = getAutoDeliverInventoryWinner(filteredInventory);

    // Choose overall winner (inventory winner prioritized with location & stock details)
    const winner = inventoryWinner
      ? {
          code: inventoryWinner.sku,
          confidence: inventoryWinner.matchScore || 90,
          source: "catalog_match" as const,
          isKnownProduct: true,
          productName: inventoryWinner.name,
          locationCode: inventoryWinner.locationCode,
          quantity: inventoryWinner.quantity,
        }
      : candidateWinner;

    return NextResponse.json({
      success: true,
      rawText: recognizedText,
      candidates,
      matchingInventory: filteredInventory,
      winner,
      autoDeliver: Boolean(winner && winner.confidence >= 90),
      accuracy: winner ? winner.confidence : (candidates[0]?.confidence ?? 0),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido en OCR API";
    return NextResponse.json(
      {
        success: false,
        error: message,
        candidates: [],
        matchingInventory: [],
        winner: null,
        autoDeliver: false,
      },
      { status: 500 }
    );
  }
}
