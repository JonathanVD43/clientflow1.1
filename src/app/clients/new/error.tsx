"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="p-6 max-w-xl space-y-3">
      <h1 className="text-xl font-semibold">Couldn’t create client</h1>
      <pre className="whitespace-pre-wrap border rounded-lg p-3 text-sm">
        {error.message}
      </pre>
      <button className="border rounded-lg px-4 py-2" onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
