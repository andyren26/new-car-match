import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import PageShell, { PageTitle } from "@/components/PageShell";
import { FraudNotice } from "@/components/ListingBits";
import { supabase } from "@/integrations/supabase/client";
import { useHead } from "@/hooks/use-head";
import { errMessage } from "@/lib/errors";
import { publicName, type Session } from "@/lib/profile";
import { SITE_NAME } from "@/lib/site";
import { accentBtn, textareaCls } from "@/lib/ui";

type Person = {
  id: string;
  role: string;
  display_name: string | null;
  company_name: string | null;
};
type Msg = {
  id: string;
  listing_id: string;
  thread_user_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  listing: { id: string; title: string; kind: string; owner_id: string; status: string } | null;
  sender: Person | null;
  recipient: Person | null;
};

type Thread = {
  key: string;
  listingId: string;
  threadUser: string;
  listing: Msg["listing"];
  other: Person | null;
  messages: Msg[];
  unread: number;
  last: Msg;
};

const SELECT =
  "*, listing:listings(id, title, kind, owner_id, status), sender:profiles!messages_sender_id_fkey(id, role, display_name, company_name), recipient:profiles!messages_recipient_id_fkey(id, role, display_name, company_name)";

const time = (iso: string) =>
  new Date(iso).toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function Messages() {
  useHead([{ title: `訊息 — ${SITE_NAME}` }]);
  const session = useLoaderData() as Session;
  const me = session.user.id;
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ["threads", me],
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(SELECT)
        .or(`sender_id.eq.${me},recipient_id.eq.${me}`)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data as unknown as Msg[];
    },
  });

  const threads = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const m of msgs) {
      const key = `${m.listing_id}:${m.thread_user_id}`;
      const other = m.sender_id === me ? m.recipient : m.sender;
      const t = map.get(key) ?? {
        key,
        listingId: m.listing_id,
        threadUser: m.thread_user_id,
        listing: m.listing,
        other,
        messages: [],
        unread: 0,
        last: m,
      };
      t.messages.push(m);
      t.last = m;
      if (m.recipient_id === me && !m.read_at) t.unread++;
      map.set(key, t);
    }
    return [...map.values()].sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  }, [msgs, me]);

  const selectedKey =
    params.get("l") && params.get("u") ? `${params.get("l")}:${params.get("u")}` : threads[0]?.key;
  const current = threads.find((t) => t.key === selectedKey) ?? null;

  // Opening a thread marks what the other side sent as read.
  useEffect(() => {
    if (!current || current.unread === 0) return;
    supabase
      .rpc("mark_thread_read", { p_listing: current.listingId, p_thread_user: current.threadUser })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["threads", me] });
        qc.invalidateQueries({ queryKey: ["unread", me] });
      });
  }, [current?.key, current?.unread, me, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell profile={session.profile}>
      <PageTitle eyebrow="Messages" title="訊息" />
      {isLoading ? (
        <div className="mt-8 h-80 animate-pulse rounded-xl bg-secondary" />
      ) : threads.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          還沒有對話。到{" "}
          <Link to="/cars" className="underline">
            找新車
          </Link>{" "}
          或{" "}
          <Link to="/wanted" className="underline">
            購車需求
          </Link>{" "}
          留言，就會出現在這裡。
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-[18rem_1fr]">
          <ul className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border bg-card p-2">
            {threads.map((t) => (
              <li key={t.key}>
                <button
                  onClick={() => setParams({ l: t.listingId, u: t.threadUser }, { replace: true })}
                  className={`w-full rounded-lg p-3 text-left text-sm transition ${t.key === current?.key ? "bg-secondary" : "hover:bg-secondary/60"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{publicName(t.other)}</span>
                    {t.unread > 0 && (
                      <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
                        {t.unread}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.listing?.title ?? "已下架的刊登"}
                  </span>
                  <span className="mt-1 block truncate text-xs">{t.last.body}</span>
                </button>
              </li>
            ))}
          </ul>
          {current ? <ThreadView t={current} me={me} /> : <div />}
        </div>
      )}
    </PageShell>
  );
}

function ThreadView({ t, me }: { t: Thread; me: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const iAmOwner = t.listing?.owner_id === me;
  const canReply = iAmOwner || t.listing?.status === "approved";

  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [t.key, t.messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("send_message", {
      p_listing: t.listingId,
      p_body: body,
      ...(iAmOwner ? { p_to: t.threadUser } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(errMessage(error, "訊息沒有送出"));
      return;
    }
    setBody("");
    qc.invalidateQueries({ queryKey: ["threads", me] });
  }

  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <header className="border-b p-4">
        <p className="font-semibold">{publicName(t.other)}</p>
        {t.listing && (
          <Link
            to={`/listings/${t.listing.id}`}
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            {t.listing.title}
          </Link>
        )}
      </header>
      <div className="max-h-[55vh] flex-1 space-y-3 overflow-y-auto p-4">
        {t.messages.map((m) => {
          const mine = m.sender_id === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3.5 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-1 text-[11px] ${mine ? "opacity-70" : "text-muted-foreground"}`}>
                  {time(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="space-y-3 border-t p-4">
        {canReply ? (
          <form onSubmit={send} className="flex gap-2">
            <textarea
              rows={2}
              required
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="輸入訊息…"
              className={textareaCls}
            />
            <button disabled={busy || !body.trim()} className={`${accentBtn} shrink-0 self-end`}>
              送出
            </button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">這則刊登已下架或結束，無法再留言。</p>
        )}
        <FraudNotice compact />
      </div>
    </section>
  );
}
