import type { ReactNode } from "react";

import AppHeader from "@/components/AppHeader";
import SiteFooter from "@/components/SiteFooter";
import type { Profile } from "@/lib/profile";

export default function PageShell({
  profile,
  children,
}: {
  profile: Profile | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader profile={profile} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 sm:px-6 animate-fade-up">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

// The dark title band at the top of a page.
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className="hem rounded-xl bg-cream px-5 py-8 sm:px-8 sm:py-10">
      {eyebrow && (
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-2 text-3xl sm:text-4xl">{title}</h1>
      {children}
    </section>
  );
}
