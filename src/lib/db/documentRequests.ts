import { supabaseServer } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function listDocumentRequests(clientId: string) {
  if (!UUID_RE.test(clientId)) throw new Error(`Invalid clientId: "${clientId}"`);

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("document_requests")
    .select("id,title,description,required,active,sort_order,created_at,updated_at")
    .eq("client_id", clientId)
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createDocumentRequest(input: {
  clientId: string;
  title: string;
  description?: string | null;
}) {
  if (!UUID_RE.test(input.clientId)) throw new Error(`Invalid clientId: "${input.clientId}"`);

  const { supabase, user } = await requireUser();

  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  const { data, error } = await supabase
    .from("document_requests")
    .insert({
      user_id: user.id,
      client_id: input.clientId,
      title,
      description: input.description ?? null,
      required: true,
      active: true,
      max_files: 1,
      sort_order: 0,
      allowed_mime_types: null,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Insert succeeded but no id returned");
  return data;
}

export async function updateDocumentRequest(input: {
  id: string;
  title?: string;
  description?: string | null;
  required?: boolean;
  active?: boolean;
}) {
  if (!UUID_RE.test(input.id)) throw new Error(`Invalid id: "${input.id}"`);

  const { supabase, user } = await requireUser();

  const patch: Record<string, unknown> = {};
  if (typeof input.title === "string") patch.title = input.title.trim();
  if ("description" in input) patch.description = input.description ?? null;
  if (typeof input.required === "boolean") patch.required = input.required;
  if (typeof input.active === "boolean") patch.active = input.active;

  const { data, error } = await supabase
    .from("document_requests")
    .update(patch)
    .eq("id", input.id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Update succeeded but no row returned");
  return data;
}

export async function deleteDocumentRequest(id: string) {
  if (!UUID_RE.test(id)) throw new Error(`Invalid id: "${id}"`);

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("document_requests")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw error;
  return { id };
}
