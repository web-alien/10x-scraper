import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { processSource } from "../scripts/scrape.ts";
import type { Source } from "../scripts/scrape.ts";

const validHtml = readFileSync(fileURLToPath(new URL("./fixtures/source-valid.html", import.meta.url)), "utf-8");
const emptyHtml = readFileSync(fileURLToPath(new URL("./fixtures/source-empty.html", import.meta.url)), "utf-8");

const source: Source = {
  name: "test",
  url: "https://example.com",
  selectors: { articleLink: "a.article-link" },
};

function makeMockSupabase(capturedRows: unknown[]) {
  return {
    from: () => ({
      upsert: (rows: unknown[]) => {
        capturedRows.push(...rows);
        return {
          select: () =>
            Promise.resolve({
              data: (rows as { article_url: string }[]).map((_, i) => ({ id: `id-${i}` })),
              error: null,
            }),
        };
      },
    }),
  };
}

describe("processSource", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("valid HTML: upserts ≥1 article with non-empty title and URL", async () => {
    const capturedRows: unknown[] = [];
    const result = await processSource(
      validHtml,
      source,
      makeMockSupabase(capturedRows) as unknown as SupabaseClient<Database>,
    );

    expect(capturedRows.length).toBeGreaterThanOrEqual(1);
    for (const row of capturedRows as { title: string; article_url: string }[]) {
      expect(row.title).toBeTruthy();
      expect(row.article_url).toMatch(/^https:\/\/example\.com/);
    }
    expect(result.newCount).toBeGreaterThanOrEqual(1);
  });

  it("duplicate articles: returns duplicateCount > 0 when Supabase returns fewer rows", async () => {
    const partialReturnMock = {
      from: () => ({
        upsert: () => ({
          select: () => Promise.resolve({ data: [{ id: "id-0" }], error: null }),
        }),
      }),
    };

    const result = await processSource(validHtml, source, partialReturnMock as unknown as SupabaseClient<Database>);

    expect(result.newCount).toBe(1);
    expect(result.duplicateCount).toBeGreaterThan(0);
  });

  it("Supabase error: throws instead of returning zero counts", async () => {
    const errorMock = {
      from: () => ({
        upsert: () => ({
          select: () => Promise.resolve({ data: null, error: { message: "connection refused" } }),
        }),
      }),
    };
    await expect(processSource(validHtml, source, errorMock as unknown as SupabaseClient<Database>)).rejects.toThrow(
      "connection refused",
    );
  });

  it("empty-selector HTML: warns and returns zero counts without calling upsert", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    const capturedRows: unknown[] = [];
    const result = await processSource(
      emptyHtml,
      source,
      makeMockSupabase(capturedRows) as unknown as SupabaseClient<Database>,
    );

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("no articles found"));
    expect(result).toEqual({ newCount: 0, duplicateCount: 0 });
    expect(capturedRows.length).toBe(0);
  });
});
