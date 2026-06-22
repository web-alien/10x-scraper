import type { APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { recipientSchema } from "@/lib/validators/recipient";
import { createRecipient, fetchRecipients } from "@/lib/services/recipients";

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "Supabase is not configured" }, 500);

  const { data, error } = await fetchRecipients(supabase);
  if (error) return json({ error: error.message }, 500);

  return json({ recipients: data });
};

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "Supabase is not configured" }, 500);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = recipientSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Validation failed", issues: parsed.error.issues }, 400);

  const { data, error } = await createRecipient(supabase, parsed.data);
  if (error) {
    if (error.code === "23505") return json({ error: "Email już istnieje" }, 409);
    return json({ error: error.message }, 500);
  }

  return json({ recipient: data }, 201);
};
