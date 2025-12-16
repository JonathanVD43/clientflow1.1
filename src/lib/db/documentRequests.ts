import { supabaseServer } from "@/lib/supabase/server";

export async function listDocumentRequests(clientId: string) {
  const supabase = await supabaseServer();

  const { data, error } = await supabase
    .from("document_requests")
    .select(
      "id,title,description,required,active,allowed_mime_types,max_files,sort_order,created_at,updated_at"
    )
    .eq("client_id", clientId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createDocumentRequest(input: {
  clientId: string;
  title: string;
  description?: string | null;
  required?: boolean;
  allowedMimeTypes?: string[] | null;
  maxFiles?: number;
  sortOrder?: number;
}) {
  const supabase = await supabaseServer();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("document_requests")
    .insert({
      user_id: user.id,
      client_id: input.clientId,
      title: input.title.trim(),
      description: input.description ?? null,
      required: input.required ?? true,
      active: true,
      allowed_mime_types: input.allowedMimeTypes ?? null,
      max_files: input.maxFiles ?? 1,
      sort_order: input.sortOrder ?? 0,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Insert succeeded but no row returned");

  return data;
}
