// Supabase returns a PostgrestError / AuthError as a plain object ({ message, details,
// hint, code }), not an Error instance, so `err instanceof Error` would swallow the
// real database message (e.g. create_booking's "those slots were just taken").
export function errMessage(err: unknown, fallback = "發生錯誤，請再試一次。"): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
