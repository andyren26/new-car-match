-- =============================================================================
-- Match notifications by email
--
--   * dealer's car approved   -> email buyers whose approved request fits it
--   * buyer's request approved -> email dealers with an approved car that fits it
--
-- Matches are queued when the admin APPROVES a listing (never on submit, so a
-- fake ad caught in review never reaches anyone's inbox). The send-match-emails
-- Edge Function, run by pg_cron every 15 minutes, groups the queue into one
-- digest per listing and sends at most one email per listing per day.
-- Members can switch notifications off on the account page or with the
-- unsubscribe link in every email.
-- =============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- -----------------------------------------------------------------------------
-- Per-member settings. Kept out of profiles because profiles is public and the
-- unsubscribe token must stay private.
-- -----------------------------------------------------------------------------
create table public.notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_matches boolean not null default true,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

create policy "notification_settings_own" on public.notification_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notification_settings_update_own" on public.notification_settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notification_settings from anon, authenticated;
grant select (user_id, email_matches, updated_at) on public.notification_settings to authenticated;
grant update (email_matches) on public.notification_settings to authenticated;

create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

insert into public.notification_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.profiles_create_notification_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.profiles_create_notification_settings() from public, anon, authenticated;

create trigger profiles_create_notification_settings
  after insert on public.profiles
  for each row execute function public.profiles_create_notification_settings();

-- One-click unsubscribe from the link in an email (no sign-in needed; the
-- random token is the proof).
create or replace function public.unsubscribe_matches(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_settings
     set email_matches = false
   where unsubscribe_token = p_token;
  return found;
end;
$$;

revoke execute on function public.unsubscribe_matches(uuid) from public;
grant execute on function public.unsubscribe_matches(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Queue: "tell the owner of recipient_listing about matched_listing".
-- The unique pair means re-approving after an edit never repeats an email.
-- -----------------------------------------------------------------------------
create table public.match_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_listing_id uuid not null references public.listings(id) on delete cascade,
  matched_listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  unique (recipient_listing_id, matched_listing_id)
);

create index match_notifications_pending_idx
  on public.match_notifications (recipient_listing_id) where sent_at is null;

alter table public.match_notifications enable row level security;
-- No policies: only the service role (Edge Function) and admin SQL touch it.
revoke all on public.match_notifications from anon, authenticated;

alter table public.listings add column if not exists last_notified_at timestamptz;

-- Stricter than the on-site match list (which is brand-only): an email goes out
-- only for the same brand AND model (either model name contains the other,
-- ignoring case and spaces, so "RAV4" matches "RAV4 HEV"), with the car's
-- price inside the buyer's budget (10% grace below the minimum).
create or replace function public.listings_match(sell public.listings, want public.listings)
returns boolean
language sql
immutable
set search_path = public
as $$
  select sell.kind = 'sell' and want.kind = 'want'
     and lower(sell.brand) = lower(want.brand)
     and (strpos(lower(replace(sell.model, ' ', '')), lower(replace(want.model, ' ', ''))) > 0
          or strpos(lower(replace(want.model, ' ', '')), lower(replace(sell.model, ' ', ''))) > 0)
     and sell.owner_id <> want.owner_id
     and sell.price <= want.budget_max
     and (want.budget_min is null or sell.price >= floor(want.budget_min * 0.9));
$$;

revoke execute on function public.listings_match(public.listings, public.listings) from public, anon, authenticated;

create or replace function public.enqueue_matches(p_listing uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.listings%rowtype;
  n int;
begin
  select * into l from public.listings where id = p_listing and status = 'approved';
  if not found then return 0; end if;

  insert into public.match_notifications (recipient_listing_id, matched_listing_id)
  select o.id, l.id
    from public.listings o
    join public.notification_settings ns on ns.user_id = o.owner_id and ns.email_matches
   where o.status = 'approved'
     and o.kind <> l.kind
     and case when l.kind = 'sell' then public.listings_match(l, o)
              else public.listings_match(o, l) end
  on conflict (recipient_listing_id, matched_listing_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.enqueue_matches(uuid) from public, anon, authenticated;

-- Queue matches whenever a listing becomes approved (admin review, or an
-- admin's own listing).
create or replace function public.listings_after_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.enqueue_matches(new.id);
  end if;
  return null;
end;
$$;

revoke execute on function public.listings_after_approve() from public, anon, authenticated;

create trigger listings_after_approve
  after insert or update of status on public.listings
  for each row execute function public.listings_after_approve();

-- -----------------------------------------------------------------------------
-- Batch for the Edge Function (service role only). Picks listings whose owner
-- hasn't been emailed about them in the last day, drops anything no longer
-- live, marks the rows claimed and returns one digest per recipient listing.
-- Rows claimed but not sent within 30 minutes (a failed send) are retried.
-- -----------------------------------------------------------------------------
create or replace function public.claim_match_digests(p_limit int default 50)
returns table (
  recipient_listing_id uuid,
  email text,
  name text,
  kind text,
  listing_title text,
  unsubscribe_token uuid,
  matches jsonb,
  notification_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Drop queued items whose listings are gone from public view or whose
  -- owner switched notifications off.
  update public.match_notifications mn
     set sent_at = now()
   where mn.sent_at is null
     and not exists (
       select 1
         from public.listings r
         join public.listings m on m.id = mn.matched_listing_id
         join public.notification_settings ns on ns.user_id = r.owner_id
        where r.id = mn.recipient_listing_id
          and r.status = 'approved' and m.status = 'approved' and ns.email_matches
     );

  return query
  with due as (
    select r.id
      from public.listings r
     where exists (select 1 from public.match_notifications mn
                    where mn.recipient_listing_id = r.id and mn.sent_at is null
                      and (mn.claimed_at is null or mn.claimed_at < now() - interval '30 minutes'))
       and (r.last_notified_at is null or r.last_notified_at < now() - interval '1 day')
     order by r.id
     limit p_limit
     for update skip locked
  ),
  claimed as (
    update public.match_notifications mn
       set claimed_at = now()
      from due
     where mn.recipient_listing_id = due.id and mn.sent_at is null
    returning mn.id, mn.recipient_listing_id, mn.matched_listing_id
  )
  select r.id,
         u.email::text,
         case when p.role = 'dealer' then coalesce(p.company_name, p.display_name, '車商')
              else coalesce(p.display_name, '會員') end,
         r.kind,
         r.title,
         ns.unsubscribe_token,
         jsonb_agg(jsonb_build_object(
           'id', m.id, 'title', m.title, 'brand', m.brand, 'model', m.model,
           'model_year', m.model_year, 'price', m.price, 'budget_min', m.budget_min,
           'budget_max', m.budget_max, 'region', m.region,
           'poster', case when mp.role = 'dealer'
                          then coalesce(mp.company_name, '車商') else coalesce(mp.display_name, '買家') end,
           'verified', mp.dealer_verified
         ) order by m.approved_at desc),
         array_agg(c.id)
    from claimed c
    join public.listings r on r.id = c.recipient_listing_id
    join public.listings m on m.id = c.matched_listing_id
    join public.profiles p on p.id = r.owner_id
    join public.profiles mp on mp.id = m.owner_id
    join public.notification_settings ns on ns.user_id = r.owner_id
    join auth.users u on u.id = r.owner_id
   where u.email is not null
   group by r.id, u.email, p.role, p.company_name, p.display_name, r.kind, r.title, ns.unsubscribe_token;
end;
$$;

revoke execute on function public.claim_match_digests(int) from public, anon, authenticated;
grant execute on function public.claim_match_digests(int) to service_role;

create or replace function public.mark_match_digest_sent(p_recipient_listing uuid, p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.match_notifications set sent_at = now() where id = any(p_ids);
  update public.listings set last_notified_at = now() where id = p_recipient_listing;
$$;

revoke execute on function public.mark_match_digest_sent(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_match_digest_sent(uuid, uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- Schedule (run once per project after deploying supabase/functions/
-- send-match-emails and storing the Resend key in Vault as 'resend_api_key'):
--
--   select cron.schedule('send-match-emails', '*/15 * * * *', $$
--     select net.http_post(
--       url := 'https://<project-ref>.supabase.co/functions/v1/send-match-emails',
--       headers := '{"Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb,
--       timeout_milliseconds := 60000)
--   $$);
-- -----------------------------------------------------------------------------

-- The Resend API key lives in Supabase Vault (secret name 'resend_api_key');
-- only the service role (the Edge Function) can read it.
create or replace function public.get_resend_api_key()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
$$;

revoke execute on function public.get_resend_api_key() from public, anon, authenticated;
grant execute on function public.get_resend_api_key() to service_role;
