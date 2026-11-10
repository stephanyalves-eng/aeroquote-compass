import { describe, expect, it } from "vitest";
import { outboxAction } from "./telemetry-outbox";
describe("telemetry outbox", () => {
  it("removes delivered milestones", () => expect(outboxAction(null, { synthetic: false })).toBe("delivered"));
  it("drops a real milestone rejected for an anonymous visitor", () =>
    expect(outboxAction({ code: "42501" }, { synthetic: false })).toBe("drop"));
  it("retries synthetic milestones on any error", () =>
    expect(outboxAction({ code: "42501" }, { synthetic: true })).toBe("retry"));
  it("retries network or other failures", () =>
    expect(outboxAction({ code: "PGRST000" }, { synthetic: false })).toBe("retry"));
});
