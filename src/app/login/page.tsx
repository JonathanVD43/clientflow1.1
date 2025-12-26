// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export default function LoginPage() {
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = sp.get("next") || "/clients";
  const errorFromUrl = sp.get("error");

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
    <main className="min-h-dvh bg-slate-50 p-6">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-600">
              We’ll email you a magic link.
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            {errorFromUrl ? <Alert variant="error">{errorFromUrl}</Alert> : null}

            {sent ? (
              <Alert variant="success">Check your email for a magic link.</Alert>
            ) : (
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    error={Boolean(error)}
                  />
                </div>

                {error ? <Alert variant="error">{error}</Alert> : null}

                <Button variant="primary" className="w-full">
                  Send magic link
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
