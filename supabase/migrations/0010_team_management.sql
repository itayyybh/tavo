-- Phase 11 — Settings shell: team management. RLS scopes `memberships`/`profiles`
-- to the caller's own rows, so listing the team needs a SECURITY DEFINER function
-- that first checks the caller belongs to the restaurant. Mirrors the existing
-- owner-checked RPCs (add_member, create_invite, update_restaurant_profile).

-- Any member may view the team (name, email, role). A non-member gets no rows
-- (the membership check is in the WHERE clause, so it fails closed, not errors).
create or replace function public.list_members(p_restaurant_id text)
returns table (user_id uuid, role membership_role, name text, email text)
language sql
security definer
stable
set search_path = public
as $$
  select m.user_id, m.role, p.name, p.email
  from memberships m
  join profiles p on p.id = m.user_id
  where m.restaurant_id = p_restaurant_id
    and public.is_restaurant_member(p_restaurant_id)
  order by (m.role = 'owner') desc, p.name nulls last, p.email;
$$;

-- Owner-only member removal. Guards: not self, and an owner can't be removed
-- (demote first — role changes are a later step), so the restaurant always keeps
-- at least its owner.
create or replace function public.remove_member(
  p_restaurant_id text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_target_role membership_role;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from memberships
    where user_id = v_uid and restaurant_id = p_restaurant_id and role = 'owner'
  ) then
    raise exception 'only an owner may remove members';
  end if;

  if p_user_id = v_uid then
    raise exception 'you cannot remove yourself';
  end if;

  select role into v_target_role
  from memberships
  where user_id = p_user_id and restaurant_id = p_restaurant_id;

  if v_target_role is null then
    raise exception 'not a member of this restaurant';
  end if;

  if v_target_role = 'owner' then
    raise exception 'an owner cannot be removed';
  end if;

  delete from memberships
  where user_id = p_user_id and restaurant_id = p_restaurant_id;
end;
$$;
