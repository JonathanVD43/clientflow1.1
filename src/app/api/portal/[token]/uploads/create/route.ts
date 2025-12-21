// src/app/api/portal/[token]/uploads/create/route.ts
import { errorResponse } from "@/lib/api/responses";

export async function POST() {
  return errorResponse(
    "Legacy portal endpoint disabled. Use /api/portal-session/[token]/uploads/create instead.",
    410
  );
}
