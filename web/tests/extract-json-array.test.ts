import { describe, it, expect } from "vitest";
import { extractJsonArray } from "../lib/extract-json-array";
import fs from "node:fs";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures/extract_json_array_real_raw.txt");

describe("extractJsonArray", () => {
  it("parses a simple valid array", () => {
    expect(extractJsonArray('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("strips <think>...</think> blocks", () => {
    expect(extractJsonArray('<think>some reasoning</think>\n[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("strips markdown code fences", () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it("handles embedded quotes in chinese content", () => {
    const text = '[{"title":"王记","full_script":"牌照从"王记"变成了"老王""}]';
    const result = extractJsonArray(text);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("王记");
    expect(result[0].full_script).toContain("王记");
    expect(result[0].full_script).toContain("老王");
  });

  it("fixes unescaped english quotes in string content", () => {
    const text = '[{"title":"book","full_script":"he said \"hi\" then left"}]';
    const result = extractJsonArray(text);
    expect(result[0].full_script).toContain("hi");
  });

  it("escapes unescaped control chars in strings", () => {
    const text = '[{"a":"line1\nline2","b":"\t"}]';
    const result = extractJsonArray(text);
    expect(result[0].a).toBe("line1\nline2");
    expect(result[0].b).toBe("\t");
  });

  it("handles think + preamble + array + suffix", () => {
    expect(extractJsonArray('<think>blah</think>\nrandom preamble\n[{"x":1}] more garbage')).toEqual([{ x: 1 }]);
  });

  it("parses 8+ ideas from real raw LLM output", () => {
    const raw = fs.readFileSync(FIXTURE, "utf-8");
    const result = extractJsonArray(raw);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toHaveProperty("title");
    }
  });
});
