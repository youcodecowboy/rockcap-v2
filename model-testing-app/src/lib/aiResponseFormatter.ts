/**
 * Formats AI response text into TipTap JSON structure
 * Detects markdown-style formatting and converts to TipTap nodes
 */

export interface Mentions {
  clients: string[];
  projects: string[];
  files: string[];
}

export function formatAIResponse(
  rawResponse: string,
  mentions: Mentions,
  clients?: any[],
  projects?: any[],
  documents?: any[]
): any {
  console.log('[formatAIResponse] Starting, response length:', rawResponse.length);
  // Parse markdown-style formatting and convert to TipTap JSON
  const lines = rawResponse.split('\n');
  console.log('[formatAIResponse] Split into', lines.length, 'lines');
  const content: any[] = [];
  let currentParagraph: any[] = [];
  let inList = false;
  let listType: 'bullet' | 'ordered' | null = null;
  let listItems: any[] = [];
  let orderedListStart = 1;

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      content.push({
        type: 'paragraph',
        content: currentParagraph,
      });
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      if (listType === 'ordered') {
        content.push({
          type: 'orderedList',
          content: listItems,
        });
      } else {
        content.push({
          type: 'bulletList',
          content: listItems,
        });
      }
      listItems = [];
      inList = false;
      listType = null;
      orderedListStart = 1;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    try {
      if (i % 20 === 0 || i < 5) {
        console.log(`[formatAIResponse] Processing line ${i}/${lines.length}`);
      }
      const line = lines[i].trim();
      
      // Skip empty lines (but flush current content)
      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }

    // Headings
    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: line.substring(4) }],
      });
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: line.substring(3) }],
      });
      continue;
    }
    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      content.push({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: line.substring(2) }],
      });
      continue;
    }

    // Divider
    if (line === '---' || line === '***' || line.match(/^-{3,}$/)) {
      flushParagraph();
      flushList();
      content.push({
        type: 'horizontalRule',
      });
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      content.push({
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: line.substring(2) }],
        }],
      });
      continue;
    }

    // Ordered list
    const orderedMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (!inList || listType !== 'ordered') {
        flushList();
        inList = true;
        listType = 'ordered';
        orderedListStart = parseInt(orderedMatch[1]);
      }
      listItems.push({
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: processTextWithMentions(orderedMatch[2], mentions, clients, projects, documents),
        }],
      });
      continue;
    }

    // Bullet list
    if (line.match(/^[-*]\s+(.+)$/)) {
      flushParagraph();
      if (!inList || listType !== 'bullet') {
        flushList();
        inList = true;
        listType = 'bullet';
      }
      const listContent = line.replace(/^[-*]\s+/, '');
      listItems.push({
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: processTextWithMentions(listContent, mentions, clients, projects, documents),
        }],
      });
      continue;
    }

    // Table (simple detection - markdown tables)
    // Only detect as table if it has multiple cells AND the next line is a separator
    if (line.includes('|') && line.split('|').length > 2) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c);
      // Check if this is a header row (next line is separator with dashes/pipes)
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const isHeader = nextLine.match(/^[-|: ]+$/);
      if (isHeader && cells.length > 1) {
        console.log(`[formatAIResponse] Found table at line ${i} with ${cells.length} columns`);
        flushParagraph();
        flushList();
        console.log(`[formatAIResponse] Processing table header with ${cells.length} columns`);
        // Create table with header
        const headerRow = {
          type: 'tableRow',
          content: cells.map(cell => ({
            type: 'tableHeader',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: cell }] }],
          })),
        };
        // Skip separator line
        i++;
        // Collect data rows
        const dataRows: any[] = [];
        let rowCount = 0;
        while (i + 1 < lines.length && lines[i + 1].includes('|')) {
          i++;
          rowCount++;
          if (rowCount > 100) {
            console.warn(`[formatAIResponse] Table parsing stopped after 100 rows to prevent infinite loop`);
            break;
          }
          const dataCells = lines[i].split('|').map(c => c.trim()).filter(c => c);
          if (dataCells.length === cells.length) {
            dataRows.push({
              type: 'tableRow',
              content: dataCells.map(cell => ({
                type: 'tableCell',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: cell }] }],
              })),
            });
          } else {
            // If cell count doesn't match, might be end of table
            console.log(`[formatAIResponse] Table row cell count mismatch (${dataCells.length} vs ${cells.length}), ending table`);
            break;
          }
        }
        console.log(`[formatAIResponse] Table completed with ${dataRows.length} data rows`);
        content.push({
          type: 'table',
          content: [headerRow, ...dataRows],
        });
        continue;
      }
    }

    // Regular paragraph text
    flushList();
    try {
      const processedText = processTextWithMentions(line, mentions, clients, projects, documents);
      currentParagraph.push(...processedText);
    } catch (processError) {
      console.error(`[formatAIResponse] Error processing line ${i}:`, processError);
      // Fallback: just add the text as-is
      currentParagraph.push({ type: 'text', text: line });
    }
    } catch (lineError) {
      console.error(`[formatAIResponse] Error processing line ${i}:`, lineError);
      console.error(`[formatAIResponse] Line content:`, lines[i]);
      // Skip this line and continue
      continue;
    }
  }
  
  console.log(`[formatAIResponse] Finished processing all ${lines.length} lines`);

  flushParagraph();
  flushList();

  console.log('[formatAIResponse] Completed, content items:', content.length);
  
  // Return content array (not wrapped in doc) since TipTap insertContent expects content array
  const result = content.length > 0 ? content : [{
    type: 'paragraph',
    content: [{ type: 'text', text: rawResponse }],
  }];
  
  console.log('[formatAIResponse] Returning result with', result.length, 'items');
  return result;
}

/**
 * Processes text and converts markdown formatting and mentions to TipTap nodes
 */
function processTextWithMentions(
  text: string,
  mentions: Mentions,
  clients?: any[],
  projects?: any[],
  documents?: any[]
): any[] {
  try {
    const result: any[] = [];
    let lastIndex = 0;

    // Find all potential mentions
    const mentionRanges: Array<{ start: number; end: number; type: 'client' | 'project' | 'file'; id: string; name: string }> = [];

    // Check for client mentions
    if (clients && clients.length > 0) {
      clients.forEach((client: any) => {
        if (mentions.clients.includes(client._id)) {
          const name = client.name;
          if (name && typeof name === 'string') {
            try {
              const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
              let match;
              let execCount = 0;
              while ((match = regex.exec(text)) !== null) {
                execCount++;
                if (execCount > 1000) {
                  console.warn(`[processTextWithMentions] Too many matches for client "${name}", stopping`);
                  break;
                }
                mentionRanges.push({
                  start: match.index,
                  end: match.index + match[0].length,
                  type: 'client',
                  id: client._id,
                  name: name,
                });
              }
            } catch (regexError) {
              console.error(`[processTextWithMentions] Error with regex for client "${name}":`, regexError);
            }
          }
        }
      });
    }

    // Check for project mentions
    if (projects && projects.length > 0) {
      projects.forEach((project: any) => {
        if (mentions.projects.includes(project._id)) {
          const name = project.name;
          if (name && typeof name === 'string') {
            try {
              const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
              let match;
              let execCount = 0;
              while ((match = regex.exec(text)) !== null) {
                execCount++;
                if (execCount > 1000) {
                  console.warn(`[processTextWithMentions] Too many matches for project "${name}", stopping`);
                  break;
                }
                mentionRanges.push({
                  start: match.index,
                  end: match.index + match[0].length,
                  type: 'project',
                  id: project._id,
                  name: name,
                });
              }
            } catch (regexError) {
              console.error(`[processTextWithMentions] Error with regex for project "${name}":`, regexError);
            }
          }
        }
      });
    }

    // Check for file mentions
    if (documents && documents.length > 0) {
      documents.forEach((doc: any) => {
        if (mentions.files.includes(doc._id)) {
          const name = doc.fileName || doc.name;
          if (name && typeof name === 'string') {
            try {
              const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi');
              let match;
              let execCount = 0;
              while ((match = regex.exec(text)) !== null) {
                execCount++;
                if (execCount > 1000) {
                  console.warn(`[processTextWithMentions] Too many matches for file "${name}", stopping`);
                  break;
                }
                mentionRanges.push({
                  start: match.index,
                  end: match.index + match[0].length,
                  type: 'file',
                  id: doc._id,
                  name: name,
                });
              }
            } catch (regexError) {
              console.error(`[processTextWithMentions] Error with regex for file "${name}":`, regexError);
            }
          }
        }
      });
    }

    // Sort mentions by position
    mentionRanges.sort((a, b) => a.start - b.start);

    // Build content array with links and markdown formatting
    mentionRanges.forEach((mention) => {
      // Add text before mention (with markdown parsing)
      if (mention.start > lastIndex) {
        const beforeText = text.substring(lastIndex, mention.start);
        if (beforeText) {
          const parsedBefore = parseMarkdownInline(beforeText);
          result.push(...parsedBefore);
        }
      }

      // Add link (mention name itself might have markdown, but links usually don't)
      let href = '#';
      if (mention.type === 'client') {
        href = `/clients/${mention.id}`;
      } else if (mention.type === 'project') {
        href = `/projects/${mention.id}`;
      } else if (mention.type === 'file') {
        href = `/docs/${mention.id}`;
      }

      result.push({
        type: 'text',
        marks: [{
          type: 'link',
          attrs: {
            href: href,
          },
        }],
        text: mention.name,
      });

      lastIndex = mention.end;
    });

    // Add remaining text (with markdown parsing)
    if (lastIndex < text.length) {
      const remaining = text.substring(lastIndex);
      if (remaining) {
        const parsedRemaining = parseMarkdownInline(remaining);
        result.push(...parsedRemaining);
      }
    }

    // If no mentions, return parsed markdown
    if (result.length === 0) {
      return parseMarkdownInline(text);
    }

    return result;
  } catch (error) {
    console.error('[processTextWithMentions] Error:', error);
    // Fallback: just parse markdown inline
    return parseMarkdownInline(text);
  }
}

/**
 * Parses markdown inline formatting (**bold**, *italic*, etc.) and converts to TipTap marks
 */
function parseMarkdownInline(text: string): Array<{ type: string; text: string; marks?: any[] }> {
  const result: Array<{ type: string; text: string; marks?: any[] }> = [];
  let i = 0;
  
  while (i < text.length) {
    // Check for **bold** (double asterisk)
    if (text.substring(i, i + 2) === '**') {
      const endIndex = text.indexOf('**', i + 2);
      if (endIndex !== -1) {
        // Found bold text
        const boldText = text.substring(i + 2, endIndex);
        if (boldText.length > 0) {
          result.push({
            type: 'text',
            text: boldText,
            marks: [{ type: 'bold' }],
          });
        }
        i = endIndex + 2;
        continue;
      }
    }
    
    // Check for *italic* (single asterisk, but not part of **)
    if (text[i] === '*' && (i === 0 || text[i - 1] !== '*') && (i + 1 >= text.length || text[i + 1] !== '*')) {
      const endIndex = text.indexOf('*', i + 1);
      if (endIndex !== -1 && (endIndex + 1 >= text.length || text[endIndex + 1] !== '*')) {
        // Found italic text
        const italicText = text.substring(i + 1, endIndex);
        if (italicText.length > 0) {
          result.push({
            type: 'text',
            text: italicText,
            marks: [{ type: 'italic' }],
          });
        }
        i = endIndex + 1;
        continue;
      }
    }
    
    // Check for __bold__ (double underscore)
    if (text.substring(i, i + 2) === '__') {
      const endIndex = text.indexOf('__', i + 2);
      if (endIndex !== -1) {
        // Found bold text
        const boldText = text.substring(i + 2, endIndex);
        if (boldText.length > 0) {
          result.push({
            type: 'text',
            text: boldText,
            marks: [{ type: 'bold' }],
          });
        }
        i = endIndex + 2;
        continue;
      }
    }
    
    // Check for _italic_ (single underscore, but not part of __)
    if (text[i] === '_' && (i === 0 || text[i - 1] !== '_') && (i + 1 >= text.length || text[i + 1] !== '_')) {
      const endIndex = text.indexOf('_', i + 1);
      if (endIndex !== -1 && (endIndex + 1 >= text.length || text[endIndex + 1] !== '_')) {
        // Found italic text
        const italicText = text.substring(i + 1, endIndex);
        if (italicText.length > 0) {
          result.push({
            type: 'text',
            text: italicText,
            marks: [{ type: 'italic' }],
          });
        }
        i = endIndex + 1;
        continue;
      }
    }
    
    // Regular character - find the next markdown formatting or end of string
    let nextMarkdown = text.length;
    
    // Find next potential markdown formatting
    const boldDouble = text.indexOf('**', i);
    const boldUnderscore = text.indexOf('__', i);
    const italicAsterisk = text.indexOf('*', i + 1);
    const italicUnderscore = text.indexOf('_', i + 1);
    
    if (boldDouble !== -1 && boldDouble < nextMarkdown) nextMarkdown = boldDouble;
    if (boldUnderscore !== -1 && boldUnderscore < nextMarkdown) nextMarkdown = boldUnderscore;
    if (italicAsterisk !== -1 && italicAsterisk < nextMarkdown && 
        (italicAsterisk === 0 || text[italicAsterisk - 1] !== '*') &&
        (italicAsterisk + 1 >= text.length || text[italicAsterisk + 1] !== '*')) {
      nextMarkdown = italicAsterisk;
    }
    if (italicUnderscore !== -1 && italicUnderscore < nextMarkdown &&
        (italicUnderscore === 0 || text[italicUnderscore - 1] !== '_') &&
        (italicUnderscore + 1 >= text.length || text[italicUnderscore + 1] !== '_')) {
      nextMarkdown = italicUnderscore;
    }
    
    const plainText = text.substring(i, nextMarkdown);
    if (plainText.length > 0) {
      result.push({
        type: 'text',
        text: plainText,
      });
    }
    i = nextMarkdown;
  }
  
  // If no markdown was found, return plain text
  if (result.length === 0) {
    return [{ type: 'text', text: text }];
  }
  
  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

