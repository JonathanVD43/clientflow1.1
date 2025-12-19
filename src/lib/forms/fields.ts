// src/lib/forms/fields.ts

export function getString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

export function requireString(
  formData: FormData,
  key: string,
  message: string
): string {
  const v = getString(formData, key);
  if (!v) throw new Error(message);
  return v;
}

export function optionalString(formData: FormData, key: string): string | null {
  return getString(formData, key);
}

export function getInt(
  formData: FormData,
  key: string
): number | null {
  const v = getString(formData, key);
  if (!v) return null;
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  return n;
}

export function requireIntInRange(
  formData: FormData,
  key: string,
  min: number,
  max: number,
  message: string
): number {
  const n = getInt(formData, key);
  if (n === null || n < min || n > max) throw new Error(message);
  return n;
}

export function checkbox(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

export function validateTimeZone(timeZone: string, message?: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error(message ?? `Invalid timezone: "${timeZone}"`);
  }
}
