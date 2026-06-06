// Extract a JSON object from an LLM text response that may wrap it in
// prose and/or markdown code fences. Models prompted "return only JSON"
// still sometimes preface the payload with reasoning ("I'll compose a
// warm reply... ```json {...} ```"), which broke the strict
// strip-edges-then-JSON.parse approach in the cadence bridge routes.
//
// Strategy: prefer the first fenced ```json block anywhere in the text;
// otherwise take the first balanced {...} span (string-aware so braces
// inside JSON string values don't fool the depth counter). Returns null
// when no candidate object is found — callers keep their own JSON.parse
// try/catch as the final validity check.
export function extractJsonObject(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const inner = fence[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
