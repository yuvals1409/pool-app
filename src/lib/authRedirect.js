/**
 * כתובת החזרה אחרי OAuth — חייבת להופיע ב-Supabase Dashboard:
 * Authentication → URL Configuration → Redirect URLs
 *   http://localhost:5173/**
 *   http://127.0.0.1:5173/**
 */
export function getOAuthRedirectUrl() {
  const explicit = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  if (explicit) return explicit.replace(/\/?$/, "/");

  const { origin, pathname } = window.location;
  const base = pathname && pathname !== "/" ? pathname : "/";
  return `${origin}${base}`;
}
