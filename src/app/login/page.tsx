"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = searchParams?.next || "/clients";
  const errorFromUrl = searchParams?.error;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(
          next
        )}`,
      },
    });

    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="p-6 max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>

      {errorFromUrl ? (
        <div className="border rounded-lg p-3 text-sm whitespace-pre-wrap">
          {errorFromUrl}
        </div>
      ) : null}

      {sent ? (
        <p className="opacity-70">Check your email for a magic link.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm">Email</label>
            <input
              className="w-full border rounded-lg p-2"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          {error ? (
            <p className="text-sm whitespace-pre-wrap">{error}</p>
          ) : null}

          <button className="border rounded-lg px-4 py-2">
            Send magic link
          </button>
        </form>
      )}
    </main>
  );
}
