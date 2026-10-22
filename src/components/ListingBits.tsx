import { Link } from "react-router";
import { BadgeCheck, CarFront, MapPin, ShieldAlert } from "lucide-react";

import {
  KIND_LABEL,
  STATUS_LABEL,
  photoUrl,
  priceLine,
  sortedPhotos,
  type Kind,
  type ListingFull,
  type ListingOwner,
} from "@/lib/cars";
import { publicName } from "@/lib/profile";
import { ANTI_FRAUD_HOTLINE } from "@/lib/site";

export function KindBadge({ kind }: { kind: string }) {
  const sell = kind === "sell";
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${sell ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}
    >
      {KIND_LABEL[kind as Kind] ?? kind}
    </span>
  );
}

const STATUS_CLS: Record<string, string> = {
  pending: "bg-accent/40 text-accent-foreground",
  approved: "bg-good/15 text-good",
  rejected: "bg-destructive/10 text-destructive",
  closed: "bg-secondary text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLS[status] ?? ""}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PosterName({ owner }: { owner: ListingOwner | null }) {
  return (
    <span className="inline-flex items-center gap-1">
      {publicName(owner)}
      {owner?.role === "dealer" && owner.dealer_verified && (
        <BadgeCheck className="h-4 w-4 text-good" aria-label="已驗證車商" />
      )}
    </span>
  );
}

export function ListingCard({ l }: { l: ListingFull }) {
  const photo = sortedPhotos(l)[0];
  return (
    <Link
      to={`/listings/${l.id}`}
      className="lift block h-full overflow-hidden rounded-xl border bg-card"
    >
      {photo ? (
        <img
          src={photoUrl(photo.storage_path)}
          alt={l.title}
          className="aspect-[4/3] w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-sand">
          <CarFront className="h-12 w-12 text-muted-foreground/50" />
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <KindBadge kind={l.kind} />
          <span className="text-xs text-muted-foreground">
            {l.brand} {l.model_year ? `· ${l.model_year}` : ""}
          </span>
        </div>
        <h3 className="line-clamp-2 font-sans text-base font-semibold">{l.title}</h3>
        <p className="font-serif text-2xl font-extrabold">
          {l.kind === "want" && (
            <span className="mr-1 text-sm font-medium text-muted-foreground">預算</span>
          )}
          {priceLine(l)}
        </p>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {l.region}
          </span>
          <PosterName owner={l.owner} />
        </div>
      </div>
    </Link>
  );
}

export function ListingGrid({ items }: { items: ListingFull[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((l) => (
        <li key={l.id}>
          <ListingCard l={l} />
        </li>
      ))}
    </ul>
  );
}

export function GridSkeleton({ n = 4 }: { n?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-80 animate-pulse rounded-xl bg-secondary" />
      ))}
    </div>
  );
}

// Shown next to every contact point: the scams this kind of site attracts.
export function FraudNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border border-accent bg-accent/15 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <ShieldAlert className="h-4 w-4" />
        防詐提醒
      </p>
      <ul className={`mt-2 list-disc space-y-1 pl-5 ${compact ? "text-xs" : ""}`}>
        <li>看車、簽約前，不要先匯任何訂金或「保留金」。</li>
        <li>到車商實體據點看車，並用統一編號查詢公司登記。</li>
        <li>對方要求改用私人通訊軟體、催促付款，都是常見詐騙手法。</li>
        <li>本平台不會向你收費，也不會代收款項。</li>
      </ul>
      {!compact && (
        <p className="mt-2 text-xs text-muted-foreground">
          覺得可疑？按「檢舉」通知管理員，或撥打 {ANTI_FRAUD_HOTLINE} 反詐騙諮詢專線。
        </p>
      )}
    </div>
  );
}
