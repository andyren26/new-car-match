import { Link, useSearchParams } from "react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import { nextQuery, safeNext } from "@/lib/profile";
import { authErrorText } from "@/lib/authErrors";
import { authInputClass, authPrimaryButtonClass } from "@/lib/ui";
import { Shell } from "@/pages/Auth";

const head = [
  { title: "忘記密碼 — 新車媒合" },
  { name: "description", content: "重設你的新車媒合密碼。" },
];

export default function ForgotPasswordPage() {
  useHead(head);
  const [params] = useSearchParams();
  const search = nextQuery(safeNext(params.get("next")));
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password${search}`,
    });
    setLoading(false);
    if (error) {
      setError(authErrorText(error.message));
      return;
    }
    setSent(true);
  }

  return (
    <Shell>
      <h1 className="text-center text-3xl">忘記密碼</h1>
      {sent ? (
        <p className="mt-6 text-center text-sm">
          如果 <span className="font-medium">{email}</span> 有註冊帳號，重設密碼信已經寄出。
          請打開信中的連結設定新密碼。
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            輸入你註冊時使用的信箱，我們會寄送重設密碼的連結給你。
          </p>
          <input
            type="email"
            required
            placeholder="電子信箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button disabled={loading} className={authPrimaryButtonClass}>
            {loading ? "處理中…" : "寄送重設連結"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to={`/sign-in${search}`} className="font-medium underline underline-offset-4">
          回到登入
        </Link>
      </p>
    </Shell>
  );
}
