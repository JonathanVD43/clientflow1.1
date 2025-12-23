// src/lib/email/templates.ts
export type EmailTemplateName =
  | "manual_request_link"
  | "replacement_link"
  | "session_finalized_notify"
  | "all_docs_accepted";

type ManualRequestPayload = {
  clientName?: string;
  link?: string;
};

type ReplacementPayload = {
  clientName?: string;
  link?: string;
};

type SessionFinalizedPayload = {
  clientName?: string;
  sessionId?: string;
  link?: string;
};

type AllDocsAcceptedPayload = {
  clientName?: string;
};

type TemplatePayloadMap = {
  manual_request_link: ManualRequestPayload;
  replacement_link: ReplacementPayload;
  session_finalized_notify: SessionFinalizedPayload;
  all_docs_accepted: AllDocsAcceptedPayload;
};

type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Very simple launch templates.
 * Later you can move to DB-driven templates if you want.
 */
export function renderTemplate<N extends EmailTemplateName>(
  name: N,
  payload: TemplatePayloadMap[N]
): RenderedEmail {
  if (name === "manual_request_link") {
    const p = payload as ManualRequestPayload;
    const clientName = String(p.clientName ?? "your client");
    const link = String(p.link ?? "");
    return {
      subject: `Document request for ${clientName}`,
      html: `
        <p>Hello,</p>
        <p>Please upload the requested documents using this link:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Thanks.</p>
      `,
      text: `Please upload the requested documents here: ${link}`,
    };
  }

  if (name === "replacement_link") {
    const p = payload as ReplacementPayload;
    const clientName = String(p.clientName ?? "your client");
    const link = String(p.link ?? "");
    return {
      subject: `Replacement documents requested for ${clientName}`,
      html: `
        <p>Hello,</p>
        <p>Some documents were declined and need replacement.</p>
        <p>Please upload replacements using this link:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Thanks.</p>
      `,
      text: `Please upload replacement documents here: ${link}`,
    };
  }

  if (name === "all_docs_accepted") {
    const p = payload as AllDocsAcceptedPayload;
    const clientName = String(p.clientName ?? "your docs");
    return {
      subject: `Documents received: ${clientName}`,
      html: `
        <p>Hello,</p>
        <p>Thanks — we’ve received and accepted all your requested documents for:</p>
        <p><strong>${clientName}</strong></p>
        <p>You don’t need to do anything else.</p>
      `,
      text: `Thanks — we’ve received and accepted all your requested documents for: ${clientName}.`,
    };
  }

  // session_finalized_notify
  const p = payload as SessionFinalizedPayload;
  const clientName = String(p.clientName ?? "Client");
  const sessionId = String(p.sessionId ?? "");
  const link = String(p.link ?? "");
  return {
    subject: `Ready for review: ${clientName}`,
    html: `
      <p>All requested documents have been uploaded for:</p>
      <p><strong>${clientName}</strong></p>
      <p>Session: <code>${sessionId}</code></p>
      <p><a href="${link}">Open review session</a></p>
    `,
    text: `All documents uploaded for ${clientName}. Review: ${link}`,
  };
}
