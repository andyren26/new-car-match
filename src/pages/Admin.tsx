import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import PageShell, { PageTitle } from "@/components/PageShell";
import { KindBadge, PosterName, StatusBadge } from "@/components/ListingBits";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import {
  LISTING_SELECT,
  REPORT_REASON_LABEL,
  photoUrl,
  priceLine,
  sortedPhotos,
  type ListingFull,
} from "@/lib/cars";
import { errMessage } from "@/lib/errors";
import { publicName, type Session } from "@/lib/profile";
import { SITE_NAME } from "@/lib/site";
import { cardCls, dangerBtn, ghostBtn, inputCls, primaryBtn } from "@/lib/ui";

type Tab = "review" | "reports" | "dealers";

// The real control is RLS + the admin-checked RPCs; the route guard is UX only.
export default function Admin() {
  useHead([{ title: `管理後台 — ${SITE_NAME}` }]);
  const session = useLoaderData() as Session;
  const [tab, setTab] = useState<Tab>("review");
  const tabs: [Tab, string][] = [
    ["review", "待審核刊登"],
    ["reports", "檢舉"],
    ["dealers", "車商驗證"],
  ];
  return (
    <PageShell profile={session.profile}>
      <PageTitle eyebrow="Admin" title="管理後台">
        <div className="mt-5 flex gap-1" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-md px-4 py-2 text-sm ${tab === id ? "bg-primary text-primary-foreground" : "bg-card"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </PageTitle>
      <div className="mt-8">
        {tab === "review" && <ReviewQueue />}
        {tab === "reports" && <Reports />}
        {tab === "dealers" && <Dealers />}
      </div>
    </PageShell>
  );
}

function ReviewQueue() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(LISTING_SELECT)
        .eq("status", "pending")
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return data as unknown as ListingFull[];
    },
  });

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />;
  if (data.length === 0) return <Empty>目前沒有待審核的刊登。</Empty>;
  return (
    <div className="space-y-4">
      {data.map((l) => (
        <ReviewCard key={l.id} l={l} onDone={() => qc.invalidateQueries({ queryKey: ["admin"] })} />
      ))}
    </div>
  );
}

function ReviewCard({ l, onDone }: { l: ListingFull; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const photos = sortedPhotos(l);

  async function review(approve: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("review_listing", {
      p_id: l.id,
      p_approve: approve,
      ...(note.trim() ? { p_note: note.trim() } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    toast.success(approve ? "已上架" : "已退件");
    onDone();
  }

  return (
    <article className={cardCls}>
      <div className="flex flex-wrap items-center gap-2">
        <KindBadge kind={l.kind} />
        <span className="text-sm text-muted-foreground">
          <PosterName owner={l.owner} />
          {l.owner?.tax_id && <span className="ml-2 font-mono">統編 {l.owner.tax_id}</span>}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(l.updated_at).toLocaleString("zh-TW")}
        </span>
      </div>
      <Link
        to={`/listings/${l.id}`}
        className="mt-2 flex items-center gap-1 text-lg font-semibold hover:underline"
      >
        {l.title} <ExternalLink className="h-4 w-4" />
      </Link>
      <p className="text-sm">
        {l.brand} {l.model} {l.model_year ?? ""} {l.trim_level ?? ""} · {priceLine(l)} · {l.region}
      </p>
      {l.review_note && <p className="mt-1 text-sm text-destructive">{l.review_note}</p>}
      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
        {l.description}
      </p>
      {photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {photos.map((p) => (
            <img
              key={p.id}
              src={photoUrl(p.storage_path)}
              alt=""
              className="h-20 w-28 shrink-0 rounded object-cover"
            />
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="退件原因（退件時必填，刊登者看得到）"
          className={`${inputCls} min-w-64 flex-1`}
        />
        <button disabled={busy} onClick={() => review(true)} className={primaryBtn}>
          通過上架
        </button>
        <button
          disabled={busy}
          onClick={() => review(false)}
          className={`${ghostBtn} text-destructive`}
        >
          退件
        </button>
      </div>
    </article>
  );
}

type Report = {
  id: string;
  listing_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  listing: { id: string; title: string; status: string; owner_id: string } | null;
  reporter: {
    id: string;
    role: string;
    display_name: string | null;
    company_name: string | null;
  } | null;
};

function Reports() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(
          "*, listing:listings(id, title, status, owner_id), reporter:profiles!reports_reporter_id_fkey(id, role, display_name, company_name)",
        )
        .eq("status", "open")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as Report[];
    },
  });

  async function resolve(r: Report, action: "dismiss" | "takedown") {
    const note =
      action === "takedown" ? window.prompt("下架原因（刊登者看得到）", "經檢舉查證後下架") : null;
    if (action === "takedown" && note === null) return;
    const { error } = await supabase.rpc("resolve_report", {
      p_id: r.id,
      p_action: action,
      ...(note ? { p_note: note } : {}),
    });
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    toast.success(action === "takedown" ? "已下架" : "已駁回檢舉");
    qc.invalidateQueries({ queryKey: ["admin"] });
  }

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />;
  if (data.length === 0) return <Empty>目前沒有待處理的檢舉。</Empty>;
  return (
    <ul className="space-y-3">
      {data.map((r) => (
        <li key={r.id} className={cardCls}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {REPORT_REASON_LABEL[r.reason] ?? r.reason}
            </span>
            {r.listing && <StatusBadge status={r.listing.status} />}
            <span className="ml-auto text-xs text-muted-foreground">
              {publicName(r.reporter)} · {new Date(r.created_at).toLocaleString("zh-TW")}
            </span>
          </div>
          {r.listing ? (
            <Link
              to={`/listings/${r.listing.id}`}
              className="mt-2 block font-semibold hover:underline"
            >
              {r.listing.title}
            </Link>
          ) : (
            <p className="mt-2 text-muted-foreground">（刊登已刪除）</p>
          )}
          {r.details && <p className="mt-1 whitespace-pre-wrap text-sm">{r.details}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => resolve(r, "takedown")}
              className={`${ghostBtn} text-destructive`}
            >
              下架刊登
            </button>
            <button onClick={() => resolve(r, "dismiss")} className={ghostBtn}>
              駁回檢舉
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Dealers() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "dealers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "dealer")
        .order("dealer_verified")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function setVerified(id: string, v: boolean) {
    const { error } = await supabase.rpc("set_dealer_verified", { p_user: id, p_verified: v });
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    qc.invalidateQueries({ queryKey: ["admin", "dealers"] });
  }

  if (isLoading) return <div className="h-40 animate-pulse rounded-xl bg-secondary" />;
  if (data.length === 0) return <Empty>還沒有車商註冊。</Empty>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary text-left">
          <tr>
            <th className="p-3">公司／車行</th>
            <th className="p-3">聯絡人</th>
            <th className="p-3">統一編號</th>
            <th className="p-3">狀態</th>
            <th className="p-3" />
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id} className="border-t">
              <td className="p-3 font-medium">{d.company_name ?? "—"}</td>
              <td className="p-3">{d.display_name ?? "—"}</td>
              <td className="p-3 font-mono">{d.tax_id ?? "—"}</td>
              <td className="p-3">
                {d.dealer_verified ? (
                  <span className="flex items-center gap-1 text-good">
                    <BadgeCheck className="h-4 w-4" /> 已驗證
                  </span>
                ) : (
                  <span className="text-muted-foreground">未驗證</span>
                )}
              </td>
              <td className="p-3 text-right">
                {d.dealer_verified ? (
                  <button onClick={() => setVerified(d.id, false)} className={dangerBtn}>
                    取消驗證
                  </button>
                ) : (
                  <button onClick={() => setVerified(d.id, true)} className={ghostBtn}>
                    標記已驗證
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t p-3 text-xs text-muted-foreground">
        驗證前請到經濟部商工登記公示資料查詢系統，用統一編號核對公司名稱與登記狀態。
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
