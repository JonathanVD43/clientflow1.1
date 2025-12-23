import "server-only";
import { Resend } from "resend";

export function resendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY");
  return new Resend(key);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("Missing EMAIL_FROM");

  const resend = resendClient();
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (error) throw new Error(error.message);
  return data;
}
