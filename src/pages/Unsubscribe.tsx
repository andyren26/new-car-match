import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Shell } from "@/pages/Auth";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import { SITE_NAME } from "@/lib/site";
import { authPrimaryButtonClass } from "@/lib/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The "取消配對通知" link in every match email: /unsubscribe?t=<token>.
// Works without signing in; the random token identifies the member.
export default function Unsubscribe() {
  useHead([{ title: `取消配對通知 — ${SITE_NAME}` }]);
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [state, setState] = useState<"working" | "done" | "invalid">(
    UUID.test(token) ? "working" : "invalid",
  );

  useEffect(() => {
    if (!UUID.test(token)) return;
    supabase.rpc("unsubscribe_matches", { p_token: token }).then(({ data, error }) => {
      setState(!error && data ? "done" : "invalid");
    });
  }, [token]);

  return (
    <Shell>
      <h1 className="text-center text-2xl">
        {state === "working" ? "處理中…" : state === "done" ? "已取消配對通知" : "連結無效"}
      </h1>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {state === "done"
          ? "之後不會再寄配對通知信給你。想重新開啟，可以登入後到「帳號設定」打開配對通知。"
          : state === "invalid"
            ? "這個取消連結無效或已過期。你可以登入後到「帳號設定」關閉配對通知。"
            : ""}
      </p>
      <Link to="/account" className={`mt-8 block text-center ${authPrimaryButtonClass}`}>
        前往帳號設定
      </Link>
    </Shell>
  );
}
