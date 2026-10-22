import { Link, useNavigate, useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import { getSession, homePathForRole, safeNext } from "@/lib/profile";
import { authInputClass, authPrimaryButtonClass } from "@/lib/ui";
import { authErrorText } from "@/lib/authErrors";
import { Shell } from "@/pages/Auth";

const head = [
  { title: "設定新密碼 — 新車媒合" },
  { name: "description", content: "為你的 新車媒合 帳號設定新密碼。" },
];

// Landing page for the reset-password email link. Supabase signs the user in
// from the link, then we let them set a new password.
export default function ResetPasswordPage() {
  useHead(head);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady("ok");
    });
    supabase.auth.getSession().then(({ data }) => setReady(data.session ? "ok" : "invalid"));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("兩次輸入的密碼不一樣。");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(authErrorText(error.message));
      return;
    }
    const session = await getSession();
    navigate(next ?? (session ? homePathForRole(session.profile.role) : "/cars"), {
      replace: true,
    });
  }

  return (
    <Shell>
      <h1 className="text-center text-3xl">設定新密碼</h1>
      {ready === "checking" && (
        <p className="mt-6 text-center text-sm text-muted-foreground">正在確認連結…</p>
      )}
      {ready === "invalid" && (
        <div className="mt-6 text-center text-sm">
          <p>這個重設連結無效或已經過期。</p>
          <Link
            to="/forgot-password"
            className="mt-4 inline-block font-medium underline underline-offset-4"
          >
            重新寄送連結
          </Link>
        </div>
      )}
      {ready === "ok" && (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            type="password"
            required
            minLength={6}
            placeholder="新密碼（至少 6 個字元）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClass}
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="再輸入一次新密碼"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={authInputClass}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button disabled={loading} className={authPrimaryButtonClass}>
            {loading ? "處理中…" : "更新密碼"}
          </button>
        </form>
      )}
    </Shell>
  );
}
