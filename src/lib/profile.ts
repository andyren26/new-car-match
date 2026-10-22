import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { TERMS_VERSION } from "@/lib/site";

export type Profile = Tables<"profiles">;
export type Role = "buyer" | "dealer" | "admin";

export type Session = { user: User; profile: Profile };

// Roles are read from public.profiles.role (never user_metadata).
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", data.user.id)
    .single();
  if (profileError || !profile) return null;
  return { user: data.user, profile };
}

export function homePathForRole(role: string): string {
  if (role === "admin") return "/admin";
  if (role === "dealer") return "/wanted";
  return "/cars";
}

// Has this member agreed to the CURRENT terms + privacy policy?
export const hasAcceptedTerms = (p: Profile) =>
  !!p.terms_accepted_at && p.terms_version === TERMS_VERSION;

export const ROLE_LABEL: Record<string, string> = {
  buyer: "買家",
  dealer: "車商",
  admin: "管理員",
};

// What this account posts: dealers post cars, buyers post requests.
export const postKindForRole = (role: string): "sell" | "want" =>
  role === "dealer" ? "sell" : "want";

// The name shown on a member's listings and messages.
export function publicName(
  p: Pick<Profile, "role" | "display_name" | "company_name"> | null | undefined,
): string {
  if (!p) return "會員";
  if (p.role === "dealer") return p.company_name || p.display_name || "車商";
  return p.display_name || "買家";
}

// Only follow same-site relative paths from ?next= (never "//evil.com" or a full URL).
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return null;
  return next;
}

// "?next=…" for a safe return path, else "" — the only query auth pages pass along.
export const nextQuery = (next: string | null) => (next ? `?next=${encodeURIComponent(next)}` : "");

export const signInPath = (next?: string) =>
  next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
