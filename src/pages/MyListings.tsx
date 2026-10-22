import { Link, useLoaderData } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CarFront } from "lucide-react";
import { toast } from "sonner";

import ConfirmButton from "@/components/ConfirmButton";
import PageShell, { PageTitle } from "@/components/PageShell";
import { KindBadge, StatusBadge } from "@/components/ListingBits";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import {
  LISTING_SELECT,
  PHOTO_BUCKET,
  photoUrl,
  priceLine,
  sortedPhotos,
  type ListingFull,
} from "@/lib/cars";
import { errMessage } from "@/lib/errors";
import type { Session } from "@/lib/profile";
import { SITE_NAME } from "@/lib/site";
import { accentBtn, ghostBtn } from "@/lib/ui";

export default function MyListings() {
  useHead([{ title: `我的刊登 — ${SITE_NAME}` }]);
  const session = useLoaderData() as Session;
  const qc = useQueryClient();
  const key = ["my-listings", session.user.id];

  const { data = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(LISTING_SELECT)
        .eq("owner_id", session.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ListingFull[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  async function setClosed(l: ListingFull, closed: boolean) {
    const { error } = await supabase.rpc("set_listing_closed", { p_id: l.id, p_closed: closed });
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    toast.success(closed ? "已結束這則刊登" : "已重新送審");
    refresh();
  }

  async function remove(l: ListingFull) {
    const paths = (l.listing_photos ?? []).map((p) => p.storage_path);
    if (paths.length) await supabase.storage.from(PHOTO_BUCKET).remove(paths);
    const { error } = await supabase.from("listings").delete().eq("id", l.id);
    if (error) {
      toast.error(errMessage(error));
      return;
    }
    toast.success("已刪除");
    refresh();
  }

  return (
    <PageShell profile={session.profile}>
      <PageTitle eyebrow="My listings" title="我的刊登">
        <Link to="/post" className={`${accentBtn} mt-5 inline-block`}>
          {session.profile.role === "dealer" ? "＋ 刊登新車" : "＋ 刊登購車需求"}
        </Link>
      </PageTitle>

      <section className="mt-8 space-y-3">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-secondary" />
        ) : data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
            你還沒有任何刊登。
          </div>
        ) : (
          data.map((l) => {
            const photo = sortedPhotos(l)[0];
            return (
              <article
                key={l.id}
                className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row"
              >
                <Link to={`/listings/${l.id}`} className="shrink-0">
                  {photo ? (
                    <img
                      src={photoUrl(photo.storage_path)}
                      alt=""
                      className="h-24 w-36 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-24 w-36 items-center justify-center rounded-md bg-sand">
                      <CarFront className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}
                </Link>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={l.kind} />
                    <StatusBadge status={l.status} />
                  </div>
                  <Link
                    to={`/listings/${l.id}`}
                    className="block truncate font-semibold hover:underline"
                  >
                    {l.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {priceLine(l)} · {l.region}
                  </p>
                  {l.review_note && (
                    <p className="text-sm text-destructive">管理員備註：{l.review_note}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-2 sm:flex-col sm:items-end">
                  <Link to={`/listings/${l.id}/edit`} className={ghostBtn}>
                    編輯
                  </Link>
                  {(l.status === "approved" || l.status === "pending") && (
                    <button onClick={() => setClosed(l, true)} className={ghostBtn}>
                      {l.kind === "sell" ? "已售出／結束" : "已找到車／結束"}
                    </button>
                  )}
                  {l.status === "closed" && (
                    <button onClick={() => setClosed(l, false)} className={ghostBtn}>
                      重新開啟
                    </button>
                  )}
                  <ConfirmButton
                    label="刪除"
                    confirmLabel="確定刪除？"
                    onConfirm={async () => {
                      await remove(l);
                    }}
                  />
                </div>
              </article>
            );
          })
        )}
      </section>
    </PageShell>
  );
}
