import OpenAI from "openai";
import { requireEnv } from "@/lib/env";
import { KNOWLEDGE_VISION_MODEL } from "@/lib/knowledge/constants";

export interface DescribeImageFn {
  (bytes: Buffer, mimeType: string): Promise<string>;
}

const SYSTEM_PROMPT =
  "Transcribe and describe this image for a personal knowledge base. " +
  "Read out any visible text verbatim (OCR), then briefly describe non-text " +
  "visual content relevant to understanding it. Be factual — do not infer " +
  "anything not actually visible in the image.";

/**
 * SPEC-CORE-008 NC-023: this output is OCR/description content and must be
 * labeled machine-extracted by the caller (extraction.ts) — this function
 * itself just returns the raw text.
 */
export const describeImage: DescribeImageFn = async (bytes, mimeType) => {
  const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;

  const completion = await openai.chat.completions.create({
    model: KNOWLEDGE_VISION_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: [{ type: "image_url", image_url: { url: dataUrl } }] },
    ],
  });

  return completion.choices[0]?.message.content ?? "";
};
