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

describe("processSource — title/lead taken from the article card", () => {
  // Mirrors the REAL parkiet.com structure: each `.content--block` card has ONE <h2> and ONE
  // `.teaser--lead` at card level, plus TWO `.contentLink` anchors with the SAME href — an image
  // link without an <h2>, and the title link wrapping the <h2>. Title/lead are NOT inside the link.
  const cardSource: Source = {
    name: "test-cards",
    url: "https://example.com",
    selectors: {
      articleLink: ".content--block .contentLink",
      title: ".content--block .contentLink h2",
      lead: ".content--block .teaser--lead",
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("takes each card's own title and lead (card-level, not from inside the link)", async () => {
    const html = `
      <div class="content--block">
        <a class="contentLink" href="/art1"><img src="1.jpg" /></a>
        <a class="contentLink" href="/art1"><h2>Tytuł pierwszy</h2></a>
        <p class="teaser--lead">Lead pierwszy</p>
      </div>
      <div class="content--block">
        <a class="contentLink" href="/art2"><img src="2.jpg" /></a>
        <a class="contentLink" href="/art2"><h2>Tytuł drugi</h2></a>
        <p class="teaser--lead">Lead drugi</p>
      </div>`;
    const capturedRows: unknown[] = [];
    await processSource(html, cardSource, makeMockSupabase(capturedRows) as unknown as SupabaseClient<Database>);

    const rows = capturedRows as { article_url: string; title: string | null; lead: string | null }[];
    const byUrl = (suffix: string) => rows.find((r) => r.article_url.endsWith(suffix));
    // Each card gets ITS OWN title+lead — no index desync, no null from the thumbnail link.
    expect(byUrl("/art1")?.title).toBe("Tytuł pierwszy");
    expect(byUrl("/art1")?.lead).toBe("Lead pierwszy");
    expect(byUrl("/art2")?.title).toBe("Tytuł drugi");
    expect(byUrl("/art2")?.lead).toBe("Lead drugi");
  });

  it("stores null lead when the card has no lead element", async () => {
    const html = `
      <div class="content--block">
        <a class="contentLink" href="/nolead"><h2>Tytuł bez leadu</h2></a>
      </div>`;
    const capturedRows: unknown[] = [];
    await processSource(html, cardSource, makeMockSupabase(capturedRows) as unknown as SupabaseClient<Database>);

    const rows = capturedRows as { title: string | null; lead: string | null }[];
    expect(rows[0]?.title).toBe("Tytuł bez leadu");
    expect(rows[0]?.lead).toBeNull();
  });
});
