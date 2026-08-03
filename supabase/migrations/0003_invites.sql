-- Phase 9 — Invite links. An owner mints a code; a new user redeems it during
-- signup and is bound to that restaurant as a manager. Redemption is the only
-- way (besides owning) to gain a membership, and it runs SECURITY DEFINER so a
-- not-yet-member can join exactly one restaurant — the code's — and no other.

create table invites (
  id            text primary key,
  restaurant_id text not null references restaurants (id) on delete cascade,
  code          text not null unique,
  role          membership_role not null default 'manager',
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days',
  redeemed_by   uuid references auth.users (id),
  redeemed_at   timestamptz
);
create index invites_restaurant_idx on invites (restaurant_id);

alter table invites enable row level security;

-- Owners see their restaurant's invites (to list/copy links). Creation goes
-- through the RPC below, so no client INSERT policy is granted.
create policy invites_owner_read on invites
  for select using (
    exists (
      select 1 from memberships m
      where m.restaurant_id = invites.restaurant_id
        and m.user_id = auth.uid()
        and m.role = 'owner'
    )
  );

-- ---------------------------------------------------------------------------
-- Owner-only: mint an invite code for a restaurant. Returns the code.
-- ---------------------------------------------------------------------------
create or replace function public.create_invite(
  p_restaurant_id text,
  p_role membership_role default 'manager'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(substr(md5(gen_random_uuid()::text), 1, 8));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from memberships
    where user_id = v_uid and restaurant_id = p_restaurant_id and role = 'owner'
  ) then
    raise exception 'only an owner may create invites';
  end if;

  insert into invites (id, restaurant_id, code, role, created_by)
  values (gen_random_uuid()::text, p_restaurant_id, v_code, p_role, v_uid);

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Redeem an invite for the calling user. Idempotent if already a member of that
-- restaurant. Returns the restaurant id joined.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite from invites
  where code = upper(p_code)
  for update;

  if v_invite.id is null then
    raise exception 'invalid invite code';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite has expired';
  end if;

  -- Already a member of this restaurant -> succeed without a second membership.
  if exists (
    select 1 from memberships
    where user_id = v_uid and restaurant_id = v_invite.restaurant_id
  ) then
    return v_invite.restaurant_id;
  end if;

  insert into memberships (id, user_id, restaurant_id, role)
  values (gen_random_uuid()::text, v_uid, v_invite.restaurant_id, v_invite.role);

  update invites
    set redeemed_by = v_uid, redeemed_at = now()
    where id = v_invite.id and redeemed_by is null;

  return v_invite.restaurant_id;
end;
$$;
