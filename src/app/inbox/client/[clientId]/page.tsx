import Link from "next/link";
import { redirect } from "next/navigation";
import { getOpenSessionIdForClient } from "@/lib/db/uploads";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function InboxClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  if (!UUID_RE.test(clientId)) {
    return (
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Invalid client</h1>
        <p className="opacity-70">
          This doesn’t look like a valid UUID:{" "}
          <span className="font-mono">{clientId}</span>
        </p>
        <Link className="underline" href="/inbox">
          Back to inbox
        </Link>
      </main>
    );
  }

  const sessionId = await getOpenSessionIdForClient(clientId);

  if (!sessionId) {
    return (
      <main className="p-6 max-w-2xl space-y-3">
        <h1 className="text-xl font-semibold">No open session</h1>
        <div className="text-sm opacity-70">
          No open review session found for this client.
        </div>
        <div className="flex gap-3 text-sm">
          <Link className="underline" href="/inbox">
            Back to inbox
          </Link>
          <Link className="underline" href={`/clients/${clientId}`}>
            Client settings
          </Link>
        </div>
      </main>
    );
  }

  // ✅ the whole point of this route:
  redirect(`/inbox/${sessionId}`);
}
