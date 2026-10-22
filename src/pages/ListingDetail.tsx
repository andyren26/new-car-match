import { useState } from "react";
import { Link, useLoaderData, useLocation, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CarFront, Flag, MapPin } from "lucide-react";
import { toast } from "sonner";

import PageShell from "@/components/PageShell";
import {
  FraudNotice,
  KindBadge,
  ListingGrid,
  PosterName,
  StatusBadge,
} from "@/components/ListingBits";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import {
  REPORT_REASONS,
  formatTWD,
  photoUrl,
  priceLine,
  sortedPhotos,
  useListing,
  useMatches,
  type ListingFull,
} from "@/lib/cars";
import { errMessage } from "@/lib/errors";
import { signInPath, type Session } from "@/lib/profile";
import { SITE_NAME } from "@/lib/site";
import { accentBtn, cardCls, ghostBtn, primaryBtn, selectCls, textareaCls } from "@/lib/ui";

export default function ListingDetail() {
  const { id } = useParams();
  const session = useLoaderData() as Session | null;
  const { data: l, isLoading, error } = useListing(id);
  useHead([{ title: `${l?.title ?? "刊登"} — ${SITE_NAME}` }]);

  return (
    <PageShell profile={session?.profile ?? null}>
      {isLoading ? (
        <div className="h-96 animate-pulse rounded-xl bg-secondary" />
      ) : error || !l ? (
        <div className={`${cardCls} text-center`}>
          <p>找不到這則刊登，可能已下架或仍在審核中。</p>
          <Link to="/cars" className={`${ghostBtn} mt-4 inline-block`}>
            回到找新車
          </Link>
        </div>
      ) : (
        <Detail l={l} session={session} />
      )}
    </PageShell>
  );
}

function Detail({ l, session }: { l: ListingFull; session: Session | null }) {
  const photos = sortedPhotos(l);
  const [active, setActive] = useState(0);
  const isOwner = session?.user.id === l.owner_id;
  const owner = l.owner;

  const rows: [string, string | null | undefined][] = [
    ["品牌", l.brand],
    ["車型", l.model],
    ["年式", l.model_year ? `${l.model_year} 年式` : null],
    ["版本／配備", l.trim_level],
    ["顏色", l.color],
    ["地區", l.region],
    [l.kind === "want" ? "希望交車" : "交車時間", l.delivery_note],
    l.kind === "sell"
      ? ["售價", formatTWD(l.price)]
      : [
          "預算",
          l.budget_min
            ? `${formatTWD(l.budget_min)} – ${formatTWD(l.budget_max)}`
            : `${formatTWD(l.budget_max)} 以內`,
        ],
  ];

  return (
    <div className="space-y-10">
      {isOwner && <OwnerBar l={l} />}

      <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          {photos.length ? (
            <>
              <img
                src={photoUrl((photos[active] ?? photos[0])!.storage_path)}
                alt={l.title}
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
              {photos.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {photos.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => setActive(i)}
                      className={`shrink-0 overflow-hidden rounded-md border-2 ${i === active ? "border-primary" : "border-transparent"}`}
                    >
                      <img
                        src={photoUrl(p.storage_path)}
                        alt=""
                        className="h-16 w-24 object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-sand">
              <CarFront className="h-16 w-16 text-muted-foreground/50" />
            </div>
          )}

          <div className={cardCls}>
            <h2 className="font-sans text-lg font-semibold">
              {l.kind === "want" ? "需求說明" : "車輛說明"}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
              {l.description || "（刊登者沒有填寫說明）"}
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className={cardCls}>
            <div className="flex flex-wrap items-center gap-2">
              <KindBadge kind={l.kind} />
              {isOwner && <StatusBadge status={l.status} />}
            </div>
            <h1 className="mt-3 font-sans text-2xl font-bold">{l.title}</h1>
            <p className="mt-2 font-serif text-3xl font-extrabold">
              {l.kind === "want" && (
                <span className="mr-1 text-base font-medium text-muted-foreground">預算</span>
              )}
              {priceLine(l)}
            </p>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" /> {l.region}
            </p>
            <dl className="mt-5 grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
              {rows
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
            </dl>
          </div>

          <div className={cardCls}>
            <p className="text-sm text-muted-foreground">
              {owner?.role === "dealer" ? "刊登車商" : "刊登者"}
            </p>
            <p className="mt-1 text-lg font-semibold">
              <PosterName owner={owner} />
            </p>
            {owner?.role === "dealer" && (
              <p className="mt-1 text-sm">
                {owner.dealer_verified ? (
                  <span className="flex items-center gap-1 text-good">
                    <BadgeCheck className="h-4 w-4" /> 已通過管理員驗證
                  </span>
                ) : (
                  <span className="text-muted-foreground">尚未驗證的車商</span>
                )}
                {owner.tax_id && (
                  <span className="mt-1 block text-muted-foreground">
                    統一編號 <span className="font-mono">{owner.tax_id}</span>
                    （可至經濟部商工登記查詢）
                  </span>
                )}
              </p>
            )}
            {!isOwner && <Contact l={l} session={session} />}
          </div>

          <FraudNotice compact />
          {!isOwner && session && <ReportBox listingId={l.id} />}
        </aside>
      </div>

      {isOwner && l.status === "approved" && <Matches l={l} />}
    </div>
  );
}

function OwnerBar({ l }: { l: ListingFull }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-sm">
      <span>這是你的刊登</span>
      <StatusBadge status={l.status} />
      {l.status === "pending" && (
        <span className="text-muted-foreground">管理員審核通過後就會公開。</span>
      )}
      {l.review_note && <span className="text-destructive">管理員備註：{l.review_note}</span>}
      <span className="ml-auto flex gap-2">
        <Link to={`/listings/${l.id}/edit`} className={ghostBtn}>
          編輯
        </Link>
        <Link to="/my" className={ghostBtn}>
          我的刊登
        </Link>
      </span>
    </div>
  );
}

function Contact({ l, session }: { l: ListingFull; session: Session | null }) {
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (!session) {
    return (
      <Link to={signInPath(pathname)} className={`${primaryBtn} mt-5 block text-center`}>
        登入後留言聯繫
      </Link>
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("send_message", { p_listing: l.id, p_body: body });
    setBusy(false);
    if (error) {
      toast.error(errMessage(error, "訊息沒有送出，請再試一次。"));
      return;
    }
    setBody("");
    setSent(true);
    qc.invalidateQueries({ queryKey: ["threads"] });
    toast.success("訊息已送出");
  }

  const placeholder =
    l.kind === "sell"
      ? "例如：請問這台還有現車嗎？可以預約週末看車嗎？"
      : "例如：我們有這款現車，配備與價格如下，歡迎到店試乘…";

  return (
    <form onSubmit={send} className="mt-5 space-y-2">
      <textarea
        required
        rows={4}
        maxLength={2000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        className={textareaCls}
      />
      <button disabled={busy || !body.trim()} className={`${accentBtn} w-full`}>
        {busy ? "送出中…" : l.kind === "sell" ? "留言詢問" : "留言報價"}
      </button>
      {sent && (
        <Link
          to={`/messages?l=${l.id}&u=${session.user.id}`}
          className="block text-center text-sm underline underline-offset-4"
        >
          查看對話
        </Link>
      )}
    </form>
  );
}

function ReportBox({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].id);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("reports")
      .insert({ listing_id: listingId, reason, details: details.trim() || null });
    setBusy(false);
    if (error?.code === "23505") {
      setDone(true);
      {
        toast.info("你已經檢舉過這則刊登，管理員會盡快處理。");
        return;
      }
    }
    if (error) {
      toast.error(errMessage(error, "檢舉沒有送出，請再試一次。"));
      return;
    }
    setDone(true);
    toast.success("已收到檢舉，管理員會盡快查看。");
  }

  if (done)
    return <p className="text-center text-sm text-muted-foreground">已收到你的檢舉，謝謝。</p>;

  return open ? (
    <form onSubmit={submit} className="space-y-2 rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">檢舉這則刊登</p>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className={selectCls}>
        {REPORT_REASONS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        rows={3}
        maxLength={1000}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="補充說明（選填），例如對方要求先匯款的對話內容"
        className={textareaCls}
      />
      <div className="flex gap-2">
        <button disabled={busy} className={primaryBtn}>
          {busy ? "送出中…" : "送出檢舉"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>
          取消
        </button>
      </div>
    </form>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
    >
      <Flag className="h-4 w-4" /> 檢舉這則刊登
    </button>
  );
}

function Matches({ l }: { l: ListingFull }) {
  const { data = [], isLoading } = useMatches(l);
  return (
    <section>
      <h2 className="text-2xl">
        {l.kind === "want" ? "符合你需求的新車" : "可能對這台車有興趣的買家"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        依品牌與{l.kind === "want" ? "預算" : "價格"}自動配對，只有你看得到這個區塊。
      </p>
      <div className="mt-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">配對中…</p>
        ) : data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            目前還沒有符合的{l.kind === "want" ? "新車" : "需求"}，有新的刊登時再回來看看。
          </div>
        ) : (
          <ListingGrid items={data} />
        )}
      </div>
    </section>
  );
}
