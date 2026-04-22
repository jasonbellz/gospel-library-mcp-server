import { describe, it, expect } from "vitest";
import { referenceToUrl } from "../src/tools/scripture.js";

describe("referenceToUrl", () => {
  it("builds a New Testament URL", () => {
    const url = referenceToUrl("John 3:16");
    expect(url).toMatch(/scriptures\/nt\/john\/3\.16/);
    expect(url).toMatch(/lang=eng/);
  });

  it("builds a Book of Mormon URL", () => {
    const url = referenceToUrl("2 Nephi 2:25");
    expect(url).toMatch(/scriptures\/bofm\/2-ne\/2\.25/);
  });

  it("builds a D&C URL", () => {
    const url = referenceToUrl("D&C 76:22");
    expect(url).toMatch(/scriptures\/dc-testament\/dc\/76\.22/);
  });

  it("handles verse ranges", () => {
    const url = referenceToUrl("Moroni 10:4-5");
    expect(url).toMatch(/moro\/10\.4-5/);
  });

  it("throws for garbage input", () => {
    expect(() => referenceToUrl("not a reference")).toThrow();
  });
});

