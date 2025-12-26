// src/app/clients/layout.tsx
export default function ClientsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-slate-50">{children}</div>;
}
