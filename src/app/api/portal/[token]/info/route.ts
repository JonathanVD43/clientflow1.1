import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params; // ✅ unwrap params promise
  const cleanToken = (token ?? "").trim();

  if (!cleanToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id,name,active,portal_enabled,due_day_of_month,due_timezone,user_id")
    .eq("public_token", cleanToken)
    .maybeSingle();

  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 });
  }

  if (!client) {
    return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  }

  if (!client.active || !client.portal_enabled) {
    return NextResponse.json({ error: "Portal disabled" }, { status: 403 });
  }

  const { data: documents, error: docsErr } = await supabase
    .from("document_requests")
    .select(
      "id,title,description,required,active,sort_order,max_files,allowed_mime_types"
    )
    .eq("client_id", client.id)
    .eq("user_id", client.user_id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (docsErr) {
    return NextResponse.json({ error: docsErr.message }, { status: 500 });
  }

  return NextResponse.json({
    client: {
      id: client.id,
      name: client.name,
      due_day_of_month: client.due_day_of_month,
      due_timezone: client.due_timezone,
    },
    documents: documents ?? [],
  });
}
