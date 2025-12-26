// src/app/portal/layout.tsx
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50">
      <div className="mx-auto w-full max-w-3xl p-6">{children}</div>
    </div>
  );
}
