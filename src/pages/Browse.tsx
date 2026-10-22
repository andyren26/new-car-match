import { useEffect, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { Search } from "lucide-react";

import PageShell, { PageTitle } from "@/components/PageShell";
import { GridSkeleton, ListingGrid } from "@/components/ListingBits";
import { useHead } from "@/hooks/use-head";
import { BRANDS, REGIONS, useBrowse, type Kind } from "@/lib/cars";
import type { Session } from "@/lib/profile";
import { SITE_NAME } from "@/lib/site";

const COPY: Record<Kind, { eyebrow: string; title: string; desc: string; cta: string }> = {
  sell: {
    eyebrow: "Dealer listings",
    title: "找新車",
    desc: "車商刊登的新車與可訂車款，看到喜歡的直接站內留言詢問。",
    cta: "找不到想要的？刊登你的購車需求，讓車商主動報價",
  },
  want: {
    eyebrow: "Buyer requests",
    title: "購車需求",
    desc: "買家想買的車款與預算。車商可以直接留言報價。",
    cta: "我是車商，免費刊登新車",
  },
};

const PRICE_CAPS = [600000, 800000, 1000000, 1500000, 2000000, 3000000];

export default function Browse({ kind }: { kind: Kind }) {
  const c = COPY[kind];
  useHead([{ title: `${c.title} — ${SITE_NAME}` }, { name: "description", content: c.desc }]);
  const session = useLoaderData() as Session | null;
  const [params, setParams] = useSearchParams();
  const brand = params.get("brand") ?? "";
  const region = params.get("region") ?? "";
  const maxPrice = Number(params.get("max")) || undefined;
  const q = params.get("q") ?? "";
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const { data = [], isLoading, error } = useBrowse({ kind, brand, region, maxPrice, q });

  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const sel = "rounded-md border bg-card px-3 py-2.5 text-sm outline-none focus:border-ring";

  return (
    <PageShell profile={session?.profile ?? null}>
      <PageTitle eyebrow={c.eyebrow} title={c.title}>
        <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
        <form
          className="mt-6 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", text.trim());
          }}
        >
          <label className="flex min-w-60 flex-1 items-center gap-2 rounded-md border bg-card px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="車型、關鍵字，例如 RAV4 油電"
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              aria-label="搜尋"
            />
          </label>
          <select
            aria-label="品牌"
            value={brand}
            onChange={(e) => set("brand", e.target.value)}
            className={sel}
          >
            <option value="">全部品牌</option>
            {BRANDS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select
            aria-label="地區"
            value={region}
            onChange={(e) => set("region", e.target.value)}
            className={sel}
          >
            <option value="">全部地區</option>
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          {kind === "sell" && (
            <select
              aria-label="價格上限"
              value={maxPrice ?? ""}
              onChange={(e) => set("max", e.target.value)}
              className={sel}
            >
              <option value="">不限價格</option>
              {PRICE_CAPS.map((p) => (
                <option key={p} value={p}>
                  {p / 10000} 萬以內
                </option>
              ))}
            </select>
          )}
          <button className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
            搜尋
          </button>
        </form>
      </PageTitle>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {isLoading ? "載入中…" : `${data.length} 則`}
          </span>
          <Link to="/post" className="text-sm underline underline-offset-4">
            {c.cta}
          </Link>
        </div>
        {error ? (
          <p className="text-sm text-destructive">暫時無法載入，請稍後再試。</p>
        ) : isLoading ? (
          <GridSkeleton n={8} />
        ) : data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
            {brand || region || maxPrice || q
              ? "沒有符合條件的刊登，換個條件試試。"
              : "目前還沒有刊登。"}
          </div>
        ) : (
          <ListingGrid items={data} />
        )}
      </section>
    </PageShell>
  );
}
