import { describe, it, expect } from "vitest";
import { md5Hex } from "./md5";

// RFC 1321 appendix vectors plus padding-boundary cases (55/56/64 bytes are
// where the one-vs-two final block logic can silently break).
const enc = (s: string) => new TextEncoder().encode(s);

describe("md5Hex", () => {
  it("matches the RFC 1321 test suite", () => {
    expect(md5Hex(enc(""))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5Hex(enc("a"))).toBe("0cc175b9c0f1b6a831c399e269772661");
    expect(md5Hex(enc("abc"))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5Hex(enc("message digest"))).toBe("f96b697d7cb7938d525a2f31aaf161d0");
    expect(md5Hex(enc("abcdefghijklmnopqrstuvwxyz"))).toBe(
      "c3fcd3d76192e4007dfb496cca67e13b",
    );
    expect(
      md5Hex(enc("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")),
    ).toBe("d174ab98d277d9f5a5611c2c9f419d9f");
    expect(
      md5Hex(
        enc("12345678901234567890123456789012345678901234567890123456789012345678901234567890"),
      ),
    ).toBe("57edf4a22be3c955ac49da2e2107b67a");
  });

  it("handles the padding boundaries (55/56/64/65 bytes)", () => {
    // Independently computed with Node's crypto.createHash("md5").
    expect(md5Hex(enc("a".repeat(55)))).toBe("ef1772b6dff9a122358552954ad0df65");
    expect(md5Hex(enc("a".repeat(56)))).toBe("3b0c8ac703f828b04c6c197006d17218");
    expect(md5Hex(enc("a".repeat(64)))).toBe("014842d480b571495a4a0363793f7367");
    expect(md5Hex(enc("a".repeat(65)))).toBe("c743a45e0d2e6a95cb859adae0248435");
  });

  it("accepts ArrayBuffer input", () => {
    expect(md5Hex(enc("abc").buffer as ArrayBuffer)).toBe(
      "900150983cd24fb0d6963f7d28e17f72",
    );
  });
});
