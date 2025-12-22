// src/lib/db/expect-single-id.ts
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

type Awaitable<T> = PromiseLike<T>;

export async function expectSingleId(
  query: Awaitable<PostgrestSingleResponse<{ id: string }>>,
  errorMessage: string
): Promise<{ id: string }> {
  const { data, error } = await query;

  if (error) throw new Error(error.message);

  if (!data || typeof data.id !== "string") {
    throw new Error(errorMessage);
  }

  return data;
}
