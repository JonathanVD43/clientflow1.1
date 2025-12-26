// src/app/portal/[token]/page.tsx
import PortalClient from "./PortalClient";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <Card>
      <CardHeader>
        <div className="text-sm font-semibold text-slate-900">
          Client Portal
        </div>
        <div className="text-xs text-slate-500">
          Upload requested documents securely.
        </div>
      </CardHeader>
      <CardContent>
        <PortalClient token={token} />
      </CardContent>
    </Card>
  );
}
