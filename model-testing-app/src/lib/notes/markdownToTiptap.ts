/**
 * Converts markdown text to TipTap JSON document format.
 * Hand-rolled parser — no external dependencies.
 *
 * Supports: headings, bold, italic, strikethrough, links, bullet lists,
 * numbered lists, task lists, tables, code blocks, blockquotes,
 * horizontal rules.
 */

// ---------- TipTap node/mark types ----------

interface TipTapMark {
  type: string;
  attrs?: Record<string, any>;
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, any>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
}

interface TipTapDocument {
  type: 'doc';
  content: TipTapNode[];
}

// ---------- Inline parsing (marks) ----------

/** Parse inline markdown (bold, italic, strikethrough, links) into text nodes with marks. */
function parseInline(text: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  // Regex for inline patterns — order matters (bold before italic)
  // Matches: **bold**, *italic*, ~~strikethrough~~, [text](url), `code`
  const inlineRegex =
    /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|\[(.+?)\]\((.+?)\)|`(.+?)`)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      // ***bold italic***
      nodes.push({
        type: 'text',
        text: match[2],
        marks: [{ type: 'bold' }, { type: 'italic' }],
      });
    } else if (match[3]) {
      // **bold**
      nodes.push({
        type: 'text',
        text: match[3],
        marks: [{ type: 'bold' }],
      });
    } else if (match[4]) {
      // *italic*
      nodes.push({
        type: 'text',
        text: match[4],
        marks: [{ type: 'italic' }],
      });
    } else if (match[5]) {
      // ~~strikethrough~~
      nodes.push({
        type: 'text',
        text: match[5],
        marks: [{ type: 'strike' }],
      });
    } else if (match[6] && match[7]) {
      // [text](url)
      nodes.push({
        type: 'text',
        text: match[6],
        marks: [{ type: 'link', attrs: { href: match[7], target: '_blank' } }],
      });
    } else if (match[8]) {
      // `inline code`
      nodes.push({
        type: 'text',
        text: match[8],
        marks: [{ type: 'code' }],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    nodes.push({ type: 'text', text: text.slice(lastIndex) });
  }

  // If no matches at all, return the whole thing as plain text
  if (nodes.length === 0 && text.length > 0) {
    nodes.push({ type: 'text', text });
  }

  return nodes;
}

/** Create a paragraph node with inline-parsed content. */
function paragraph(text: string): TipTapNode {
  const trimmed = text.trim();
  if (!trimmed) {
    return { type: 'paragraph' };
  }
  return { type: 'paragraph', content: parseInline(trimmed) };
}

// ---------- Block parsing ----------

/** Check if a line is a table separator row (e.g., |---|---|). */
function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

/** Parse a table row into cell contents. */
function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

/** Parse a markdown pipe table into a TipTap table node. */
function parseTable(lines: string[]): TipTapNode {
  const rows: TipTapNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    // Skip separator rows
    if (isTableSeparator(lines[i])) continue;

    const cells = parseTableRow(lines[i]);
    const isHeader = i === 0;

    const cellNodes: TipTapNode[] = cells.map(cellText => ({
      type: isHeader ? 'tableHeader' : 'tableCell',
      content: [paragraph(cellText)],
    }));

    rows.push({
      type: 'tableRow',
      content: cellNodes,
    });
  }

  return { type: 'table', content: rows };
}

/** Parse a code block (between ``` fences) into a TipTap codeBlock node. */
function parseCodeBlock(lines: string[], language?: string): TipTapNode {
  const code = lines.join('\n');
  return {
    type: 'codeBlock',
    attrs: language ? { language } : undefined,
    content: code ? [{ type: 'text', text: code }] : undefined,
  };
}

/** Parse list items (bullet, numbered, or task) into TipTap list nodes. */
function parseListItems(
  items: { text: string; checked?: boolean }[],
  listType: 'bulletList' | 'orderedList' | 'taskList'
): TipTapNode {
  const listItems: TipTapNode[] = items.map(item => {
    const node: TipTapNode = {
      type: listType === 'taskList' ? 'taskItem' : 'listItem',
      content: [paragraph(item.text)],
    };
    if (listType === 'taskList') {
      node.attrs = { checked: item.checked ?? false };
    }
    return node;
  });

  return { type: listType, content: listItems };
}

// ---------- Main converter ----------

/**
 * Convert a markdown string to a TipTap JSON document.
 * Returns a TipTap-compatible document object ready for storage.
 */
export function markdownToTiptap(markdown: string): TipTapDocument {
  const lines = markdown.split('\n');
  const content: TipTapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // --- Empty line → empty paragraph ---
    if (!trimmed) {
      // Only add empty paragraph if we have prior content (avoid leading blanks)
      if (content.length > 0) {
        content.push({ type: 'paragraph' });
      }
      i++;
      continue;
    }

    // --- Code block (fenced) ---
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      content.push(parseCodeBlock(codeLines, language));
      i++; // skip closing ```
      continue;
    }

    // --- Headings ---
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      content.push({
        type: 'heading',
        attrs: { level },
        content: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // --- Horizontal rule ---
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      content.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // --- Table ---
    if (trimmed.startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const tableLines: string[] = [lines[i]];
      i++;
      while (i < lines.length && (lines[i].trim().startsWith('|') || isTableSeparator(lines[i]))) {
        tableLines.push(lines[i]);
        i++;
      }
      content.push(parseTable(tableLines));
      continue;
    }

    // --- Stray pipe line (not a valid table) — treat as paragraph ---
    if (trimmed.startsWith('|')) {
      content.push(paragraph(trimmed));
      i++;
      continue;
    }

    // --- Blockquote ---
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      content.push({
        type: 'blockquote',
        content: [paragraph(quoteLines.join(' '))],
      });
      continue;
    }

    // --- Task list ---
    if (/^[-*]\s+\[([ xX])\]\s/.test(trimmed)) {
      const items: { text: string; checked: boolean }[] = [];
      while (i < lines.length) {
        const taskMatch = lines[i].trim().match(/^[-*]\s+\[([ xX])\]\s(.+)$/);
        if (!taskMatch) break;
        items.push({
          text: taskMatch[2],
          checked: taskMatch[1].toLowerCase() === 'x',
        });
        i++;
      }
      content.push(parseListItems(items, 'taskList'));
      continue;
    }

    // --- Bullet list ---
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: { text: string }[] = [];
      while (i < lines.length) {
        const bulletMatch = lines[i].trim().match(/^[-*+]\s+(.+)$/);
        if (!bulletMatch) break;
        items.push({ text: bulletMatch[1] });
        i++;
      }
      content.push(parseListItems(items, 'bulletList'));
      continue;
    }

    // --- Numbered list ---
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: { text: string }[] = [];
      while (i < lines.length) {
        const numMatch = lines[i].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!numMatch) break;
        items.push({ text: numMatch[1] });
        i++;
      }
      content.push(parseListItems(items, 'orderedList'));
      continue;
    }

    // --- Plain paragraph (default) ---
    // Accumulate consecutive non-special lines into a single paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      content.push(paragraph(paraLines.join(' ')));
    }
  }

  // Ensure there's at least one node
  if (content.length === 0) {
    content.push({ type: 'paragraph' });
  }

  return { type: 'doc', content };
}

/**
 * Detect whether content is already TipTap JSON or a plain string.
 * Returns true if it looks like TipTap JSON (has type: 'doc').
 */
export function isTipTapJson(content: any): boolean {
  return (
    content !== null &&
    typeof content === 'object' &&
    content.type === 'doc' &&
    Array.isArray(content.content)
  );
}

/**
 * Ensure content is in TipTap JSON format.
 * If it's a string, convert from markdown. If already JSON, pass through.
 */
export function ensureTipTapContent(content: any): TipTapDocument {
  if (isTipTapJson(content)) {
    return content as TipTapDocument;
  }
  if (typeof content === 'string') {
    return markdownToTiptap(content);
  }
  // Fallback: wrap unknown content as-is
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}
