import Link from "next/link";
import { getClientAsDevOwner } from "@/lib/db/clients";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return (
      <main className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Invalid client id</h1>
        <p className="opacity-70">
          This doesn’t look like a valid UUID: <span className="font-mono">{id}</span>
        </p>
        <Link className="underline" href="/clients">
          Back to clients
        </Link>
      </main>
    );
  }

  const client = await getClientAsDevOwner(id);

  return (
    <main className="p-6 max-w-2xl space-y-3">
      <h1 className="text-xl font-semibold">{client.name}</h1>

      <div className="text-sm opacity-70 space-y-1">
        {client.email ? <div>Email: {client.email}</div> : null}
        {client.phone_number ? <div>Phone: {client.phone_number}</div> : null}
        <div>
          Public token:{" "}
          <span className="font-mono break-all">{client.public_token}</span>
        </div>
      </div>

      <Link className="underline" href="/clients">
        Back
      </Link>
    </main>
  );
}
