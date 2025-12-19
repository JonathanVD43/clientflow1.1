// src/lib/db/query-builder.ts
import type { SupabaseClient } from "@supabase/supabase-js";

type TableName = string;

type PostgrestErrorLike = {
  message?: string;
};

type SingleResult = { data: unknown; error: PostgrestErrorLike | null };
type MaybeSingleResult = { data: unknown | null; error: PostgrestErrorLike | null };

/**
 * Minimal “shape” of a Supabase select/filter builder we can chain.
 * Structural typing avoids fighting Supabase's complex generics and avoids `any`.
 */
export type FilterLike = {
  eq(column: string, value: unknown): FilterLike;
  is(column: string, value: null): FilterLike;
  in(column: string, values: readonly unknown[]): FilterLike;
  order(column: string, opts?: { ascending?: boolean }): FilterLike;
  single(): PromiseLike<SingleResult>;
  maybeSingle(): PromiseLike<MaybeSingleResult>;
};

function throwIfError(err: PostgrestErrorLike | null) {
  if (err) throw new Error(err.message ?? "Database error");
}

function assertHasId(
  data: unknown,
  message: string
): asserts data is { id: string } {
  const id = (data as { id?: unknown } | null | undefined)?.id;
  if (!id) throw new Error(message);
}

export async function findByIdForUser<T>(
  supabase: SupabaseClient,
  table: TableName,
  columns: string,
  entityId: string,
  userId: string
): Promise<T> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .eq("id", entityId)
    .single();

  throwIfError(error);
  return data as T;
}

export async function maybeFindByIdForUser<T>(
  supabase: SupabaseClient,
  table: TableName,
  columns: string,
  entityId: string,
  userId: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .eq("id", entityId)
    .maybeSingle();

  throwIfError(error);
  return (data ?? null) as T | null;
}

export async function findOneForUser<T>(
  supabase: SupabaseClient,
  table: TableName,
  columns: string,
  userId: string,
  where: (q: FilterLike) => FilterLike
): Promise<T> {
  const base = supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId) as unknown as FilterLike;

  const q = where(base);
  const { data, error } = await q.single();

  throwIfError(error);
  return data as T;
}

export async function maybeFindOneForUser<T>(
  supabase: SupabaseClient,
  table: TableName,
  columns: string,
  userId: string,
  where: (q: FilterLike) => FilterLike
): Promise<T | null> {
  const base = supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId) as unknown as FilterLike;

  const q = where(base);
  const { data, error } = await q.maybeSingle();

  throwIfError(error);
  return (data ?? null) as T | null;
}

/**
 * Common pattern for write operations that should return an id row.
 * Accepts Supabase's PostgrestBuilder (PromiseLike), not just a real Promise.
 */
export async function expectSingleId(
  op: PromiseLike<SingleResult> | SingleResult,
  missingMessage: string
): Promise<{ id: string }> {
  const { data, error } = await op; // await works on PromiseLike + plain object
  throwIfError(error);
  assertHasId(data, missingMessage);
  return { id: String((data as { id: unknown }).id) };
}
