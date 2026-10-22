import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";

import PageShell, { PageTitle } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import { errMessage } from "@/lib/errors";
import { ROLE_LABEL, type Session } from "@/lib/profile";
import { SITE_NAME } from "@/lib/site";
import { cardCls, hintCls, inputCls, labelCls, primaryBtn } from "@/lib/ui";

export default function Account() {
  useHead([{ title: `帳號 — ${SITE_NAME}` }]);
  const session = useLoaderData() as Session;
  const p = session.profile;
  const revalidator = useRevalidator();
  const [displayName, setDisplayName] = useState(p.display_name ?? "");
  const [company, setCompany] = useState(p.company_name ?? "");
  const [taxId, setTaxId] = useState(p.tax_id ?? "");
  const [busy, setBusy] = useState(false);
  const isDealer = p.role === "dealer";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (taxId && !/^\d{8}$/.test(taxId)) {
      toast.error("統一編號需為 8 位數字");
      return;
    }
    if (isDealer && !company.trim()) {
      toast.error("車商請填寫公司或車行名稱");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        ...(isDealer ? { company_name: company.trim(), tax_id: taxId || null } : {}),
      })
      .eq("id", p.id);
    setBusy(false);
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    toast.success("已儲存");
    revalidator.revalidate();
  }

  async function becomeDealer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("become_dealer", {
      p_company_name: company,
      ...(taxId ? { p_tax_id: taxId } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    toast.success("已改成車商帳號");
    revalidator.revalidate();
  }

  return (
    <PageShell profile={p}>
      <PageTitle eyebrow="Account" title="帳號設定" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <form onSubmit={save} className={`${cardCls} space-y-4`}>
          <p className="text-sm">
            登入信箱：{session.user.email}
            <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs">
              {ROLE_LABEL[p.role]}
            </span>
          </p>
          <label className="block">
            <span className={labelCls}>{isDealer ? "聯絡人姓名" : "暱稱"}</span>
            <input
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
            />
            <span className={`block ${hintCls}`}>會顯示在你的刊登和訊息上。</span>
          </label>
          {isDealer && (
            <>
              <label className="block">
                <span className={labelCls}>公司或車行名稱</span>
                <input
                  required
                  maxLength={60}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={labelCls}>統一編號（選填）</span>
                <input
                  inputMode="numeric"
                  maxLength={8}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
                  className={inputCls}
                />
              </label>
              <p className="flex items-center gap-1 text-sm">
                {p.dealer_verified ? (
                  <>
                    <BadgeCheck className="h-4 w-4 text-good" />{" "}
                    已通過驗證。修改公司名稱或統編後需要重新驗證。
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    尚未驗證。填寫正確的公司名稱與統編後，管理員核對商工登記資料即可給予驗證標章。
                  </span>
                )}
              </p>
            </>
          )}
          <button disabled={busy} className={primaryBtn}>
            儲存
          </button>
        </form>

        {p.role === "buyer" && (
          <form onSubmit={becomeDealer} className={`${cardCls} space-y-4`}>
            <h2 className="font-sans text-lg font-semibold">我是車商／業務</h2>
            <p className="text-sm text-muted-foreground">
              改成車商帳號後就能刊登新車。之後無法改回買家；已刊登的購車需求會保留。
            </p>
            <input
              required
              maxLength={60}
              placeholder="公司或車行名稱"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={inputCls}
            />
            <input
              inputMode="numeric"
              maxLength={8}
              placeholder="統一編號（選填，8 位數字）"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
            />
            <button disabled={busy} className={primaryBtn}>
              改成車商帳號
            </button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
