// src/lib/navigation/redirects.ts
import { redirect } from "next/navigation";

export function redirectWithSuccess(path: string, message: string) {
  redirect(`${path}?saved=${encodeURIComponent(message)}`);
}

export function redirectWithError(path: string, error: string) {
  redirect(`${path}?error=${encodeURIComponent(error)}`);
}
