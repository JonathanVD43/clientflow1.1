// src/app/clients/[id]/uploads/page.tsx
import Link from "next/link";
import { listUploadsForClient } from "@/lib/db/uploads";

export default async function ClientUploadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: clientId } = await params;
  const uploads = await listUploadsForClient(clientId);

  return (
    <main className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Client uploads</h1>
        <Link className="underline" href={`/clients/${clientId}`}>
          Back to client
        </Link>
      </div>

      {uploads.length === 0 ? (
        <div className="opacity-70">No uploads yet.</div>
      ) : (
        <ul className="space-y-2">
          {uploads.map((u) => {
            const isNew = !u.viewed_at;
            return (
              <li key={u.id} className="border rounded-xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {u.original_filename}
                      {isNew ? (
                        <span className="ml-2 text-xs rounded-full border px-2 py-0.5">
                          NEW
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm opacity-70">
                      Status: {u.status}
                      {u.status === "DENIED" && u.denial_reason ? (
                        <> · Denied: {u.denial_reason}</>
                      ) : null}
                    </div>
                    <div className="text-xs opacity-60">
                      Uploaded: {u.uploaded_at}
                    </div>
                  </div>

                  <Link
                    className="underline shrink-0"
                    href={`/clients/${clientId}/uploads/${u.id}`}
                    prefetch={false}
                  >
                    View
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
