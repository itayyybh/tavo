-- Phase 11 — Restaurant profile: timezone. The settings columns already exist
-- (0001 restaurant_settings); only the profile gains a field. Nullable: existing
-- restaurants keep NULL and the app falls back to the browser's zone until an
-- owner sets one. Stored now; scheduling math becomes tz-aware in a later phase.

alter table restaurants add column if not exists timezone text;

-- Owner-only profile edit. `restaurants` has read-only RLS for members, so the
-- name/timezone write goes through a security-definer function that checks
-- ownership first — same pattern as add-member / create-invite (0002, 0003).
create or replace function public.update_restaurant_profile(
  p_restaurant_id text,
  p_name text,
  p_timezone text
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
      timezone = p_timezone
  where id = p_restaurant_id;
end;
$$;
