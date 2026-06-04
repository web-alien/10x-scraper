import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  const next = context.url.searchParams.get("next") ?? "/";

  if (!code) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Link jest nieprawidłowy lub wygasł")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent("Link jest nieprawidłowy lub wygasł")}`);
  }

  return context.redirect(next);
};
