import type { Provider } from "@supabase/supabase-js";

// Social sign-in options, in display order. LINE isn't a built-in Supabase
// provider, so it is configured as a custom OIDC provider named "custom:line".
export const SOCIAL_PROVIDERS = [
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" },
  { id: "custom:line", label: "LINE" },
  { id: "apple", label: "Apple" },
] as const;

export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]["id"];

// The SDK's Provider type predates custom providers; the "custom:" string is valid at runtime.
export const asProvider = (id: SocialProviderId) => id as Provider;

// Ask Supabase which providers are switched on, so a button only appears once its
// provider is configured in the dashboard (no dead buttons before setup).
export async function fetchEnabledProviders(): Promise<Set<SocialProviderId>> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return new Set();
  const [external, line] = await Promise.all([
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j): Record<string, unknown> => j?.external ?? {})
      .catch(() => ({}) as Record<string, unknown>),
    customProviderExists(url, key, "custom:line"),
  ]);
  return new Set(
    SOCIAL_PROVIDERS.map((p) => p.id).filter((id) =>
      id === "custom:line" ? line : external[id] === true,
    ),
  );
}

// Custom OIDC providers don't appear in /auth/v1/settings. Instead, probe the
// authorize endpoint: a configured provider answers with a redirect to its
// login page, an unknown one with a 400 "custom provider … not found".
async function customProviderExists(url: string, key: string, id: string): Promise<boolean> {
  try {
    const qs = new URLSearchParams({ provider: id, redirect_to: window.location.origin });
    const res = await fetch(`${url}/auth/v1/authorize?${qs}`, {
      redirect: "manual",
      headers: { apikey: key },
    });
    return res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}
