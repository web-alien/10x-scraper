import { describe, it, expect } from "vitest";

import { recipientSchema } from "@/lib/validators/recipient";

describe("recipientSchema", () => {
  it("accepts a valid recipient and defaults status to active", () => {
    const parsed = recipientSchema.parse({ email: "ola@example.com", name: "Ola" });
    expect(parsed).toEqual({ email: "ola@example.com", name: "Ola", status: "active" });
  });

  it("accepts an explicit unsubscribed status", () => {
    const parsed = recipientSchema.parse({ email: "ola@example.com", status: "unsubscribed" });
    expect(parsed.status).toBe("unsubscribed");
  });

  it("rejects a missing email", () => {
    expect(recipientSchema.safeParse({ name: "Ola" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(recipientSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(recipientSchema.safeParse({ email: "ola@example.com", status: "bounced" }).success).toBe(false);
  });

  it("rejects an empty name when provided", () => {
    expect(recipientSchema.safeParse({ email: "ola@example.com", name: "   " }).success).toBe(false);
  });
});
