import { useState } from "react";
import { Link, useLoaderData, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import PageShell, { PageTitle } from "@/components/PageShell";
import ListingPhotos from "@/components/ListingPhotos";
import { FraudNotice } from "@/components/ListingBits";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import { BRANDS, REGIONS, useListing, type Kind, type Listing } from "@/lib/cars";
import { errMessage } from "@/lib/errors";
import { postKindForRole, type Session } from "@/lib/profile";
import { SITE_NAME } from "@/lib/site";
import {
  cardCls,
  ghostBtn,
  hintCls,
  inputCls,
  labelCls,
  primaryBtn,
  selectCls,
  textareaCls,
} from "@/lib/ui";

// /post (new) and /listings/:id/edit.
export default function PostListing() {
  const session = useLoaderData() as Session;
  const { id } = useParams();
  const { data: existing, isLoading } = useListing(id);
  useHead([{ title: `${id ? "編輯刊登" : "新增刊登"} — ${SITE_NAME}` }]);

  if (id && isLoading) {
    return (
      <PageShell profile={session.profile}>
        <div className="h-96 animate-pulse rounded-xl bg-secondary" />
      </PageShell>
    );
  }
  if (id && (!existing || existing.owner_id !== session.user.id)) {
    return (
      <PageShell profile={session.profile}>
        <div className={cardCls}>找不到這則刊登，或你沒有編輯權限。</div>
      </PageShell>
    );
  }
  return (
    <PageShell profile={session.profile}>
      <ListingForm key={existing?.id ?? "new"} session={session} existing={existing ?? null} />
    </PageShell>
  );
}

type Form = {
  title: string;
  brand: string;
  model: string;
  model_year: string;
  trim_level: string;
  color: string;
  price: string;
  budget_min: string;
  budget_max: string;
  region: string;
  delivery_note: string;
  description: string;
};

const fromListing = (l: Listing | null): Form => ({
  title: l?.title ?? "",
  brand: l?.brand ?? "",
  model: l?.model ?? "",
  model_year: l?.model_year?.toString() ?? String(new Date().getFullYear()),
  trim_level: l?.trim_level ?? "",
  color: l?.color ?? "",
  price: l?.price ? String(l.price / 10000) : "",
  budget_min: l?.budget_min ? String(l.budget_min / 10000) : "",
  budget_max: l?.budget_max ? String(l.budget_max / 10000) : "",
  region: l?.region ?? "",
  delivery_note: l?.delivery_note ?? "",
  description: l?.description ?? "",
});

// Prices are typed in 萬 (10,000 NTD), the unit everyone uses for cars here.
const wanToNtd = (v: string) => {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 10000) : null;
};

function ListingForm({ session, existing }: { session: Session; existing: Listing | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = session.profile.role === "admin";
  const [kind, setKind] = useState<Kind>(
    (existing?.kind as Kind) ?? postKindForRole(session.profile.role),
  );
  const [f, setF] = useState<Form>(fromListing(existing));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set =
    (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.value });

  const sell = kind === "sell";
  const wasApproved = existing?.status === "approved";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const price = wanToNtd(f.price);
    const budgetMin = wanToNtd(f.budget_min);
    const budgetMax = wanToNtd(f.budget_max);
    if (sell && !price) {
      setError("請填寫售價。");
      return;
    }
    if (!sell && !budgetMax) {
      setError("請填寫預算上限。");
      return;
    }
    if (!sell && budgetMin && budgetMax && budgetMin > budgetMax) {
      setError("預算下限不能高於上限。");
      return;
    }

    const row = {
      title: f.title.trim(),
      brand: f.brand,
      model: f.model.trim(),
      model_year: f.model_year ? Number(f.model_year) : null,
      trim_level: f.trim_level.trim() || null,
      color: f.color.trim() || null,
      price: sell ? price : null,
      budget_min: sell ? null : budgetMin,
      budget_max: sell ? null : budgetMax,
      region: f.region,
      delivery_note: f.delivery_note.trim() || null,
      description: f.description.trim(),
    };

    setBusy(true);
    const res = existing
      ? await supabase.from("listings").update(row).eq("id", existing.id).select("id").single()
      : await supabase
          .from("listings")
          .insert({ ...row, kind })
          .select("id")
          .single();
    setBusy(false);
    if (res.error) {
      setError(errMessage(res.error, "沒有儲存成功，請再試一次。"));
      return;
    }

    qc.invalidateQueries({ queryKey: ["listing", res.data.id] });
    qc.invalidateQueries({ queryKey: ["my-listings"] });
    if (existing) {
      toast.success(wasApproved ? "已更新，重新送審中" : "已更新");
      navigate(`/listings/${existing.id}`);
    } else {
      toast.success("已送出審核，你可以先上傳照片");
      navigate(`/listings/${res.data.id}/edit`, { replace: true });
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow={sell ? "Dealer listing" : "Buyer request"}
        title={existing ? "編輯刊登" : sell ? "刊登新車" : "刊登購車需求"}
      >
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {sell
            ? "填寫車款、配備與售價。刊登經管理員審核後公開，買家會用站內留言聯繫你。"
            : "寫下想買的車款與預算，審核通過後車商就能看到並留言報價。"}
        </p>
      </PageTitle>

      {existing && (
        <div className="rounded-xl border bg-card p-4 text-sm">
          {existing.status === "pending" && "這則刊登正在等待審核。"}
          {existing.status === "approved" &&
            "這則刊登已上架。修改內容後會重新送審，審核期間暫不公開。"}
          {existing.status === "rejected" && (
            <span className="text-destructive">
              未通過審核：{existing.review_note || "請修正內容後重新送出"}。修改後儲存即可重新送審。
            </span>
          )}
          {existing.status === "closed" && "這則刊登已結束，可在「我的刊登」重新開啟。"}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <form onSubmit={submit} className={`${cardCls} space-y-5`}>
          {isAdmin && !existing && (
            <div>
              <span className={labelCls}>刊登類型（管理員）</span>
              <div className="flex gap-2">
                {(["sell", "want"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`${ghostBtn} ${kind === k ? "border-primary bg-secondary" : ""}`}
                  >
                    {k === "sell" ? "賣車" : "求購"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field
            label="標題"
            hint={
              sell ? "例如：2026 RAV4 2.5 油電 旗艦版 現車" : "例如：想買 RAV4 油電，台南可交車"
            }
          >
            <input
              required
              minLength={4}
              maxLength={80}
              value={f.title}
              onChange={set("title")}
              className={inputCls}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="品牌">
              <select required value={f.brand} onChange={set("brand")} className={selectCls}>
                <option value="" disabled>
                  選擇品牌
                </option>
                {BRANDS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="車型">
              <input
                required
                maxLength={60}
                placeholder="例如：RAV4"
                value={f.model}
                onChange={set("model")}
                className={inputCls}
              />
            </Field>
            <Field label="年式">
              <input
                type="number"
                min={2000}
                max={2100}
                value={f.model_year}
                onChange={set("model_year")}
                className={inputCls}
              />
            </Field>
            <Field label={sell ? "版本／配備" : "想要的版本／配備（選填）"}>
              <input
                maxLength={80}
                placeholder="例如：2.5 HEV 旗艦"
                value={f.trim_level}
                onChange={set("trim_level")}
                className={inputCls}
              />
            </Field>
            <Field label="顏色（選填）">
              <input maxLength={40} value={f.color} onChange={set("color")} className={inputCls} />
            </Field>
            <Field label={sell ? "所在地區" : "希望交車地區"}>
              <select required value={f.region} onChange={set("region")} className={selectCls}>
                <option value="" disabled>
                  選擇縣市
                </option>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>

          {sell ? (
            <Field label="售價（萬元）" hint="例如 115 代表 NT$1,150,000">
              <input
                required
                type="number"
                min={1}
                step="0.1"
                value={f.price}
                onChange={set("price")}
                className={inputCls}
              />
            </Field>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="預算下限（萬元，選填）">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={f.budget_min}
                  onChange={set("budget_min")}
                  className={inputCls}
                />
              </Field>
              <Field label="預算上限（萬元）">
                <input
                  required
                  type="number"
                  min={1}
                  step="0.1"
                  value={f.budget_max}
                  onChange={set("budget_max")}
                  className={inputCls}
                />
              </Field>
            </div>
          )}

          <Field
            label={sell ? "交車時間（選填）" : "希望交車時間（選填）"}
            hint={sell ? "例如：現車、約 2 個月" : "例如：3 個月內"}
          >
            <input
              maxLength={100}
              value={f.delivery_note}
              onChange={set("delivery_note")}
              className={inputCls}
            />
          </Field>

          <Field label="說明" hint="請勿填寫電話、LINE ID 或匯款帳號，雙方請先用站內留言聯繫。">
            <textarea
              rows={6}
              maxLength={3000}
              value={f.description}
              onChange={set("description")}
              placeholder={
                sell ? "配備、保固、贈品、可否試乘等" : "用途、必要配備、是否有舊車要處理等"
              }
              className={textareaCls}
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={busy} className={primaryBtn}>
              {busy ? "儲存中…" : existing ? "儲存並送審" : "送出審核"}
            </button>
            <Link to={existing ? `/listings/${existing.id}` : "/my"} className={ghostBtn}>
              取消
            </Link>
            <span className="text-xs text-muted-foreground">
              送出即表示內容真實，並同意使用條款。
            </span>
          </div>
        </form>

        <div className="space-y-4">
          {existing ? (
            <div className={cardCls}>
              <ListingPhotos listingId={existing.id} />
            </div>
          ) : (
            <div className={`${cardCls} text-sm text-muted-foreground`}>
              送出後就可以上傳照片{sell ? "（建議至少 3 張實車照）" : ""}。
            </div>
          )}
          <FraudNotice compact />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className={`block ${hintCls}`}>{hint}</span>}
    </label>
  );
}
