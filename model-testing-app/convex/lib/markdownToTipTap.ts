// markdownToTipTap — minimal markdown → TipTap/ProseMirror doc-JSON bridge.
//
// The notes editor stores `content` as TipTap doc JSON ({ type: "doc", content: [] }),
// not markdown. Agents (via the note.* MCP tools) author in markdown, so this
// converts a markdown string into a valid StarterKit doc.
//
// Deliberately minimal and total (never throws on input): it handles the block
// shapes an agent realistically emits — headings (#..######), bullet lists
// (-/*), ordered lists (1.), blockquotes (>), and paragraphs separated by blank
// lines. Inline marks (bold/italic/links) are NOT parsed; the raw text is kept
// verbatim. Anything unrecognised degrades to a paragraph. Empty input yields a
// single empty paragraph (TipTap requires the doc to be non-degenerate).

type TipTapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
};

function textNodes(s: string): TipTapNode[] {
  // ProseMirror text nodes cannot be empty; an empty string becomes no children.
  return s.length ? [{ type: "text", text: s }] : [];
}

function paragraph(s: string): TipTapNode {
  return { type: "paragraph", content: textNodes(s) };
}

export function markdownToTipTapDoc(markdown: string): {
  type: "doc";
  content: TipTapNode[];
} {
  const src = (markdown ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = src.split("\n");
  const content: TipTapNode[] = [];

  let i = 0;
  let paraBuffer: string[] = [];

  const flushParagraph = () => {
    if (paraBuffer.length) {
      content.push(paragraph(paraBuffer.join(" ").trim()));
      paraBuffer = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — paragraph break.
    if (trimmed === "") {
      flushParagraph();
      i++;
      continue;
    }

    // Heading: #..###### .
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      content.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: textNodes(heading[2].trim()),
      });
      i++;
      continue;
    }

    // Bullet list: a run of - / * / + items.
    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      const items: TipTapNode[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, "");
        items.push({ type: "listItem", content: [paragraph(itemText)] });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // Ordered list: a run of `1.` items.
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items: TipTapNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push({ type: "listItem", content: [paragraph(itemText)] });
        i++;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    // Blockquote: a run of `>` lines.
    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      content.push({ type: "blockquote", content: [paragraph(quoteLines.join(" ").trim())] });
      continue;
    }

    // Plain text — accumulate into the current paragraph.
    paraBuffer.push(trimmed);
    i++;
  }

  flushParagraph();

  // TipTap needs at least one block node.
  if (content.length === 0) content.push({ type: "paragraph" });

  return { type: "doc", content };
}

// Rough word count for the notes.wordCount field, from the source markdown.
export function wordCount(markdown: string): number {
  const words = (markdown ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length;
}
