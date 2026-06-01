import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { Resend } from "resend";
import { runDigest } from "../scripts/send.ts";
import type { Article } from "../scripts/send.ts";

const articles: Article[] = [
  {
    id: "a1",
    source_url: "https://example.com",
    article_url: "https://example.com/article",
    title: "Test Article",
    lead: null,
  },
];

const subscribers = ["test@example.com"];
const fromEmail = "noreply@test.com";

function makeMockSupabase() {
  return {
    from: () => ({
      update: () => ({
        in: () => Promise.resolve({ error: null }),
      }),
    }),
  };
}

describe("runDigest", () => {
  it("Resend error: returns failedCount equal to subscribers count", async () => {
    const mockResend = {
      emails: {
        send: () => Promise.resolve({ data: null, error: { message: "rate limited" } }),
      },
    } as unknown as Pick<Resend, "emails">;

    const { failedCount } = await runDigest(
      articles,
      subscribers,
      mockResend,
      makeMockSupabase() as unknown as SupabaseClient<Database>,
      fromEmail,
    );

    expect(failedCount).toBe(subscribers.length);
  });

  it("happy path: returns failedCount of 0", async () => {
    const mockResend = {
      emails: {
        send: () => Promise.resolve({ data: { id: "msg-id-1" }, error: null }),
      },
    } as unknown as Pick<Resend, "emails">;

    const { failedCount } = await runDigest(
      articles,
      subscribers,
      mockResend,
      makeMockSupabase() as unknown as SupabaseClient<Database>,
      fromEmail,
    );

    expect(failedCount).toBe(0);
  });
});
