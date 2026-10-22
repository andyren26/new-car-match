import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CarFront } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, signInPath, type Profile } from "@/lib/profile";
import { SITE_NAME } from "@/lib/site";

type Props = { profile: Profile | null };

export function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 font-serif text-xl font-extrabold tracking-tight"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <CarFront className="h-4.5 w-4.5" />
      </span>
      {SITE_NAME}
    </Link>
  );
}

// Unread message count for the header badge.
function useUnread(userId: string | undefined) {
  return useQuery({
    queryKey: ["unread", userId],
    enabled: !!userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export default function AppHeader({ profile }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: unread = 0 } = useUnread(profile?.id);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 transition ${isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <header className="border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Logo />
        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto">
          <NavLink to="/cars" className={tab}>
            找新車
          </NavLink>
          <NavLink to="/wanted" className={tab}>
            購車需求
          </NavLink>
          {profile && (
            <>
              <NavLink to="/my" className={tab}>
                我的刊登
              </NavLink>
              <NavLink to="/messages" className={tab}>
                訊息
                {unread > 0 && (
                  <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold text-accent-foreground">
                    {unread}
                  </span>
                )}
              </NavLink>
            </>
          )}
          {profile?.role === "admin" && (
            <NavLink to="/admin" className={tab}>
              管理後台
            </NavLink>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {profile ? (
            <>
              <Link
                to="/post"
                className="rounded-md bg-accent px-4 py-2 font-semibold text-accent-foreground transition hover:brightness-95"
              >
                {profile.role === "dealer" ? "刊登新車" : "刊登需求"}
              </Link>
              <Link
                to="/account"
                className="hidden items-center gap-2 rounded-md px-3 py-2 hover:bg-secondary md:flex"
              >
                <span className="rounded bg-secondary px-1.5 py-0.5 text-xs">
                  {ROLE_LABEL[profile.role] ?? "會員"}
                </span>
                帳號
              </Link>
              <button
                onClick={signOut}
                className="rounded-md px-3 py-2 text-muted-foreground hover:bg-secondary"
              >
                登出
              </button>
            </>
          ) : (
            <>
              <Link to={signInPath(pathname)} className="rounded-md px-3 py-2 hover:bg-secondary">
                登入
              </Link>
              <Link
                to="/sign-up"
                className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
              >
                免費註冊
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
