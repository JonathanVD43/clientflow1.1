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

export async function listUploadsForClient(clientId: string) {
  if (!UUID_RE.test(clientId)) throw new Error("Invalid clientId");

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      "id,client_id,document_request_id,original_filename,mime_type,size_bytes,status,denial_reason,uploaded_at,viewed_at,reviewed_at"
    )
    .eq("client_id", clientId)
    .eq("user_id", user.id) // defense-in-depth
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getUpload(uploadId: string) {
  if (!UUID_RE.test(uploadId)) throw new Error("Invalid uploadId");

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("uploads")
    .select(
      "id,client_id,document_request_id,original_filename,storage_key,mime_type,size_bytes,status,denial_reason,uploaded_at,viewed_at,reviewed_at"
    )
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function markUploadViewed(uploadId: string) {
  if (!UUID_RE.test(uploadId)) throw new Error("Invalid uploadId");

  const { supabase, user } = await requireUser();

  // idempotent: only set it if it's currently null
  const { error } = await supabase
    .from("uploads")
    .update({ viewed_at: new Date().toISOString() })
    .eq("id", uploadId)
    .eq("user_id", user.id)
    .is("viewed_at", null);

  if (error) throw error;
}

export async function reviewUpload(input: {
  uploadId: string;
  status: "ACCEPTED" | "DENIED";
  denial_reason?: string | null;
}) {
  if (!UUID_RE.test(input.uploadId)) throw new Error("Invalid uploadId");

  const { supabase, user } = await requireUser();

  const patch: Record<string, unknown> = {
    status: input.status,
    reviewed_at: new Date().toISOString(),
  };

  if (input.status === "DENIED") {
    const reason = String(input.denial_reason ?? "").trim();
    if (!reason) throw new Error("Denial reason is required");
    patch.denial_reason = reason;
  } else {
    patch.denial_reason = null;
  }

  const { data, error } = await supabase
    .from("uploads")
    .update(patch)
    .eq("id", input.uploadId)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Review update failed");
  return data;
}
