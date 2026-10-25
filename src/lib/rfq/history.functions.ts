import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const listHistory = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("rfq_history").select("*").order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error("Could not load RFQ history.");
  return data;
});
export const saveHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().optional(), rfqNumber: z.string().min(1).max(100), partNumber: z.string().min(1).max(100), status: z.enum(["Draft", "Analyzing", "Completed", "Under Negotiation", "Awarded"]), snapshot: z.string().max(5_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const row = { user_id: context.userId, rfq_number: data.rfqNumber, part_number: data.partNumber, status: data.status, snapshot: JSON.parse(data.snapshot), updated_at: new Date().toISOString() };
    const query = data.id ? context.supabase.from("rfq_history").update(row).eq("id", data.id) : context.supabase.from("rfq_history").insert(row);
    const { data: saved, error } = await query.select("id").single();
    if (error) throw new Error("Could not save RFQ history.");
    return saved;
  });