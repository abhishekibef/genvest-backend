let activeApiKey = process.env.RESEND_API_KEY || "";

export function getResendApiKey() {
  return activeApiKey || process.env.RESEND_API_KEY || "";
}

export function setResendApiKey(key) {
  if (key && typeof key === "string" && key.trim().startsWith("re_")) {
    activeApiKey = key.trim();
    return true;
  }
  return false;
}
