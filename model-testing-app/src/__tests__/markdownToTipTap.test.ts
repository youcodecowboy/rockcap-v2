import { describe, it, expect } from "vitest";
import { markdownToTipTapDoc, wordCount } from "../../convex/lib/markdownToTipTap";

describe("markdownToTipTapDoc", () => {
  it("wraps output in a doc node", () => {
    const doc = markdownToTipTapDoc("hello");
    expect(doc.type).toBe("doc");
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it("never produces an empty doc (TipTap needs a block)", () => {
    const doc = markdownToTipTapDoc("");
    expect(doc.content.length).toBeGreaterThan(0);
    expect(doc.content[0].type).toBe("paragraph");
  });

  it("converts headings with the right level", () => {
    const doc = markdownToTipTapDoc("# Title\n## Sub");
    expect(doc.content[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(doc.content[1]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(doc.content[0].content?.[0]).toMatchObject({ type: "text", text: "Title" });
  });

  it("groups consecutive bullets into one bulletList", () => {
    const doc = markdownToTipTapDoc("- one\n- two\n- three");
    const lists = doc.content.filter((n) => n.type === "bulletList");
    expect(lists).toHaveLength(1);
    expect(lists[0].content).toHaveLength(3);
    expect(lists[0].content?.[0]).toMatchObject({ type: "listItem" });
  });

  it("handles ordered lists and blockquotes", () => {
    const doc = markdownToTipTapDoc("1. first\n2. second\n\n> a quote");
    expect(doc.content.some((n) => n.type === "orderedList")).toBe(true);
    expect(doc.content.some((n) => n.type === "blockquote")).toBe(true);
  });

  it("separates paragraphs on blank lines and merges wrapped lines", () => {
    const doc = markdownToTipTapDoc("line a\nline b\n\nsecond para");
    const paras = doc.content.filter((n) => n.type === "paragraph");
    expect(paras).toHaveLength(2);
    expect(paras[0].content?.[0]).toMatchObject({ text: "line a line b" });
  });

  it("represents an empty paragraph with no text children (ProseMirror rule)", () => {
    const doc = markdownToTipTapDoc("\n\n");
    expect(doc.content[0].type).toBe("paragraph");
    expect(doc.content[0].content ?? []).toHaveLength(0);
  });

  it("is total — does not throw on odd input", () => {
    expect(() => markdownToTipTapDoc("###### deep\n- \n>\n1.")).not.toThrow();
  });

  it("counts words from the source markdown", () => {
    expect(wordCount("the quick brown fox")).toBe(4);
    expect(wordCount("   ")).toBe(0);
  });
});
