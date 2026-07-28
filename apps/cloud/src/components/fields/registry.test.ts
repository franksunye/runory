import { describe, it, expect } from "vitest";
import { fieldTypes, type FieldType } from "@runory/contracts";
import { FIELD_DISPLAY_RENDERERS } from "./registry";

describe("FIELD_DISPLAY_RENDERERS — exhaustiveness", () => {
  it("has a renderer for every contract FieldType", () => {
    for (const type of fieldTypes) {
      expect(FIELD_DISPLAY_RENDERERS[type]).toBeDefined();
      expect(typeof FIELD_DISPLAY_RENDERERS[type]).toBe("function");
    }
  });

  it("has exactly the same number of renderers as field types", () => {
    const rendererKeys = Object.keys(FIELD_DISPLAY_RENDERERS);
    expect(rendererKeys).toHaveLength(fieldTypes.length);
  });

  it("renderer keys match the contract FieldType union exactly", () => {
    const rendererKeys = new Set(Object.keys(FIELD_DISPLAY_RENDERERS));
    for (const type of fieldTypes) {
      expect(rendererKeys.has(type)).toBe(true);
    }
  });
});
