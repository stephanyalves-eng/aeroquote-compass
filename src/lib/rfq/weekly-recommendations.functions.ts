import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import type { WeeklyRecommendationSnapshot } from "./weekly-recommendations";

const snapshotSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  trackingStartedAt: z.string().datetime({ offset: true }),
  weeks: z.array(
    z.object({
      week: z.string(),
      real: z.number().int().nonnegative(),
      demo: z.number().int().nonnegative(),
    }),
  ),
});
export const readWeeklyRecommendations = createServerFn({ method: "GET" }).handler(async (): Promise<WeeklyRecommendationSnapshot & { unavailable: boolean }> => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const url = process.env["SUPABASE_URL"];
  if (!key || !url) throw new Error("Weekly totals are temporarily unavailable.");
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data, error } = await client.rpc("weekly_buyer_recommendations");
  if (error) throw new Error("Weekly totals are temporarily unavailable.");
  const snapshot = snapshotSchema.parse(data);
  return {
    ...snapshot,
    unavailable: false,
    weeks: snapshot.weeks.map((row) => ({ ...row, coverage: "Complete" as const })),
  };
});
