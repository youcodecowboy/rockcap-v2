import { describe, it, expect } from "vitest";
import { computeProspectFlags } from "../flags";

const intelRun = (gaps: any[] = []) => ({ status: "complete_with_gaps", gaps });

describe("computeProspectFlags", () => {
  it("flags a prospect with no usable contact", () => {
    const flags = computeProspectFlags({ primaryContactId: undefined, contactsWithEmail: 0 }, intelRun());
    expect(flags.some((f) => f.key === "no_contact" && f.severity === "warn")).toBe(true);
  });
  it("does not flag no_contact when a contact email exists", () => {
    const flags = computeProspectFlags({ contactsWithEmail: 1 }, intelRun());
    expect(flags.some((f) => f.key === "no_contact")).toBe(false);
  });
  it("surfaces intel-run gaps as info flags", () => {
    const flags = computeProspectFlags({ contactsWithEmail: 1 }, intelRun([{ kind: "missing_data", description: "officers/PSCs not synced" }]));
    expect(flags.some((f) => f.severity === "info")).toBe(true);
  });
  it("returns an all-clear flag when nothing is wrong", () => {
    const flags = computeProspectFlags({ contactsWithEmail: 1 }, intelRun([]));
    expect(flags).toEqual([{ key: "all_clear", label: "All found", severity: "ok" }]);
  });
});
