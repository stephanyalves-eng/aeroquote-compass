// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { syncWeeklyRecommendations } from "./weekly-recommendations-sync";
describe("Automatic weekly telemetry delivery", () => {
  beforeEach(() => {
    localStorage.clear();
    rpc.mockReset();
  });
  it("sends only milestone ID and synthetic flag independently of the collector", async () => {
    rpc.mockResolvedValue({ error: null });
    expect(await syncWeeklyRecommendations({ id: "one", synthetic: true })).toBe(true);
    expect(rpc).toHaveBeenCalledWith("record_buyer_recommendation", {
      p_milestone_id: "one",
      p_synthetic: true,
    });
    expect(await syncWeeklyRecommendations()).toBe(false);
  });
  it("retains failed milestones and retries with exactly the same deduplication ID", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "offline" } }).mockResolvedValue({ error: null });
    await expect(syncWeeklyRecommendations({ id: "retained", synthetic: false })).rejects.toThrow();
    expect(await syncWeeklyRecommendations()).toBe(true);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(await syncWeeklyRecommendations()).toBe(false);
  });
});
