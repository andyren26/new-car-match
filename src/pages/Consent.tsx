import { useState } from "react";
import { Link, useLoaderData, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Shell } from "@/pages/Auth";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import { errMessage } from "@/lib/errors";
import { homePathForRole, safeNext, type Session } from "@/lib/profile";
import { SITE_NAME, TERMS_VERSION } from "@/lib/site";
import { authPrimaryButtonClass } from "@/lib/ui";

// Shown after a social sign-in (no checkbox there) or when the terms change.
export default function Consent() {
  useHead([{ title: `同意條款 — ${SITE_NAME}` }]);
  const session = useLoaderData() as Session;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next")) ?? homePathForRole(session.profile.role);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const updated = !!session.profile.terms_accepted_at;

  async function accept() {
    setBusy(true);
    const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
    setBusy(false);
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    navigate(next, { replace: true });
  }

  return (
    <Shell>
      <h1 className="text-center text-2xl">{updated ? "條款已更新" : "開始使用前"}</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        {SITE_NAME}只提供新車買賣資訊的刊登與媒合，不收費、不經手款項，也不參與或保證任何交易。
        請閱讀以下文件，同意後即可刊登與留言。
      </p>
      <ul className="mt-4 space-y-1 text-sm">
        {[
          ["/terms", "使用條款"],
          ["/privacy", "隱私權政策"],
          ["/disclaimer", "免責聲明"],
        ].map(([to = "/", label]) => (
          <li key={to}>
            <Link to={to} target="_blank" className="underline underline-offset-2">
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <label className="mt-5 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1"
        />
        我已閱讀並同意使用條款、隱私權政策與免責聲明。
      </label>
      <button
        onClick={accept}
        disabled={!agreed || busy}
        className={`mt-6 ${authPrimaryButtonClass}`}
      >
        {busy ? "處理中…" : "同意並繼續"}
      </button>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          navigate("/", { replace: true });
        }}
        className="mt-3 w-full text-center text-sm text-muted-foreground hover:text-foreground"
      >
        不同意，登出
      </button>
    </Shell>
  );
}
