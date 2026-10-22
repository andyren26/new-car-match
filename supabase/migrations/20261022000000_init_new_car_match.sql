-- =============================================================================
-- 新車媒合平台 — initial schema
--
-- The platform only matches people: dealers post cars for sale, buyers post
-- what they want. No payments, no fees, no part in the transaction.
--
-- Anti-fraud design:
--   * every listing starts as 'pending' and is public only once an admin
--     approves it; editing an approved listing sends it back to review
--   * buyers and dealers talk through on-site messages (no phone numbers shown)
--   * anyone signed in can report a listing; 3 open reports pull it off the
--     site until an admin looks at it
--   * dealers give a company name (+ optional 統一編號) and can be marked
--     verified by an admin
--   * nobody can post until they have agreed to the terms + privacy policy
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: one row per auth user. Every column here is safe to show publicly
-- (the email stays in auth.users), so listings can show who posted them.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'buyer' check (role in ('buyer', 'dealer', 'admin')),
  display_name text check (display_name is null or char_length(display_name) <= 40),
  company_name text check (company_name is null or char_length(company_name) <= 60),
  tax_id text check (tax_id is null or tax_id ~ '^[0-9]{8}$'),
  dealer_verified boolean not null default false,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- anon needs it too: public read policies call it (it is simply false for visitors).
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create policy "profiles_select_public" on public.profiles
  for select to anon, authenticated using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke insert, update, delete on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
-- role / dealer_verified / terms_* are changed only through the functions below.
grant update (display_name, company_name, tax_id) on public.profiles to authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- A dealer who changes the company name or 統編 loses the verified badge until
-- an admin checks again.
create or replace function public.profiles_reset_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.dealer_verified
     and (new.company_name is distinct from old.company_name
          or new.tax_id is distinct from old.tax_id)
     and not public.is_admin() then
    new.dealer_verified = false;
  end if;
  return new;
end;
$$;

create trigger profiles_reset_verification
  before update on public.profiles
  for each row execute function public.profiles_reset_verification();

-- New sign-up -> profiles row. Sign-up metadata is client-controlled, so only
-- 'buyer' / 'dealer' are accepted (admins are promoted by hand), and terms are
-- recorded only when the form sent the version the user ticked.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := case when meta->>'role' = 'dealer' then 'dealer' else 'buyer' end;
  tid text := nullif(trim(meta->>'tax_id'), '');
begin
  insert into public.profiles (id, role, display_name, company_name, tax_id,
                               terms_version, terms_accepted_at)
  values (
    new.id,
    r,
    left(nullif(trim(coalesce(meta->>'display_name', meta->>'full_name', meta->>'name')), ''), 40),
    case when r = 'dealer' then left(nullif(trim(meta->>'company_name'), ''), 60) end,
    case when r = 'dealer' and tid ~ '^[0-9]{8}$' then tid end,
    nullif(meta->>'terms_version', ''),
    case when nullif(meta->>'terms_version', '') is not null then now() end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Agree to the current terms + privacy policy (used after social sign-in, or
-- when the terms version changes).
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception '缺少條款版本'; end if;
  update public.profiles
     set terms_version = p_version, terms_accepted_at = now()
   where id = auth.uid();
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- Buyer -> dealer (e.g. someone who signed up with Google and is a car dealer).
create or replace function public.become_dealer(p_company_name text, p_tax_id text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tid text := nullif(trim(p_tax_id), '');
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if coalesce(trim(p_company_name), '') = '' then raise exception '請填寫公司或車行名稱'; end if;
  if tid is not null and tid !~ '^[0-9]{8}$' then raise exception '統一編號需為 8 位數字'; end if;
  update public.profiles
     set role = 'dealer', company_name = left(trim(p_company_name), 60), tax_id = tid,
         dealer_verified = false
   where id = auth.uid() and role = 'buyer';
  if not found then raise exception '只有買家帳號可以改成車商'; end if;
end;
$$;

revoke execute on function public.become_dealer(text, text) from public, anon;
grant execute on function public.become_dealer(text, text) to authenticated;

create or replace function public.set_dealer_verified(p_user uuid, p_verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理員可以驗證車商'; end if;
  update public.profiles set dealer_verified = p_verified where id = p_user and role = 'dealer';
  if not found then raise exception '找不到這個車商帳號'; end if;
end;
$$;

revoke execute on function public.set_dealer_verified(uuid, boolean) from public, anon;
grant execute on function public.set_dealer_verified(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- listings: kind 'sell' = a dealer's car for sale, 'want' = a buyer's request.
-- -----------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('sell', 'want')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'closed')),
  title text not null check (char_length(title) between 4 and 80),
  brand text not null check (char_length(brand) between 1 and 40),
  model text not null check (char_length(model) between 1 and 60),
  model_year int check (model_year is null or model_year between 2000 and 2100),
  trim_level text check (trim_level is null or char_length(trim_level) <= 80),
  color text check (color is null or char_length(color) <= 40),
  price int check (price is null or price > 0),
  budget_min int check (budget_min is null or budget_min >= 0),
  budget_max int check (budget_max is null or budget_max > 0),
  region text not null check (char_length(region) <= 10),
  delivery_note text check (delivery_note is null or char_length(delivery_note) <= 100),
  description text not null default '' check (char_length(description) <= 3000),
  review_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_price_by_kind check (
    (kind = 'sell' and price is not null) or (kind = 'want' and budget_max is not null)
  ),
  constraint listings_budget_order check (
    budget_min is null or budget_max is null or budget_min <= budget_max
  )
);

create index listings_browse_idx on public.listings (status, kind, approved_at desc);
create index listings_owner_idx on public.listings (owner_id, created_at desc);
create index listings_brand_idx on public.listings (brand) where status = 'approved';

alter table public.listings enable row level security;

create policy "listings_select" on public.listings
  for select to anon, authenticated
  using (
    status = 'approved'
    or owner_id = (select auth.uid())
    or (select public.is_admin())
  );

-- Dealers post cars, buyers post requests, and only after agreeing to the terms.
create policy "listings_insert_own" on public.listings
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.terms_accepted_at is not null
        and (
          p.role = 'admin'
          or (listings.kind = 'sell' and p.role = 'dealer')
          or (listings.kind = 'want' and p.role = 'buyer')
        )
    )
  );

create policy "listings_update_own" on public.listings
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "listings_delete_own" on public.listings
  for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke insert, update, delete on public.listings from anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert (kind, title, brand, model, model_year, trim_level, color, price,
              budget_min, budget_max, region, delivery_note, description)
  on public.listings to authenticated;
grant update (title, brand, model, model_year, trim_level, color, price,
              budget_min, budget_max, region, delivery_note, description)
  on public.listings to authenticated;
grant delete on public.listings to authenticated;

create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- New listings always wait for review, and each account may post at most 10
-- listings a day (slows down spam accounts).
create or replace function public.listings_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status = 'pending';
  new.review_note = null;
  new.reviewed_at = null;
  new.reviewed_by = null;
  new.approved_at = null;
  if (select count(*) from public.listings
       where owner_id = new.owner_id and created_at > now() - interval '1 day') >= 10 then
    raise exception '每個帳號一天最多刊登 10 則，請明天再試';
  end if;
  return new;
end;
$$;

create trigger listings_before_insert
  before insert on public.listings
  for each row execute function public.listings_before_insert();

-- Editing the content of a listing (by its owner) sends it back to review, so
-- an approved ad can't be swapped for something else afterwards.
create or replace function public.listings_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.title, new.brand, new.model, new.model_year, new.trim_level, new.color,
      new.price, new.budget_min, new.budget_max, new.region, new.delivery_note,
      new.description)
     is distinct from
     (old.title, old.brand, old.model, old.model_year, old.trim_level, old.color,
      old.price, old.budget_min, old.budget_max, old.region, old.delivery_note,
      old.description)
     and not public.is_admin() then
    if old.status <> 'closed' then
      new.status = 'pending';
    end if;
    new.review_note = null;
  end if;
  return new;
end;
$$;

create trigger listings_before_update
  before update on public.listings
  for each row execute function public.listings_before_update();

-- Admin review: approve, or reject with a reason the owner can see.
create or replace function public.review_listing(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception '只有管理員可以審核刊登'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception '退件請填寫原因，刊登者看得到';
  end if;
  update public.listings
     set status = case when p_approve then 'approved' else 'rejected' end,
         review_note = nullif(trim(p_note), ''),
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         approved_at = case when p_approve then now() else approved_at end
   where id = p_id;
  if not found then raise exception '找不到這則刊登'; end if;
end;
$$;

revoke execute on function public.review_listing(uuid, boolean, text) from public, anon;
grant execute on function public.review_listing(uuid, boolean, text) to authenticated;

-- Owner closes a listing (sold / found a car), or reopens it (goes back to review).
create or replace function public.set_listing_closed(p_id uuid, p_closed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.listings
     set status = case when p_closed then 'closed' else 'pending' end
   where id = p_id
     and owner_id = auth.uid()
     and (p_closed and status in ('pending', 'approved')
          or not p_closed and status = 'closed');
  if not found then raise exception '無法變更這則刊登的狀態'; end if;
end;
$$;

revoke execute on function public.set_listing_closed(uuid, boolean) from public, anon;
grant execute on function public.set_listing_closed(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- listing_photos (files live in the public 'listing-photos' bucket at
-- <listing_id>/<uuid>.<ext>)
-- -----------------------------------------------------------------------------
create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index listing_photos_listing_idx on public.listing_photos (listing_id, sort_order);

alter table public.listing_photos enable row level security;

-- Visible whenever the listing itself is visible (the subquery runs under
-- listings' RLS).
create policy "listing_photos_select" on public.listing_photos
  for select to anon, authenticated
  using (exists (select 1 from public.listings l where l.id = listing_photos.listing_id));

create policy "listing_photos_write_own" on public.listing_photos
  for all to authenticated
  using (exists (select 1 from public.listings l
                 where l.id = listing_photos.listing_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.listings l
                      where l.id = listing_photos.listing_id and l.owner_id = (select auth.uid())));

grant select on public.listing_photos to anon, authenticated;
grant insert, update, delete on public.listing_photos to authenticated;

create or replace function public.listing_photos_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.listing_photos where listing_id = new.listing_id) >= 10 then
    raise exception '每則刊登最多 10 張照片';
  end if;
  return new;
end;
$$;

create trigger listing_photos_limit
  before insert on public.listing_photos
  for each row execute function public.listing_photos_limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "listing_photos_files_read" on storage.objects
  for select using (bucket_id = 'listing-photos');

create policy "listing_photos_files_write_own" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (select 1 from public.listings l
                where l.owner_id = (select auth.uid())
                  and l.id::text = split_part(storage.objects.name, '/', 1))
  )
  with check (
    bucket_id = 'listing-photos'
    and exists (select 1 from public.listings l
                where l.owner_id = (select auth.uid())
                  and l.id::text = split_part(storage.objects.name, '/', 1))
  );

-- -----------------------------------------------------------------------------
-- messages: on-site conversation about one listing between its owner and one
-- other member (thread_user_id). Written only through send_message().
-- -----------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  thread_user_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_thread_idx on public.messages (listing_id, thread_user_id, created_at);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_recipient_idx on public.messages (recipient_id, created_at desc);

alter table public.messages enable row level security;

-- The two people in the thread can read it; admins can too, to look into
-- reports (the privacy policy says so).
create policy "messages_select_participants" on public.messages
  for select to authenticated
  using (
    sender_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or (select public.is_admin())
  );

revoke insert, update, delete on public.messages from anon, authenticated;
grant select on public.messages to authenticated;

-- p_to is needed only when the listing owner replies (who to reply to).
create or replace function public.send_message(p_listing uuid, p_body text, p_to uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  l public.listings%rowtype;
  v_thread uuid;
  v_to uuid;
  v_id uuid;
begin
  if me is null then raise exception '請先登入'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception '訊息不能是空白'; end if;
  if char_length(p_body) > 2000 then raise exception '訊息最多 2000 字'; end if;

  select * into l from public.listings where id = p_listing;
  if not found then raise exception '找不到這則刊登'; end if;

  if (select count(*) from public.messages
       where sender_id = me and created_at > now() - interval '1 hour') >= 30 then
    raise exception '訊息傳送太頻繁，請稍後再試';
  end if;

  if me = l.owner_id then
    if p_to is null or p_to = me then raise exception '請選擇要回覆的對象'; end if;
    if not exists (select 1 from public.messages
                   where listing_id = p_listing and thread_user_id = p_to) then
      raise exception '只能回覆曾經詢問過這則刊登的會員';
    end if;
    v_thread := p_to;
    v_to := p_to;
  else
    if l.status <> 'approved' then raise exception '這則刊登目前不開放留言'; end if;
    v_thread := me;
    v_to := l.owner_id;
  end if;

  insert into public.messages (listing_id, thread_user_id, sender_id, recipient_id, body)
  values (p_listing, v_thread, me, v_to, trim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.send_message(uuid, text, uuid) from public, anon;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;

create or replace function public.mark_thread_read(p_listing uuid, p_thread_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
     set read_at = now()
   where listing_id = p_listing
     and thread_user_id = p_thread_user
     and recipient_id = auth.uid()
     and read_at is null;
$$;

revoke execute on function public.mark_thread_read(uuid, uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- reports: members flag a suspicious listing. 3 open reports pull it from
-- public view until an admin decides.
-- -----------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reason text not null
    check (reason in ('fraud', 'fake', 'wrong_info', 'duplicate', 'offensive', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (listing_id, reporter_id)
);

create index reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

create policy "reports_insert_own" on public.reports
  for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.listings l
                where l.id = reports.listing_id
                  and l.status = 'approved'
                  and l.owner_id <> (select auth.uid()))
  );

create policy "reports_select" on public.reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

revoke insert, update, delete on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (listing_id, reason, details) on public.reports to authenticated;

create or replace function public.reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.reports
       where listing_id = new.listing_id and status = 'open') >= 3 then
    update public.listings
       set status = 'pending',
           review_note = '多位會員檢舉，暫停顯示，等待管理員複查'
     where id = new.listing_id and status = 'approved';
  end if;
  return new;
end;
$$;

create trigger reports_after_insert
  after insert on public.reports
  for each row execute function public.reports_after_insert();

-- p_action: 'dismiss' (report unfounded) or 'takedown' (reject the listing and
-- close every open report on it).
create or replace function public.resolve_report(p_id uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing uuid;
begin
  if not public.is_admin() then raise exception '只有管理員可以處理檢舉'; end if;
  if p_action not in ('dismiss', 'takedown') then raise exception '未知的處理方式'; end if;

  select listing_id into v_listing from public.reports where id = p_id;
  if not found then raise exception '找不到這筆檢舉'; end if;

  if p_action = 'dismiss' then
    update public.reports
       set status = 'dismissed', admin_note = nullif(trim(p_note), ''),
           resolved_at = now(), resolved_by = auth.uid()
     where id = p_id;
  else
    update public.listings
       set status = 'rejected',
           review_note = coalesce(nullif(trim(p_note), ''), '經檢舉查證後下架'),
           reviewed_at = now(), reviewed_by = auth.uid()
     where id = v_listing;
    update public.reports
       set status = 'resolved', admin_note = nullif(trim(p_note), ''),
           resolved_at = now(), resolved_by = auth.uid()
     where listing_id = v_listing and status = 'open';
  end if;
end;
$$;

revoke execute on function public.resolve_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Make yourself admin (run once in the SQL editor after signing up):
--   update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = '<your email>');
-- -----------------------------------------------------------------------------
