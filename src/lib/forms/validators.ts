import { checkbox, optionalString, requireIntInRange, requireString } from "./fields";

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
  // Launch rule: 15..28 only (avoids cross-month reminder logic)
  const due_day_of_month = requireIntInRange(
    formData,
    "due_day_of_month",
    15,
    28,
    "Due day of month must be 15..28"
  );

  return { due_day_of_month };
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
