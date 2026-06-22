import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  isValidEmail,
  generateOtpCode,
  generateSessionToken,
} from "./auth";

describe("email normalization", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
    expect(normalizeEmail("User.Name@Domain.Org")).toBe("user.name@domain.org");
  });

  it("produces consistent output for same email with different casing", () => {
    expect(normalizeEmail("Test@Example.com")).toBe(normalizeEmail("test@example.com"));
    expect(normalizeEmail("TEST@EXAMPLE.COM")).toBe(normalizeEmail("test@example.com"));
  });

  it("same normalized email does not create duplicate users", () => {
    // The normalizeEmail function is the identity used for unique constraint
    const a = normalizeEmail("  Alice@Runory.io  ");
    const b = normalizeEmail("alice@runory.io");
    expect(a).toBe(b);
  });
});

describe("email validation", () => {
  it("accepts valid emails", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("a.b@c.d.org")).toBe(true);
    expect(isValidEmail("test+tag@domain.io")).toBe(true);
  });

  it("rejects invalid emails", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user@.com")).toBe(false);
    expect(isValidEmail("user@domain")).toBe(false);
  });

  it("rejects emails longer than 254 characters", () => {
    const longEmail = "a".repeat(250) + "@b.co";
    expect(isValidEmail(longEmail)).toBe(false);
  });
});

describe("OTP code generation", () => {
  it("generates a 6-digit code", () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(code.length).toBe(6);
  });

  it("generates different codes on subsequent calls", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateOtpCode());
    }
    // With 1M possible codes, collisions in 100 draws are extremely unlikely
    expect(codes.size).toBeGreaterThan(90);
  });

  it("pads with leading zeros", () => {
    // Code 0 should be "000000"
    let foundPadded = false;
    for (let i = 0; i < 1000; i++) {
      const code = generateOtpCode();
      if (code.startsWith("0")) {
        foundPadded = true;
        expect(code).toMatch(/^\d{6}$/);
        break;
      }
    }
    // Very likely to find at least one padded code in 1000 draws
    expect(foundPadded).toBe(true);
  });
});

describe("session token generation", () => {
  it("generates a hex token", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[a-f0-9]+$/);
    expect(token.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it("generates unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateSessionToken());
    }
    expect(tokens.size).toBe(100);
  });

  it("generates tokens with sufficient entropy (at least 128 bits)", () => {
    const token = generateSessionToken();
    // 32 bytes = 256 bits of entropy
    expect(token.length).toBeGreaterThanOrEqual(32); // at least 128 bits (32 hex chars)
  });
});
