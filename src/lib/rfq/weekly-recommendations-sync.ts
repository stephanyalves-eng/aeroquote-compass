import { supabase } from "@/integrations/supabase/client";
const KEY = "aeroquote-weekly-recommendations-outbox";
interface Milestone {
  id: string;
  synthetic: boolean;
}
/** Only random telemetry IDs and a demo flag; no procurement or personal data. */
function pending(): Milestone[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (item): item is Milestone =>
            item != null &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.synthetic === "boolean",
        )
      : [];
  } catch {
    return [];
  }
}
function store(rows: Milestone[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    /* Current-session delivery still proceeds. */
  }
}
export async function syncWeeklyRecommendations(milestone?: Milestone) {
  const rows = pending();
  if (milestone && !rows.some((row) => row.id === milestone.id)) rows.push(milestone);
  store(rows);
  let changed = false;
  for (const row of rows) {
    const { error } = await supabase.rpc("record_buyer_recommendation", {
      p_milestone_id: row.id,
      p_synthetic: row.synthetic,
    });
    if (error)
      throw new Error(
        "Weekly totals could not update. The confirmation is retained and will retry automatically.",
      );
    store(pending().filter((item) => item.id !== row.id));
    changed = true;
  }
  return changed;
}
