# Demo mode (no sign-up)

Portfolio visitors click **Try the live demo** on the sign-in screen and land in
the app with a sample restaurant — no email, no password.

## How it works

1. The button signs the visitor in as an **anonymous Supabase user**.
2. The session store calls the `start_demo()` RPC, which copies a **template
   restaurant** (zones, table types, tables, connections, obstacles, settings,
   floor state, reservations) into a new restaurant owned by that guest.
   Reservations are shifted from the template day to "today".
3. RLS is membership-based, so a guest can only ever read or change **their own
   copy**. Real restaurants (and their guests' names and phone numbers) are never
   visible to a demo user.
4. `cleanup_demos()` runs hourly (pg_cron) and deletes copies and guest users
   older than 24 hours.
5. A banner tells guests they're in a demo and offers **Exit demo**.

Guests can't create real restaurants (`bootstrap_restaurant` refuses anonymous
sessions).

## One-time setup

1. **Apply the migrations** `supabase/migrations/0025_demo_mode.sql` and `0026_demo_mode_fixes.sql`
   (`supabase db push`, or paste it into the SQL editor).
   If `create extension pg_cron` fails, enable **pg_cron** under
   *Database → Extensions* and run the last two statements again.
2. **Turn on anonymous sign-ins:** *Authentication → Sign In / Providers →
   Allow anonymous sign-ins*. Optionally enable CAPTCHA there too.
3. **Build the template venue** with a normal account (not the Cafe Jolie one):
   sign up, create a restaurant called "Demo Bistro", and draw the floor in the
   editor (zones named e.g. Inside / Terrace / Bar, 10–15 tables).
4. **Add fake reservations and register the template in one go:** run
   `supabase/seed/demo_template_reservations.sql` in the SQL editor (edit the
   restaurant name and evening at its top). It adds 17 invented reservations
   and writes `demo_config`. Or register by hand:

   ```sql
   insert into demo_config (template_restaurant_id, template_day)
   select id, date '2026-11-05'          -- the day its reservations are on
   from restaurants where name = 'Demo Bistro'
   on conflict (id) do update
     set template_restaurant_id = excluded.template_restaurant_id,
         template_day = excluded.template_day;
   ```

5. **Set the template's timezone** (copies use it to decide what "today" is):
   `update restaurants set timezone = 'Asia/Jerusalem' where name = 'Demo Bistro';`
6. Open the app signed out and click **Try the live demo**.

Editing the template later (with its own account) changes what new guests get;
existing copies are unaffected.

## Checks

- `select count(*) from restaurants where is_demo;` — live demo copies.
- `select public.cleanup_demos();` — run the cleanup by hand.
- `select * from cron.job where jobname = 'tavo-demo-cleanup';` — the schedule.
