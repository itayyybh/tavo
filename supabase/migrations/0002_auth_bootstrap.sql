-- Phase 9 — Auth bootstrap: profile mirroring, restaurant creation, invites.
--
-- These SECURITY DEFINER functions are the only writes to `memberships` and
-- `restaurants`. The frontend never inserts those directly (the RLS policies
-- deliberately allow no client insert on memberships), so tenancy can't be
-- forged from the browser — a user joins a restaurant only through a path an
-- owner (or their own bootstrap) authorized.

-- ---------------------------------------------------------------------------
-- Mirror every new auth user into public.profiles.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Bootstrap a restaurant for the calling user. Idempotent-ish: refuses if the
-- caller already belongs to any restaurant, so a double-tap can't spawn two.
-- Seeds a default restaurant_settings row (kept in sync with the app's
-- settingsStore defaults; the real values are imported during migration).
-- Returns the new restaurant id.
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_restaurant(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id text := gen_random_uuid()::text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from memberships where user_id = v_uid) then
    raise exception 'user already belongs to a restaurant';
  end if;

  insert into restaurants (id, name) values (v_restaurant_id, p_name);

  insert into memberships (id, user_id, restaurant_id, role)
  values (gen_random_uuid()::text, v_uid, v_restaurant_id, 'owner');

  insert into restaurant_settings (restaurant_id, seating)
  values (v_restaurant_id, '{}'::jsonb)
  on conflict (restaurant_id) do nothing;

  return v_restaurant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Add an existing user to the caller's restaurant by email. Only an owner of
-- that restaurant may call it. The invitee must already have signed up (their
-- profile exists) — full email-invite flow is a later phase.
-- ---------------------------------------------------------------------------
create or replace function public.add_member(
  p_restaurant_id text,
  p_email text,
  p_role membership_role default 'manager'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_membership_id text := gen_random_uuid()::text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from memberships
    where user_id = v_uid and restaurant_id = p_restaurant_id and role = 'owner'
  ) then
    raise exception 'only an owner may add members';
  end if;

  select id into v_target from profiles where lower(email) = lower(p_email);
  if v_target is null then
    raise exception 'no user with that email has signed up yet';
  end if;

  insert into memberships (id, user_id, restaurant_id, role)
  values (v_membership_id, v_target, p_restaurant_id, p_role)
  on conflict (user_id, restaurant_id) do nothing;

  return v_membership_id;
end;
$$;
