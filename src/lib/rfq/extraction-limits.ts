import { z } from "zod";

export const EXTRACTION_LIMITS = {
  textCharacters: 60_000,
  pdfBase64Characters: 8_000_000,
  outputTokens: 8_000,
} as const;

export const extractionInput = z
  .object({
    text: z.string().max(EXTRACTION_LIMITS.textCharacters).optional(),
    pdfBase64: z
      .string()
      .max(EXTRACTION_LIMITS.pdfBase64Characters)
      .regex(/^JVBERi0[A-Za-z0-9+/]*={0,2}$/, "A valid base64 PDF is required.")
      .refine((value) => value.length % 4 === 0, "Invalid PDF encoding.")
      .optional(),
    today: z.iso.date(),
    fileName: z.string().max(255).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.text?.trim()) !== Boolean(data.pdfBase64), {
    message: "Provide either quotation text or a PDF, not both.",
  });