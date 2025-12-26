// src/app/clients/new/page.tsx
import { createClientAction } from "./actions";

import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LinkButton } from "@/components/ui/link-button";

export default function NewClientPage() {
  return (
    <main className="p-6">
      <div className="mx-auto w-full max-w-xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">New client</h1>

          <LinkButton href="/clients" variant="ghost" size="sm">
            Back
          </LinkButton>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <div className="text-sm text-slate-600">
              Create a new client and configure settings later.
            </div>
          </CardHeader>

          <CardContent>
            <form action={createClientAction} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Name
                </label>
                <Input
                  name="name"
                  required
                  placeholder="Acme (Pty) Ltd"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Email (optional)
                </label>
                <Input
                  name="email"
                  type="email"
                  placeholder="billing@acme.co.za"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Phone (optional)
                </label>
                <Input
                  name="phone_number"
                  placeholder="+27821234567"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <LinkButton href="/clients" variant="secondary">
                  Cancel
                </LinkButton>

                <Button variant="primary">Create client</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
