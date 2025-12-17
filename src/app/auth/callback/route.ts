import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as "email" | null;
  const next = url.searchParams.get("next") || "/clients";

  console.log("AUTH CALLBACK:", {
    fullUrl: req.url,
    hasCode: !!code,
    hasTokenHash: !!token_hash,
    type,
    next,
  });

  const supabase = await supabaseServer();

  // 1) PKCE code flow (OAuth / some flows)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    console.log("exchangeCodeForSession:", { ok: !error, error });

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url)
      );
    }

    return NextResponse.redirect(new URL(next, url));
  }

  // 2) PKCE magic link flow (token hash)
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    console.log("verifyOtp:", { ok: !error, hasSession: !!data?.session, error });

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, url)
      );
    }

    return NextResponse.redirect(new URL(next, url));
  }

  console.log("AUTH CALLBACK: missing code/token_hash");
  return NextResponse.redirect(new URL("/login?error=Missing%20code%20or%20token_hash", url));
}
