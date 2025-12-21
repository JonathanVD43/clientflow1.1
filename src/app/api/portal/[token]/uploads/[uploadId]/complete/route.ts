// src/app/api/portal/[token]/uploads/[uploadId]/complete/route.ts
import { errorResponse } from "@/lib/api/responses";

export async function POST() {
  return errorResponse(
    "Legacy portal endpoint disabled. Use /api/portal-session/[token]/uploads/[uploadId]/complete instead.",
    410
  );
}
