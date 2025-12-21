"use client";

import { useState } from "react";

export default function CopyLink({
  value,
  buttonLabel = "Copy",
}: {
  value: string;
  buttonLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback: do nothing, user can manually copy
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        readOnly
        value={value}
        className="w-full border rounded-lg p-2 font-mono text-xs"
      />
      <button
        type="button"
        className="border rounded-lg px-3 py-2 text-sm"
        onClick={onCopy}
      >
        {copied ? "Copied" : buttonLabel}
      </button>
    </div>
  );
}
