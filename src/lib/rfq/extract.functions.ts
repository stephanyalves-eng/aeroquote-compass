import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExtractedQuote } from "./types";
import { extractionSchema } from "./extraction-schema";

const Input = z.object({
  text: z.string().max(60000).optional(),
  pdfBase64: z.string().max(8_000_000).optional(),
  today: z.string().max(10),
  fileName: z.string().max(255).optional(),
});

const INSTRUCTIONS = `You extract data from aerospace supplier quotations (any language) into JSON.
Return ONLY a JSON object, no prose, no markdown fences, with exactly these keys:
supplier_name (string), quote_id (string), quote_date (ISO yyyy-mm-dd), validity_end_date (ISO; if the quote says "valid for N days" compute quote_date + N days),
part_number, revision (letter/code only, e.g. "C"), unit_price (number for the quoted annual quantity), currency ("USD"|"EUR"|"BRL"),
quantity_basis (number), price_breaks (array of {min_qty:number, unit_price:number}, include every quantity/price pair stated),
incoterm (3-letter code), incoterm_place, lead_time_days (number), payment_terms_days (number),
one_time_costs (array of {type, amount:number, currency}; e.g. tooling, FAI, NRE charged separately),
certifications (array of strings), fai_included (true/false/null), eccn (string or null; null if "to be confirmed"),
warranty_months (number), new_supplier_requires_qualification (true/false), surcharge_clause (string or null), notes (string or null).
Also extract moq, freight, insurance, duties, other_adders, country_of_origin, delivery_location, commercial_exceptions.
Freight, insurance, duties and other_adders are annual quoted charges in the quote currency. If an explicitly per-unit charge is given, convert it to an annual amount only if the quotation's annual quantity is explicit. Never estimate shipping or taxes.
Return confidence as an object with every field name (except confidence itself) mapped to a 0–100 extraction confidence, or null for missing information. Confidence is a self-assessment, not a guarantee.
Numbers must be plain JSON numbers (convert "16.300,00" to 16300). Missing values must be null (arrays empty), never guessed. Preserve fictitious markers in supplier names. Never calculate costs, scores, rankings or business risk.`;

function parseJson(text: string): ExtractedQuote {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("The AI did not return JSON.");
  return extractionSchema.parse(JSON.parse(text.slice(s, e + 1))) as ExtractedQuote;
}

export const extractQuote = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<{ quote: ExtractedQuote | null; error: string | null }> => {
    if (!data.text?.trim() && !data.pdfBase64) return { quote: null, error: "Empty quote." };
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) return { quote: null, error: "AI is not configured." };
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output } = await import("ai");
    const { createLovableAiGatewayRunIdFetch } = await import("../ai/run-id.server");
    const runId = createLovableAiGatewayRunIdFetch();
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runId.fetch,
    });
    const content: Array<
      { type: "text"; text: string } | { type: "file"; data: string; mediaType: string; filename: string }
    > = [{ type: "text", text: `Today is ${data.today}. Extract this quotation:\n\n${data.text ?? ""}` }];
    if (data.pdfBase64) content.push({ type: "file", data: data.pdfBase64, mediaType: "application/pdf", filename: data.fileName ?? "quotation.pdf" });
    try {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        instructions: INSTRUCTIONS,
        output: Output.object({ schema: extractionSchema }),
        messages: [{ role: "user", content }],
        maxRetries: 0,
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      } as Parameters<typeof streamText>[0]);
      const text = await result.text;
      return { quote: parseJson(text), error: null };
    } catch (err) {
      console.error("extractQuote failed", err);
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 429) return { quote: null, error: "Too many requests. Please wait a moment and try again." };
      if (status === 402) return { quote: null, error: "AI credits exhausted. Add credits in Settings → Plans & credits." };
      if (status === 403) return { quote: null, error: "AI access is blocked for this workspace." };
      return { quote: null, error: "Extraction failed. Check the document and reprocess it." };
    }
  });
