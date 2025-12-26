// src/app/inbox/layout.tsx
export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep it minimal so it doesn't interfere with full-height pages.
  // Pages inside /inbox can decide their own padding/width.
  return <div className="min-h-dvh bg-slate-50">{children}</div>;
}
