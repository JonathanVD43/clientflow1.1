import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Body = {
  filename: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  document_request_id?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilename(name: string) {
  // keep it predictable + storage-safe
  return name.replace(/[^\w.\-()+ ]/g, "_");
}

function isPostgrestErrorWithCode(
  e: unknown
): e is { code: string; message?: string } {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    typeof (e as { code?: unknown }).code === "string"
  );
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const cleanToken = (token ?? "").trim();
  if (!cleanToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const filename = String(body.filename ?? "").trim();
  const mime_type = body.mime_type ? String(body.mime_type).trim() : null;
  const size_bytes =
    typeof body.size_bytes === "number" ? Math.max(0, body.size_bytes) : null;

  const document_request_id = body.document_request_id
    ? String(body.document_request_id).trim()
    : null;

  if (!filename) {
    return NextResponse.json({ error: "Missing filename" }, { status: 400 });
  }
  if (document_request_id && !UUID_RE.test(document_request_id)) {
    return NextResponse.json(
      { error: "Invalid document_request_id" },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin();

  // 1) Find client by public_token
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id,user_id,active,portal_enabled")
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

  // 2) Validate doc request belongs to this client (if provided) + fetch max_files
  let maxFiles = 1;

  if (document_request_id) {
    const { data: dr, error: drErr } = await supabase
      .from("document_requests")
      .select("id,max_files,active")
      .eq("id", document_request_id)
      .eq("client_id", client.id)
      .eq("user_id", client.user_id)
      .maybeSingle();

    if (drErr) {
      return NextResponse.json({ error: drErr.message }, { status: 500 });
    }
    if (!dr || dr.active !== true) {
      return NextResponse.json(
        { error: "Invalid document request" },
        { status: 400 }
      );
    }

    maxFiles = Math.max(1, Number(dr.max_files ?? 1));
  }

  // 3) Enforce max_files (PENDING + ACCEPTED count; DENIED doesn't count)
  if (document_request_id) {
    const { count, error: countErr } = await supabase
      .from("uploads")
      .select("id", { count: "exact", head: true })
      .eq("client_id", client.id)
      .eq("user_id", client.user_id)
      .eq("document_request_id", document_request_id)
      .is("deleted_at", null)
      .in("status", ["PENDING", "ACCEPTED"]);

    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }

    if ((count ?? 0) >= maxFiles) {
      return NextResponse.json(
        { error: `Max files reached for this document (max ${maxFiles}).` },
        { status: 409 }
      );
    }
  }

  // 4) Get-or-create OPEN submission session (REUSE existing to avoid 23505)
  let sessionId: string | null = null;

  const { data: existingSession, error: sessSelErr } = await supabase
    .from("submission_sessions")
    .select("id")
    .eq("user_id", client.user_id)
    .eq("client_id", client.id)
    .eq("status", "OPEN")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessSelErr) {
    return NextResponse.json({ error: sessSelErr.message }, { status: 500 });
  }

  if (existingSession?.id) {
    sessionId = existingSession.id as string;
  } else {
    // create one (and if a race causes 23505, re-select)
    const { data: createdSession, error: sessInsErr } = await supabase
      .from("submission_sessions")
      .insert({
        user_id: client.user_id,
        client_id: client.id,
        status: "OPEN",
      })
      .select("id")
      .single();

    if (!sessInsErr && createdSession?.id) {
      sessionId = createdSession.id as string;
    } else if (
      isPostgrestErrorWithCode(sessInsErr) &&
      sessInsErr.code === "23505"
    ) {
      const { data: s2, error: s2Err } = await supabase
        .from("submission_sessions")
        .select("id")
        .eq("user_id", client.user_id)
        .eq("client_id", client.id)
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (s2Err) {
        return NextResponse.json({ error: s2Err.message }, { status: 500 });
      }
      sessionId = (s2?.id as string) ?? null;
    } else if (sessInsErr) {
      return NextResponse.json({ error: sessInsErr.message }, { status: 500 });
    }
  }

  if (!sessionId) {
    return NextResponse.json(
      { error: "Could not resolve submission session" },
      { status: 500 }
    );
  }

  // 5) Create upload row ONCE (avoid storage_key null constraint)
  const uploadId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : (await import("node:crypto")).randomUUID();

  const safeName = safeFilename(filename);
  const storage_key = `clients/${client.id}/${uploadId}/${safeName}`;

  const { error: insErr } = await supabase.from("uploads").insert({
    id: uploadId,
    user_id: client.user_id,
    client_id: client.id,
    submission_session_id: sessionId,
    document_request_id,
    original_filename: filename,
    storage_key,
    mime_type,
    size_bytes,
    status: "PENDING",
  });

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // 6) Create signed upload URL
  const bucket = process.env.NEXT_PUBLIC_UPLOADS_BUCKET ?? "client_uploads";

  const { data: signed, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(storage_key);

  if (signErr || !signed?.token) {
    return NextResponse.json(
      { error: signErr?.message ?? "Could not create signed upload url" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    upload: {
      id: uploadId,
      bucket,
      storage_key,
      document_request_id,
      submission_session_id: sessionId,
    },
    signed: {
      path: storage_key,
      token: signed.token,
    },
  });
}
