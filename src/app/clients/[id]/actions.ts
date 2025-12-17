"use server";

import { redirect } from "next/navigation";
import { updateClient, deleteClient } from "@/lib/db/clients";

export async function updateClientAction(clientId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone_number") ?? "").trim();

  const active = formData.get("active") === "on";
  const portal_enabled = formData.get("portal_enabled") === "on";
  const notify_by_email = formData.get("notify_by_email") === "on";

  if (!name) throw new Error("Name is required");

  await updateClient(clientId, {
    name,
    email: emailRaw ? emailRaw : null,
    phone_number: phoneRaw ? phoneRaw : null,
    active,
    portal_enabled,
    notify_by_email,
  });

  redirect(`/clients/${clientId}`);
}

export async function updateClientDueSettingsAction(
  clientId: string,
  formData: FormData
) {
  try {
    const dueDayRaw = String(formData.get("due_day_of_month") ?? "").trim();

    const tzSelect = String(formData.get("due_timezone_select") ?? "").trim();
    const tzManual = String(formData.get("due_timezone_manual") ?? "").trim();
    const tzRaw = tzSelect === "__manual__" ? tzManual : tzSelect;

    const due_day_of_month = Number(dueDayRaw);
    if (
      !Number.isInteger(due_day_of_month) ||
      due_day_of_month < 1 ||
      due_day_of_month > 31
    ) {
      throw new Error("Due day of month must be 1..31");
    }

    const due_timezone = (tzRaw || "Africa/Johannesburg").trim();

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: due_timezone }).format(
        new Date()
      );
    } catch {
      throw new Error(
        `Invalid timezone: "${due_timezone}". Use an IANA timezone like Africa/Johannesburg.`
      );
    }

    await updateClient(clientId, {
      due_day_of_month,
      due_timezone,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save due settings";
    redirect(`/clients/${clientId}?dueError=${encodeURIComponent(msg)}`);
  }

  redirect(`/clients/${clientId}?saved=due`);
}

export async function deleteClientAction(clientId: string) {
  await deleteClient(clientId);
  redirect("/clients");
}
