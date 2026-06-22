import type { APIRoute } from "astro";

import { createClient } from "@/lib/supabase";
import { json } from "@/lib/http";
import { recipientSchema } from "@/lib/validators/recipient";
import { deleteRecipient, updateRecipient } from "@/lib/services/recipients";

export const prerender = false;

export const PUT: APIRoute = async (context) => {
  if (!context.locals.user) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "Supabase is not configured" }, 500);

  const id = context.params.id;
  if (!id) return json({ error: "Missing id" }, 400);

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = recipientSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Validation failed", issues: parsed.error.issues }, 400);

  const { data, error } = await updateRecipient(supabase, id, parsed.data);
  if (error) {
    if (error.code === "23505") return json({ error: "Email już istnieje" }, 409);
    if (error.code === "PGRST116") return json({ error: "Nie znaleziono odbiorcy" }, 404);
    return json({ error: error.message }, 500);
  }

  return json({ recipient: data });
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "Supabase is not configured" }, 500);

  const id = context.params.id;
  if (!id) return json({ error: "Missing id" }, 400);

  const { data, error } = await deleteRecipient(supabase, id);
  if (error) return json({ error: error.message }, 500);
  if (data.length === 0) return json({ error: "Nie znaleziono odbiorcy" }, 404);

  return json({ success: true });
};
