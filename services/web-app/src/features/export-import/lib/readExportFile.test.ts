import { describe, expect, it } from "vitest";

import { parseExportFile, readExportFile } from "./readExportFile";

describe("parseExportFile", () => {
  it("accepts an export and keeps every key as written", () => {
    const text = JSON.stringify({
      version: "2.0",
      exported_at: "2026-10-08T10:00:00Z",
      encrypted: true,
      encryption: { kdf: "pbkdf2-sha256" },
      hosts: [{ id: "h1" }],
    });

    const result = parseExportFile(text);

    expect(result).toEqual({ ok: true, file: JSON.parse(text) as unknown });
  });

  it("rejects text that is not JSON", () => {
    expect(parseExportFile("{not json")).toEqual({
      ok: false,
      error: "This file is not valid JSON.",
    });
  });

  it("rejects JSON that is not an export", () => {
    expect(parseExportFile(JSON.stringify({ hello: "world" }))).toEqual({
      ok: false,
      error: "This file is not an mr-review export.",
    });
    expect(parseExportFile("[]")).toMatchObject({ ok: false });
  });
});

describe("readExportFile", () => {
  it("reads the file's text", async () => {
    const file = new File([JSON.stringify({ version: "1.0", exported_at: "x" })], "e.json");

    await expect(readExportFile(file)).resolves.toMatchObject({ ok: true });
  });
});
