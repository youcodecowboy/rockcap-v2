// =============================================================================
// VISION TEXT EXTRACTION (multimodal fallback)
// =============================================================================
// Faithful-transcription fallback for documents that carry NO text layer:
// image documents (PNG/JPG term sheets) and scanned image-only PDFs. The
// server-side parsers (pdf-parse / xlsx / mammoth) produce nothing for these,
// so without this fallback they contribute zero atoms to the knowledge
// pipeline. This module sends the raw bytes to Claude and asks for a verbatim
// transcription — the extract-text route then hands that text to atomize
// exactly as if the parser had produced it.
//
// Reuses the SAME client setup, env key, and model constant the v4 classifier
// pipeline uses (see src/v4/lib/anthropic-client.ts + src/v4/types.ts):
//   - env key   : ANTHROPIC_API_KEY
//   - model     : claude-haiku-4-5-20251001 (DEFAULT_V4_CONFIG.primaryModel)
//   - PDF blocks: { type: 'document', source: { type: 'base64', media_type:
//                  'application/pdf', data } } — supported natively, no beta.
//   - image blks: { type: 'image', source: { type: 'base64', media_type, data } }
// Streaming is used (like callAnthropicBatch) to avoid the non-streaming
// timeout rejection on high max_tokens.

// Model + env parity with the v4 pipeline. Do not invent new ids — this is the
// primaryModel from DEFAULT_V4_CONFIG.
const VISION_MODEL = 'claude-haiku-4-5-20251001';

// Anthropic's document/image request budget is 32MB; cap well under it so a
// base64-inflated payload (~1.33x) still fits, and to bound cost/latency.
const MAX_VISION_BYTES = 20 * 1024 * 1024; // ~20MB

// Anthropic caps PDF document blocks at 100 pages for 200K-context models
// (Haiku 4.5 is 200K). Reject larger PDFs rather than let the API 400.
const MAX_PDF_PAGES = 100;

// Anthropic image blocks accept only these media types. HEIC/HEIF/BMP/TIFF are
// NOT supported — surface a clear error rather than a raw API 400.
const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const TRANSCRIPTION_PROMPT = `You are a faithful document transcriber. Transcribe ALL text visible in this document verbatim, exactly as written.

Rules:
- Preserve the reading order and document structure (headings, sections, lists).
- Render any tables as GitHub-flavored markdown tables.
- Keep headings as markdown headings (#, ##, …) matching the visual hierarchy.
- Do NOT summarize, paraphrase, correct, translate, or add commentary of any kind.
- Transcribe numbers, dates, amounts, and identifiers exactly as shown.
- For any region you genuinely cannot read, write [illegible] in its place.
- Output ONLY the transcription — no preamble, no explanation, no closing remarks.`;

export type VisionKind = 'image' | 'pdf';

/**
 * Resolve the Anthropic media_type for an image from its mime and/or filename.
 * Returns null for image formats Anthropic does not accept (HEIC/BMP/TIFF/…).
 */
function resolveImageMediaType(mimeType: string, fileName: string): string | null {
  const mt = (mimeType || '').toLowerCase();
  if (SUPPORTED_IMAGE_MEDIA_TYPES.has(mt)) return mt;
  if (mt === 'image/jpg') return 'image/jpeg';
  const name = fileName.toLowerCase();
  if (/\.jpe?g$/.test(name)) return 'image/jpeg';
  if (/\.png$/.test(name)) return 'image/png';
  if (/\.gif$/.test(name)) return 'image/gif';
  if (/\.webp$/.test(name)) return 'image/webp';
  return null;
}

/**
 * Transcribe a text-less document (image or scanned PDF) with Claude vision.
 *
 * Throws on: missing API key, oversize file, over-cap PDF page count,
 * unsupported image type, or an empty model response. The extract-text route
 * catches these and returns its existing 422 rather than a fake success.
 */
export async function extractTextViaVision(
  file: File,
  kind: VisionKind,
  opts?: { pages?: number },
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('vision fallback unavailable: ANTHROPIC_API_KEY not set');
  }

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error('vision fallback: file is empty');
  }
  if (buffer.byteLength > MAX_VISION_BYTES) {
    throw new Error(
      `vision fallback: file too large (${buffer.byteLength} bytes > ${MAX_VISION_BYTES} cap)`,
    );
  }

  let contentBlock: any;
  if (kind === 'pdf') {
    if (typeof opts?.pages === 'number' && opts.pages > MAX_PDF_PAGES) {
      throw new Error(
        `vision fallback: PDF has ${opts.pages} pages (> ${MAX_PDF_PAGES} page cap)`,
      );
    }
    contentBlock = {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: Buffer.from(buffer).toString('base64'),
      },
    };
  } else {
    const mediaType = resolveImageMediaType(file.type, file.name);
    if (!mediaType) {
      throw new Error(
        `vision fallback: unsupported image type "${file.type || file.name}" (supported: jpeg, png, gif, webp)`,
      );
    }
    contentBlock = {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: Buffer.from(buffer).toString('base64'),
      },
    };
  }

  // Dynamic import mirrors callAnthropicBatch — avoids build issues if the SDK
  // isn't present and keeps the module cold-start-light.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });

  // Streaming avoids Anthropic's non-streaming timeout rejection at high
  // max_tokens (a dense scanned page can transcribe to a lot of text).
  const stream = client.messages.stream({
    model: VISION_MODEL,
    max_tokens: 16000,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [contentBlock, { type: 'text', text: TRANSCRIPTION_PROMPT }],
      },
    ],
  } as any);
  const response = await stream.finalMessage();

  const text = response.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')
    .trim();

  if (!text) {
    throw new Error('vision fallback: model produced no text');
  }
  return text;
}
