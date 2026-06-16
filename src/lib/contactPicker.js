export function isContactPickerSupported() {
  return typeof navigator?.contacts?.select === "function";
}

export function normalizePhone(raw) {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("972")) digits = "0" + digits.slice(3);
  return digits;
}

export async function pickParentContact() {
  if (!isContactPickerSupported()) {
    const err = new Error("unsupported");
    err.code = "unsupported";
    throw err;
  }

  const contacts = await navigator.contacts.select(["name", "tel"], { multiple: false });
  if (!contacts?.length) return null;

  const contact = contacts[0];
  const name = contact.name?.[0] || "";
  const tel = contact.tel?.[0];
  if (!tel) {
    const err = new Error("no-phone");
    err.code = "no-phone";
    throw err;
  }

  return { name, phone: normalizePhone(tel) };
}
