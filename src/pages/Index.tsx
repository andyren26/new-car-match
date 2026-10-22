import { Link, useLoaderData } from "react-router";
import { ArrowRight, BadgeCheck, Ban, MessageSquareText, ShieldCheck } from "lucide-react";

import PageShell from "@/components/PageShell";
import { FraudNotice, GridSkeleton, ListingGrid } from "@/components/ListingBits";
import { useHead } from "@/hooks/use-head";
import { useBrowse } from "@/lib/cars";
import type { Session } from "@/lib/profile";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

const head = [
  { title: `${SITE_NAME} — ${SITE_TAGLINE}` },
  {
    name: "description",
    content: "車商刊登新車、買家刊登購車需求，站內留言直接聯繫。平台不收任何費用、不經手款項。",
  },
  { property: "og:title", content: `${SITE_NAME} — ${SITE_TAGLINE}` },
  { property: "og:type", content: "website" },
  { name: "twitter:card", content: "summary" },
];

const promises = [
  { icon: Ban, title: "完全免費", text: "刊登、留言、配對都不收費，也不抽成。" },
  { icon: ShieldCheck, title: "人工審核", text: "每則刊登經管理員審核後才會公開。" },
  { icon: MessageSquareText, title: "站內留言", text: "不公開電話，談妥了再交換聯絡方式。" },
  { icon: BadgeCheck, title: "車商驗證", text: "提供統一編號的車商可申請驗證標章。" },
];

const steps = [
  ["註冊帳號", "選擇「我要買車」或「我是車商」，同意條款即可開始。"],
  ["刊登", "買家寫下想要的車款與預算；車商刊登現車或可訂車款與售價。"],
  ["配對與聯繫", "系統列出條件相符的對象，雙方用站內留言談細節。"],
  ["線下交易", "到車商據點看車、簽約，款項由雙方自行處理，平台不經手。"],
];

export default function Index() {
  useHead(head);
  const session = useLoaderData() as Session | null;
  const cars = useBrowse({ kind: "sell" });
  const wants = useBrowse({ kind: "want" });

  return (
    <PageShell profile={session?.profile ?? null}>
      <section className="hem overflow-hidden rounded-xl bg-cream px-6 py-12 sm:px-10 md:py-16">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          New car matching · Free
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-6xl">
          買新車，
          <br />
          讓車商來找你。
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground">
          {SITE_TAGLINE}。平台只做資訊媒合，不收費、不經手款項、不參與交易。
        </p>
        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
          <Link to="/post" className="group rounded-lg bg-primary p-5 text-primary-foreground">
            <span className="text-sm opacity-80">我要買車</span>
            <span className="mt-1 flex items-center justify-between text-xl font-bold">
              刊登購車需求 <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </span>
          </Link>
          <Link to="/wanted" className="group rounded-lg border bg-card p-5">
            <span className="text-sm text-muted-foreground">我是車商／業務</span>
            <span className="mt-1 flex items-center justify-between text-xl font-bold">
              看買家需求 <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {promises.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <Icon className="h-5 w-5" />
            <p className="mt-3 font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>

      <Shelf
        title="最新購車需求"
        to="/wanted"
        q={wants}
        empty="還沒有購車需求，成為第一個刊登的人吧。"
      />
      <Shelf title="最新上架新車" to="/cars" q={cars} empty="還沒有車商刊登，歡迎車商免費刊登。" />

      <section className="mt-16 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="text-3xl">怎麼運作</h2>
          <ol className="mt-6 space-y-4">
            {steps.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-sm text-primary-foreground">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{t}</p>
                  <p className="text-sm text-muted-foreground">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="self-start">
          <FraudNotice />
        </div>
      </section>
    </PageShell>
  );
}

function Shelf({
  title,
  to,
  q,
  empty,
}: {
  title: string;
  to: string;
  q: ReturnType<typeof useBrowse>;
  empty: string;
}) {
  const items = (q.data ?? []).slice(0, 4);
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="text-3xl">{title}</h2>
        <Link to={to} className="text-sm text-muted-foreground hover:text-foreground">
          看全部 →
        </Link>
      </div>
      {q.isLoading ? (
        <GridSkeleton />
      ) : q.error ? (
        <p className="text-sm text-destructive">暫時無法載入，請稍後再試。</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <ListingGrid items={items} />
      )}
    </section>
  );
}
