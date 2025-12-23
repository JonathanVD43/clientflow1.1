// src/app/clients/new/page.tsx
import { createClientAction } from "./actions";

export default function NewClientPage() {
  return (
    <main className="p-6 max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">New client</h1>

      <form action={createClientAction} className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm">Name</label>
          <input
            name="name"
            required
            className="w-full border rounded-lg p-2"
            placeholder="Acme (Pty) Ltd"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Email (optional)</label>
          <input
            name="email"
            type="email"
            className="w-full border rounded-lg p-2"
            placeholder="billing@acme.co.za"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm">Phone (optional)</label>
          <input
            name="phone_number"
            className="w-full border rounded-lg p-2"
            placeholder="+27821234567"
          />
        </div>

        <button className="border rounded-lg px-4 py-2">Create</button>
      </form>
    </main>
  );
}
