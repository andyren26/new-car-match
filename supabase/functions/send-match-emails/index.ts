// send-match-emails — run by pg_cron every 15 minutes.
//
// Claims queued matches (public.claim_match_digests groups them into one digest
// per listing, at most one per listing per day) and emails each listing owner
// through Resend. A digest is marked sent only after Resend accepts it; a
// failed send is retried on a later run.
//
// Calling it early is harmless: it only sends what is already due. The Resend
// key is read from Supabase Vault ('resend_api_key') through a service-role-only
// RPC, so it never sits in this code or the browser bundle.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://car.valuetrack66.com";
const FROM = "新車媒合 <notify@mail.valuetrack66.com>";

type Match = {
  id: string;
  title: string;
  brand: string;
  model: string;
  model_year: number | null;
  price: number | null;
  budget_min: number | null;
  budget_max: number | null;
  region: string;
  poster: string;
  verified: boolean;
};

type Digest = {
  recipient_listing_id: string;
  email: string;
  name: string;
  kind: "sell" | "want";
  listing_title: string;
  unsubscribe_token: string;
  matches: Match[];
  notification_ids: string[];
};

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const wan = (n: number | null) => {
  if (n == null) return "—";
  const w = n / 10000;
  return `${Number.isInteger(w) ? w : w.toFixed(1)} 萬`;
};

const priceText = (m: Match) =>
  m.price != null
    ? wan(m.price)
    : m.budget_min
      ? `預算 ${wan(m.budget_min)} – ${wan(m.budget_max)}`
      : `預算 ${wan(m.budget_max)} 以內`;

function render(d: Digest) {
  const n = d.matches.length;
  const forBuyer = d.kind === "want";
  const subject = forBuyer
    ? `有 ${n} 台新車符合你的需求：${d.listing_title}`
    : `有 ${n} 位買家在找你刊登的車：${d.listing_title}`;
  const intro = forBuyer
    ? `你刊登的購車需求「${d.listing_title}」，有車商刊登了符合的新車：`
    : `你刊登的「${d.listing_title}」，有買家的購車需求符合：`;
  const unsub = `${SITE}/unsubscribe?t=${d.unsubscribe_token}`;

  const rows = d.matches
    .map((m) => {
      const url = `${SITE}/listings/${m.id}`;
      const meta = [`${m.brand} ${m.model}`, m.model_year ? `${m.model_year} 年式` : "", m.region]
        .filter(Boolean)
        .join(" · ");
      const who = `${esc(m.poster)}${m.verified ? "（已驗證車商）" : ""}`;
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #e5e7eb">
        <a href="${url}" style="font-size:16px;font-weight:600;color:#111827;text-decoration:none">${esc(m.title)}</a>
        <div style="margin-top:4px;font-size:18px;font-weight:700;color:#111827">${esc(priceText(m))}</div>
        <div style="margin-top:2px;font-size:13px;color:#6b7280">${esc(meta)}｜${who}</div>
        <a href="${url}" style="display:inline-block;margin-top:8px;font-size:13px;color:#1d4ed8">查看並站內留言 →</a>
      </td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;padding:28px">
    <tr><td style="font-size:20px;font-weight:800;color:#111827">新車媒合</td></tr>
    <tr><td style="padding-top:16px;font-size:15px;color:#111827">${esc(d.name)} 您好，</td></tr>
    <tr><td style="padding-top:8px;font-size:15px;color:#111827">${esc(intro)}</td></tr>
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
    <tr><td style="padding-top:18px;font-size:13px;color:#92400e;background:#fffbeb;border-radius:8px;padding:12px 14px">
      防詐提醒：看車、簽約前請勿先匯任何訂金。本平台不收費、不代收款項。遇到可疑情況請在刊登頁按「檢舉」，或撥打 165 反詐騙專線。
    </td></tr>
    <tr><td style="padding-top:18px;font-size:12px;color:#6b7280">
      你會收到這封信，是因為你在新車媒合刊登了「${esc(d.listing_title)}」並開啟了配對通知。每則刊登每天最多通知一次。<br>
      <a href="${unsub}" style="color:#6b7280">取消配對通知</a>｜<a href="${SITE}/account" style="color:#6b7280">通知設定</a>
    </td></tr>
  </table></td></tr></table></body></html>`;

  const text = [
    `${d.name} 您好，`,
    "",
    intro,
    "",
    ...d.matches.map(
      (m) => `・${m.title}｜${priceText(m)}｜${m.region}｜${m.poster}\n  ${SITE}/listings/${m.id}`,
    ),
    "",
    "防詐提醒：看車、簽約前請勿先匯任何訂金。本平台不收費、不代收款項。",
    "",
    `取消配對通知：${unsub}`,
  ].join("\n");

  return { subject, html, text, unsub };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: key, error: keyErr } = await supabase.rpc("get_resend_api_key");
  if (keyErr || !key) {
    console.error("resend key missing", keyErr);
    return Response.json({ error: "resend key missing" }, { status: 500 });
  }

  const { data, error } = await supabase.rpc("claim_match_digests", { p_limit: 50 });
  if (error) {
    console.error("claim failed", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const digests = (data ?? []) as Digest[];
  let sent = 0;
  const failed: string[] = [];

  for (const d of digests) {
    const { subject, html, text, unsub } = render(d);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [d.email],
        subject,
        html,
        text,
        headers: { "List-Unsubscribe": `<${unsub}>` },
      }),
    });
    if (res.ok) {
      const { error: markErr } = await supabase.rpc("mark_match_digest_sent", {
        p_recipient_listing: d.recipient_listing_id,
        p_ids: d.notification_ids,
      });
      if (markErr) console.error("mark failed", d.recipient_listing_id, markErr);
      sent++;
    } else {
      console.error("resend failed", d.recipient_listing_id, res.status, await res.text());
      failed.push(d.recipient_listing_id);
    }
    await sleep(600); // stay under Resend's default 2 requests/second
  }

  return Response.json({ claimed: digests.length, sent, failed: failed.length });
});
