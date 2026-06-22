import { describe, expect, it } from "vitest";
import { validateIdentifier } from "./db";
import { businessTable } from "./contracts";
import { InvalidInputError } from "./context";

describe("validateIdentifier", () => {
  it("accepts valid identifiers", () => {
    expect(validateIdentifier("id")).toBe("id");
    expect(validateIdentifier("name")).toBe("name");
    expect(validateIdentifier("created_at")).toBe("created_at");
    expect(validateIdentifier("_private")).toBe("_private");
    expect(validateIdentifier("Field1")).toBe("Field1");
    expect(validateIdentifier("a")).toBe("a");
    expect(validateIdentifier("_")).toBe("_");
  });

  it("rejects identifiers starting with a digit", () => {
    expect(() => validateIdentifier("1field")).toThrow(InvalidInputError);
    expect(() => validateIdentifier("0")).toThrow(InvalidInputError);
  });

  it("rejects identifiers containing spaces", () => {
    expect(() => validateIdentifier("field name")).toThrow(InvalidInputError);
    expect(() => validateIdentifier(" field")).toThrow(InvalidInputError);
    expect(() => validateIdentifier("field ")).toThrow(InvalidInputError);
  });

  it("rejects SQL injection attempts", () => {
    const malicious = [
      "id) --",
      "id; DROP TABLE users; --",
      "id) VALUES (1",
      "name\" OR 1=1 --",
      "field`",
      "field; --",
      "field/*",
      "id) UNION SELECT * FROM users --",
    ];
    for (const name of malicious) {
      expect(() => validateIdentifier(name)).toThrow(InvalidInputError);
    }
  });

  it("rejects empty strings", () => {
    expect(() => validateIdentifier("")).toThrow(InvalidInputError);
  });

  it("rejects identifiers with special characters", () => {
    expect(() => validateIdentifier("field-name")).toThrow(InvalidInputError);
    expect(() => validateIdentifier("field.name")).toThrow(InvalidInputError);
    expect(() => validateIdentifier("field$name")).toThrow(InvalidInputError);
    expect(() => validateIdentifier("field@name")).toThrow(InvalidInputError);
    expect(() => validateIdentifier("field!name")).toThrow(InvalidInputError);
  });

  it("rejects non-printable characters", () => {
    expect(() => validateIdentifier("field\nname")).toThrow(InvalidInputError);
    expect(() => validateIdentifier("field\tname")).toThrow(InvalidInputError);
    expect(() => validateIdentifier("field\rname")).toThrow(InvalidInputError);
  });
});

describe("businessTable", () => {
  it("accepts a valid object key", () => {
    expect(businessTable("customer")).toBe("runory_business_customer");
    expect(businessTable("contact")).toBe("runory_business_contact");
  });

  it("rejects an invalid object key (SQL injection)", () => {
    expect(() => businessTable("customer; DROP TABLE users; --")).toThrow(InvalidInputError);
    expect(() => businessTable("customer) --")).toThrow(InvalidInputError);
    expect(() => businessTable("")).toThrow(InvalidInputError);
    expect(() => businessTable("bad name")).toThrow(InvalidInputError);
  });
});
