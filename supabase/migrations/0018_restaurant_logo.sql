-- Restaurant profile: logo. Stored inline as a data URL (client resizes to a
-- small square before upload), so no storage bucket is needed. Nullable —
-- existing restaurants keep NULL and the app falls back to the Tavo mark until
-- an owner sets one.

alter table restaurants add column if not exists logo_url text;

-- Extend the owner-only profile RPC with the logo. The parameter list changes,
-- so drop the old 3-arg signature first (create-or-replace can't alter args).
drop function if exists public.update_restaurant_profile(text, text, text);

create or replace function public.update_restaurant_profile(
  p_restaurant_id text,
  p_name text,
  p_timezone text,
  p_logo_url text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from memberships
    where user_id = v_uid and restaurant_id = p_restaurant_id and role = 'owner'
  ) then
    raise exception 'only an owner may edit the restaurant profile';
  end if;

  update restaurants
  set name = coalesce(nullif(p_name, ''), name),
      timezone = p_timezone,
      logo_url = p_logo_url
  where id = p_restaurant_id;
end;
$$;
