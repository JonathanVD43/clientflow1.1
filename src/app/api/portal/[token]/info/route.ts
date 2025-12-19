// src/app/api/portal/[token]/info/route.ts
import { supabaseAdmin } from "@/lib/supabase/admin";
import { errorResponse, successResponse } from "@/lib/api/responses";
import { validateCSRF } from "@/lib/security/csrf";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const csrfOk = await validateCSRF();
  if (!csrfOk) return errorResponse("Invalid origin", 403);

  const { token } = await ctx.params;
  const cleanToken = (token ?? "").trim();

  if (!cleanToken) return errorResponse("Missing token", 400);

  const supabase = supabaseAdmin();

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id,name,active,portal_enabled,due_day_of_month,due_timezone,user_id")
    .eq("public_token", cleanToken)
    .maybeSingle();

  if (clientErr) return errorResponse(clientErr.message, 500);
  if (!client) return errorResponse("Invalid token", 404);
  if (!client.active || !client.portal_enabled)
    return errorResponse("Portal disabled", 403);

  const { data: documents, error: docsErr } = await supabase
    .from("document_requests")
    .select("id,title,description,required,active,sort_order,max_files,allowed_mime_types")
    .eq("client_id", client.id)
    .eq("user_id", client.user_id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (docsErr) return errorResponse(docsErr.message, 500);

  return successResponse({
    client: {
      id: client.id,
      name: client.name,
      due_day_of_month: client.due_day_of_month,
      due_timezone: client.due_timezone,
    },
    documents: documents ?? [],
  });
}
