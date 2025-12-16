import { supabaseServer } from "@/lib/supabase/server";

export async function listUploadsForClient(clientId: string) {
  const supabase = await supabaseServer(); // ✅ await

  const { data, error } = await supabase
    .from("uploads")
    .select(
      "id,document_request_id,original_filename,mime_type,size_bytes,status,denial_reason,uploaded_at,reviewed_at,downloaded_at"
    )
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
