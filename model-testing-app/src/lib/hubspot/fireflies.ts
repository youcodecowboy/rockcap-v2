/**
 * Fireflies.ai call-transcript detection + parsing.
 *
 * HubSpot does NOT attach any integration-source metadata to
 * Fireflies-generated notes (no source, sourceId, appId — the note is
 * created via the account owner's OAuth token, so from HubSpot's
 * perspective it looks like a manual note). HubSpot's UI label "Note
 * created via Fireflies.ai Call Transcripts" is inferred from body
 * content alone.
 *
 * We use the same approach: content-based detection. Fireflies outputs
 * an extremely consistent HTML template for every transcript. Two
 * signals both must be present for classification:
 *
 *   1. URL pattern `https://app.fireflies.ai/view/{id}` — present in
 *      every transcript (header link + body time-markers + footer).
 *   2. Boilerplate phrase `"Time markers in this document"` — appears
 *      only in Fireflies-generated notes, not in human notes that
 *      merely reference a Fireflies URL.
 *
 * Both together give near-zero false-positive rate while staying
 * robust to individual-field variations.
 */

const FIREFLIES_URL_RX = /https:\/\/app\.fireflies\.ai\/view\/([A-Za-z0-9]+)/i;
const TIME_MARKERS_RX = /Time markers in this document/i;
const EMAIL_RX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const H3_CONTENT_RX = /<h3[^>]*>([^<]+)<\/h3>/i;
const DURATION_MINS_RX = /<p[^>]*>\s*(\d+)\s*mins?\s*<\/p>/i;

/**
 * True iff `bodyHtml` is a Fireflies.ai-generated call transcript
 * (as opposed to a human note that merely references one).
 */
export function isFirefliesTranscript(bodyHtml: string | null | undefined): boolean {
  if (!bodyHtml) return false;
  return FIREFLIES_URL_RX.test(bodyHtml) && TIME_MARKERS_RX.test(bodyHtml);
}

export interface FirefliesTranscript {
  /** Meeting title from the top-level <h3>. Undefined if not present. */
  title?: string;
  /** Fireflies-hosted transcript URL. Undefined if not present. */
  transcriptUrl?: string;
  /** Meeting duration in milliseconds. Undefined if not parseable. */
  duration?: number;
  /** Participant email addresses, deduplicated. Empty array if none found. */
  participantEmails: string[];
}

/**
 * Extract structured fields from a Fireflies transcript's HTML body.
 * Every field is defensively best-effort — missing extraction returns
 * undefined / empty rather than throwing, so a template drift can
 * degrade gracefully rather than break the handler.
 */
export function parseFirefliesTranscript(bodyHtml: string): FirefliesTranscript {
  // Title — first <h3> content
  const titleMatch = bodyHtml.match(H3_CONTENT_RX);
  const title = titleMatch?.[1]?.trim();

  // Transcript URL — first Fireflies view URL
  const urlMatch = bodyHtml.match(FIREFLIES_URL_RX);
  const transcriptUrl = urlMatch?.[0];

  // Duration — "N mins" in its own <p> near the top
  const durationMatch = bodyHtml.match(DURATION_MINS_RX);
  const duration = durationMatch
    ? parseInt(durationMatch[1], 10) * 60 * 1000
    : undefined;

  // Participant emails — dedupe and preserve first-seen order
  const allEmails = bodyHtml.match(EMAIL_RX) ?? [];
  const seen = new Set<string>();
  const participantEmails: string[] = [];
  for (const e of allEmails) {
    const lower = e.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      participantEmails.push(e);
    }
  }

  return {
    title,
    transcriptUrl,
    duration,
    participantEmails,
  };
}
