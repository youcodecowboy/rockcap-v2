import { describe, it, expect } from "vitest";
import { LIGHT } from "@/lib/colors";
import { clientStatusTone, projectStatusTone } from "@/components/layouts/entityStatus";

describe("clientStatusTone", () => {
  it("maps active to green (engaged relationship, not status-blue)", () => {
    expect(clientStatusTone("active", LIGHT)).toBe(LIGHT.accent.green);
  });
  it("maps prospect to amber", () => {
    expect(clientStatusTone("prospect", LIGHT)).toBe(LIGHT.accent.yellow);
  });
  it("maps archived and past to dim grey", () => {
    expect(clientStatusTone("archived", LIGHT)).toBe(LIGHT.text.dim);
    expect(clientStatusTone("past", LIGHT)).toBe(LIGHT.text.dim);
  });
  it("is case-insensitive and falls back to muted", () => {
    expect(clientStatusTone("ACTIVE", LIGHT)).toBe(LIGHT.accent.green);
    expect(clientStatusTone(undefined, LIGHT)).toBe(LIGHT.text.muted);
  });
});

describe("projectStatusTone", () => {
  it("maps active->green, completed->blue, on-hold->yellow, cancelled->red, inactive->dim", () => {
    expect(projectStatusTone("active", LIGHT)).toBe(LIGHT.accent.green);
    expect(projectStatusTone("completed", LIGHT)).toBe(LIGHT.accent.blue);
    expect(projectStatusTone("on-hold", LIGHT)).toBe(LIGHT.accent.yellow);
    expect(projectStatusTone("cancelled", LIGHT)).toBe(LIGHT.accent.red);
    expect(projectStatusTone("inactive", LIGHT)).toBe(LIGHT.text.dim);
  });
});
