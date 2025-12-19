import { NextResponse } from "next/server";

export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function successResponse<T>(data: T, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Returns either:
 *  - parsed JSON body typed as T
 *  - a Response (error JSON) you should `return` immediately
 */
export async function validateJsonBody<T>(
  req: Request
): Promise<T | Response> {
  try {
    return (await req.json()) as T;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
}
