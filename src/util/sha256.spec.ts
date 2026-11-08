import { describe, expect, it } from "vitest";

import { sha256, sha256Base64 } from "./sha256";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("sha256", () => {
  it("matches the standard test vectors", () => {
    expect(hex(sha256(new Uint8Array()))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(hex(sha256(new TextEncoder().encode("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(
      hex(
        sha256(new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))
      )
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("agrees with Node's crypto across block boundaries (values from crypto.createHash)", () => {
    const node: Record<number, string> = {
      1: "jCV0iSBj+ZX991a84H9GwaUZPlTNUoN+2R4yAIzPQaw=",
      55: "PLwyoY3xSFJMkKTe3i9gHwyxZyAg9vaRlNxKbcC7640=",
      56: "BWMHuUUfalQlzjJ33nz09gfPF80qZpmJ67Bc/313GHo=",
      63: "zr4wS0CrSgPAYHPJB5hjHorkqtmcKZ2kLOji0bfH0sM=",
      64: "9aSWHhMZR0ivDP2EjOSxLfGRiMuAibCpuuco2rjo2X4=",
      65: "JYx6ihu9l7VBOrIleYk0YjdHNRVo25nhcuW6VDbWfv0=",
      119: "LfN1iD2qXmUo8zzfihrbuu+3PEojNIPyKArOKFcmZLs=",
      128: "zWY54D2f+UTFCfCvjruKLzRYJ9yoSZoYkNH0xKK/WOA=",
      1000: "6zAr6qoPFzUZiDeaObwvbQ22u8agfgTipLzx9vKzLwU=",
    };
    for (const [n, digest] of Object.entries(node)) {
      expect(sha256Base64("Reolink-NVR-UID-".repeat(80).slice(0, Number(n)))).toBe(digest);
    }
    expect(sha256Base64("é UID ✓")).toBe("GBpKMpSoKZQOKRH+JJp2o3XCXtSj6mCSyYz3Jhb8Chs=");
  });
});
