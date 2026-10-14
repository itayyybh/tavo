-- ---------------------------------------------------------------------------
-- Skip cleaning (operational setting)
--
-- When on, clearing a party returns its tables straight to `available` instead
-- of putting them through the `cleaning` turnover state. Deliberately a column
-- of its own rather than reusing `seating.turnoverBufferMin`: that value also
-- spaces consecutive bookings on the same table inside the Seating Engine, so
-- zeroing it to skip turnover would silently change seating behaviour too.
--
-- Defaults to false — existing restaurants keep the turnover they have today.
-- ---------------------------------------------------------------------------
alter table restaurant_settings
  add column if not exists skip_cleaning boolean not null default false;
