import { z } from "zod";
const text = z.string().nullable();
const number = z.number().nonnegative().nullable();
const currency = z.enum(["USD", "EUR", "BRL"]).nullable();
export const quoteFields = {
  supplier_name: text, quote_id: text, quote_date: text, validity_end_date: text,
  part_number: text, revision: text, unit_price: number, currency, quantity_basis: number,
  price_breaks: z.array(z.object({ min_qty: z.number().nonnegative(), unit_price: z.number().nonnegative() }).strict()),
  incoterm: text, incoterm_place: text, lead_time_days: number, payment_terms_days: number,
  one_time_costs: z.array(z.object({ type: z.string(), amount: z.number().nonnegative(), currency }).strict()),
  certifications: z.array(z.string()), fai_included: z.boolean().nullable(), eccn: text,
  warranty_months: number, new_supplier_requires_qualification: z.boolean().nullable(),
  surcharge_clause: text, notes: text, moq: number, freight: number, insurance: number,
  duties: number, other_adders: number, country_of_origin: text, delivery_location: text,
  commercial_exceptions: text,
};
const confidenceFields = Object.fromEntries(Object.keys(quoteFields).map((key) => [key, z.number().min(0).max(100).nullable()]));
export const extractionSchema = z.object({ ...quoteFields, confidence: z.object(confidenceFields).strict() }).strict();