import { describe, expect, it, vi } from "vitest";
const clientAccess = vi.hoisted(() => vi.fn(() => { throw new Error("Client must not initialize"); }));
vi.mock("./browser-storage", () => ({ isBrowserStorageAvailable: () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: clientAccess }) }));
import { syncWeeklyRecommendations } from "./weekly-recommendations-sync";

describe("Blocked-storage telemetry", () => {
  it("skips background retries without touching the auth-backed client", async () => {
    expect(await syncWeeklyRecommendations()).toBe(false);
    expect(clientAccess).not.toHaveBeenCalled();
  });
  it("skips new real and demo milestones without creating the client", async () => {
    expect(await syncWeeklyRecommendations({ id: "demo", synthetic: true })).toBe(false);
    expect(await syncWeeklyRecommendations({ id: "real", synthetic: false })).toBe(false);
    expect(clientAccess).not.toHaveBeenCalled();
  });
});