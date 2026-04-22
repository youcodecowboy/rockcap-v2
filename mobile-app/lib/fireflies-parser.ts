/**
 * Parse a Fireflies-generated HTML transcript body into structured
 * sections for native-component rendering.
 *
 * The input is the `bodyHtml` field from a MEETING_NOTE activity
 * (already verified as a Fireflies transcript — don't re-check).
 *
 * Graceful degradation: if the structure doesn't match expectations,
 * returns empty arrays / undefined fields. Caller renders a fallback
 * "couldn't parse, tap to open in Fireflies" state.
 */

export interface FirefliesBodyParsed {
  /** Transcript sections — each has a heading + prose summary + bullets. */
  sections: FirefliesSection[];
  /** Action items grouped by person. Empty array if none. */
  actionItems: FirefliesActionItemGroup[];
  /** The canonical Fireflies view URL, if found (usually also stored on
   * the activity itself — this is a fallback). */
  recordingUrl?: string;
}

export interface FirefliesSection {
  heading: string;
  /** Intro paragraph text (stripped of HTML), may be empty. */
  summary: string;
  /** Top-level bullets. Each bullet may have nested sub-bullets. */
  bullets: FirefliesBullet[];
}

export interface FirefliesBullet {
  /** Text of the bullet, with optional time-marker URL at the end. */
  text: string;
  /** If the bullet's text included a time-marker link, the URL. */
  timeMarkerUrl?: string;
  /** Nested bullets (one level deep). */
  children: FirefliesBullet[];
}

export interface FirefliesActionItemGroup {
  person: string;
  items: FirefliesBullet[];
}

/**
 * Strip HTML tags and decode common entities. Not a sanitiser — just
 * converts template output to plain text for display.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the first Fireflies `app.fireflies.ai/view/...` URL inside
 * an HTML snippet. Used to pull the time-marker URL out of bullet text.
 */
function extractFirstFirefliesUrl(html: string): string | undefined {
  const m = html.match(/https:\/\/app\.fireflies\.ai\/view\/[A-Za-z0-9]+(?:\?t=\d+)?/i);
  return m ? m[0] : undefined;
}

export function parseFirefliesBody(html: string): FirefliesBodyParsed {
  if (!html) {
    return { sections: [], actionItems: [] };
  }

  // Strip the header meta block (title, date, time, duration, emails,
  // "View Meeting Recording" link) up to the first <hr>. Everything
  // after that <hr> is the structured transcript.
  let remaining = html;
  const firstHrIdx = remaining.search(/<hr\s*\/?>/i);
  if (firstHrIdx >= 0) {
    remaining = remaining.slice(firstHrIdx);
  }

  // Split into sections on <h4>. Each section's content runs until the
  // next <h4> or the closing <hr> footer.
  const sectionRegex = /<h4[^>]*>([\s\S]*?)<\/h4>([\s\S]*?)(?=<h4[^>]*>|<hr\s*\/?>|$)/gi;
  const sections: FirefliesSection[] = [];
  const actionItems: FirefliesActionItemGroup[] = [];

  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(remaining)) !== null) {
    const headingHtml = match[1];
    const bodyHtml = match[2];
    const headingText = stripHtml(headingHtml);

    if (/action\s*items?/i.test(headingText)) {
      // Switch to parsing action-items groups: <h3>Person</h3><ul>...</ul>
      const personRegex = /<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3[^>]*>|$)/gi;
      let pm: RegExpExecArray | null;
      while ((pm = personRegex.exec(bodyHtml)) !== null) {
        const person = stripHtml(pm[1]);
        const items = parseBullets(pm[2]);
        if (person && items.length > 0) {
          actionItems.push({ person, items });
        }
      }
      continue;
    }

    // Regular section: first <p> is the summary paragraph, followed by
    // a <ul> of bullets (which may contain nested <ul>s).
    const summaryMatch = bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const summary = summaryMatch ? stripHtml(summaryMatch[1]) : '';
    const bullets = parseBullets(bodyHtml);

    sections.push({ heading: headingText, summary, bullets });
  }

  const recordingUrl = extractFirstFirefliesUrl(html);

  return { sections, actionItems, recordingUrl };
}

/**
 * Extract top-level <li> items from an HTML fragment, each with
 * optional nested children. Only handles one level of nesting — fits
 * the Fireflies template which doesn't go deeper.
 */
function parseBullets(html: string): FirefliesBullet[] {
  // First, find the outer <ul>. If none, return empty.
  const ulMatch = html.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (!ulMatch) return [];

  const ulContent = ulMatch[1];

  // Split into top-level <li> entries. Tricky because nested <ul> means
  // we can't just split on `<li>` — we need to balance the tags. Use a
  // small state machine.
  const bullets: FirefliesBullet[] = [];
  let depth = 0;
  let currentStart = -1;

  const tagRegex = /<\/?(?:li|ul)[^>]*>/gi;
  let tagMatch: RegExpExecArray | null;

  while ((tagMatch = tagRegex.exec(ulContent)) !== null) {
    const tag = tagMatch[0].toLowerCase();
    const isClosing = tag.startsWith('</');
    const isLi = /<\/?li/i.test(tag);
    const isUl = /<\/?ul/i.test(tag);

    if (depth === 0 && !isClosing && isLi) {
      // Starting a top-level <li>
      currentStart = tagMatch.index + tag.length;
      depth = 1;
    } else if (!isClosing && (isLi || isUl)) {
      depth++;
    } else if (isClosing && (isLi || isUl)) {
      depth--;
      if (depth === 0 && isLi && currentStart >= 0) {
        // Ended a top-level <li>. Extract content.
        const liContent = ulContent.slice(currentStart, tagMatch.index);
        bullets.push(parseOneBullet(liContent));
        currentStart = -1;
      }
    }
  }

  return bullets;
}

/**
 * Parse a single <li>'s inner content into a bullet with optional
 * time marker and nested children.
 */
function parseOneBullet(liContent: string): FirefliesBullet {
  // Nested <ul> — extract into children, strip from text
  const nestedUlMatch = liContent.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
  let children: FirefliesBullet[] = [];
  let textPart = liContent;
  if (nestedUlMatch) {
    children = parseBullets(nestedUlMatch[0]);
    textPart = liContent.slice(0, liContent.indexOf(nestedUlMatch[0]));
  }

  const timeMarkerUrl = extractFirstFirefliesUrl(textPart);
  const text = stripHtml(textPart);

  return { text, timeMarkerUrl, children };
}
