// src/lib/audit.ts
import { createClient } from "@supabase/supabase-js";

type AuditSeverity = "info" | "warn" | "error" | "security";

type AuditEvent = {
  requestId?: string;
  actorUserId?: string;
  actorIp?: string;
  actorUserAgent?: string;
  eventType: string;
  severity?: AuditSeverity;
  route?: string;
  method?: string;
  metadata?: Record<string, unknown>;
};

function getAdminSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function writeAuditEvent(ev: AuditEvent) {
  const supabase = getAdminSupabase();

  // IMPORTANT: only store safe metadata (no tokens, no secrets, no full cookies)
  const { error } = await supabase.from("audit_events").insert({
    request_id: ev.requestId ?? null,
    actor_user_id: ev.actorUserId ?? null,
    actor_ip: ev.actorIp ?? null,
    actor_user_agent: ev.actorUserAgent ?? null,
    event_type: ev.eventType,
    severity: ev.severity ?? "info",
    route: ev.route ?? null,
    method: ev.method ?? null,
    metadata: ev.metadata ?? {},
  });

  if (error) {
    // Don’t throw: audit logging should not take down the request
    // (your Pino logger + Sentry will still catch real failures)
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}
