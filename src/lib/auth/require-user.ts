// src/lib/auth/require-user.ts
import { supabaseServer } from "@/lib/supabase/server";

export type RequireUserResult = {
  supabase: Awaited<ReturnType<typeof supabaseServer>>;
  user: NonNullable<
    Awaited<ReturnType<Awaited<ReturnType<typeof supabaseServer>>["auth"]["getUser"]>>["data"]["user"]
  >;
};

export async function requireUser(): Promise<RequireUserResult> {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("Not authenticated");
  return { supabase, user };
}
