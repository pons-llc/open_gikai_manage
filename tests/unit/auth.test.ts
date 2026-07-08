import { describe, expect, it } from "vitest";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../../src/lib/auth";

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password against its own hash", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces a different hash (different salt) for the same password each time", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("stores the hash in the pbkdf2$iterations$salt$hash format", async () => {
    const hash = await hashPassword("whatever");
    expect(hash).toMatch(/^pbkdf2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it("rejects against the dummy hash used for timing-safe user-enumeration defense", async () => {
    expect(await verifyPassword("anything", DUMMY_PASSWORD_HASH)).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("whatever", "not-a-valid-hash")).toBe(false);
  });
});
