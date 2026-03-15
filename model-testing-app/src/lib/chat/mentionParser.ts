// src/lib/chat/mentionParser.ts

export interface ParsedMention {
  type: 'client' | 'project';
  name: string;
  id: string;
}

/**
 * Parse @ mentions from message text.
 * Format: @[Display Name](client:id) or @[Display Name](project:id)
 */
const MENTION_REGEX = /@\[([^\]]+)\]\((client|project):([^)]+)\)/g;

export function parseMentions(text: string): ParsedMention[] {
  const mentions: ParsedMention[] = [];
  let match;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    mentions.push({
      name: match[1],
      type: match[2] as 'client' | 'project',
      id: match[3],
    });
  }
  // Reset regex lastIndex for reuse
  MENTION_REGEX.lastIndex = 0;
  return mentions;
}

/**
 * Strip mention markup, leaving just @Name for the model to see.
 */
export function stripMentionMarkup(text: string): string {
  return text.replace(MENTION_REGEX, '@$1');
}
