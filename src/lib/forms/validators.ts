// src/lib/forms/validators.ts
import {
  checkbox,
  optionalString,
  requireIntInRange,
  requireString,
  validateTimeZone,
} from "./fields";

export function extractClientCore(formData: FormData) {
  return {
    name: requireString(formData, "name", "Name is required"),
    email: optionalString(formData, "email"),
    phone_number: optionalString(formData, "phone_number"),
  };
}

export function extractClientFlags(formData: FormData) {
  return {
    active: checkbox(formData, "active"),
    portal_enabled: checkbox(formData, "portal_enabled"),
    notify_by_email: checkbox(formData, "notify_by_email"),
  };
}

export function extractClientUpdate(formData: FormData) {
  const core = extractClientCore(formData);
  const flags = extractClientFlags(formData);

  return {
    name: core.name,
    email: core.email,
    phone_number: core.phone_number,
    ...flags,
  };
}

export function extractDueSettings(formData: FormData) {
  const due_day_of_month = requireIntInRange(
    formData,
    "due_day_of_month",
    1,
    31,
    "Due day of month must be 1..31"
  );

  const tzSelect = optionalString(formData, "due_timezone_select");
  const tzManual = optionalString(formData, "due_timezone_manual");
  const tzRaw = tzSelect === "__manual__" ? tzManual : tzSelect;

  const due_timezone = (tzRaw || "Africa/Johannesburg").trim();
  validateTimeZone(
    due_timezone,
    `Invalid timezone: "${due_timezone}". Use an IANA timezone like Africa/Johannesburg.`
  );

  return { due_day_of_month, due_timezone };
}

export function extractDocumentRequestCreate(formData: FormData) {
  return {
    title: requireString(formData, "title", "Document name is required"),
    description: optionalString(formData, "description"),
  };
}

export function extractDocumentRequestUpdate(formData: FormData) {
  return {
    title: requireString(formData, "title", "Document name is required"),
    description: optionalString(formData, "description"),
    required: checkbox(formData, "required"),
    active: checkbox(formData, "active"),
    recurring: checkbox(formData, "recurring"),
  };
}
