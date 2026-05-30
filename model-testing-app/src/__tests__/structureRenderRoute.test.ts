import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "../app/api/structure/render/route";
import { birkettHallGraph } from "../lib/structure/fixtures/birkettHall";

beforeAll(() => { process.env.CONVEX_INTERNAL_SECRET = "test-secret"; });

function req(body: unknown, secret = "test-secret") {
  return new Request("http://localhost/api/structure/render", {
    method: "POST",
    headers: { "content-type": "application/json", "x-convex-internal-secret": secret },
    body: JSON.stringify(body),
  });
}

describe("POST /api/structure/render", () => {
  it("401s without the internal secret", async () => {
    const res = await POST(req({ graph: birkettHallGraph }, "wrong") as never);
    expect(res.status).toBe(401);
  });
  it("returns svg + dataUri + verdict for a graph", async () => {
    const res = await POST(req({ graph: birkettHallGraph }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.svg).toContain("<svg");
    expect(json.dataUri).toContain("data:image/svg+xml,");
    expect(json.verdict.structureConfidence).toBe("medium");
  });
});
