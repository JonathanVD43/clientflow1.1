// src/app/api/portal/[token]/info/route.ts
import { errorResponse } from "@/lib/api/responses";

export async function GET() {
  return errorResponse(
    "Legacy portal endpoint disabled. Use /api/portal-session/[token]/info instead.",
    410
  );
}
