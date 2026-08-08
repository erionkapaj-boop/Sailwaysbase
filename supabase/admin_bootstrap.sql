-- ============================================================================
-- One-off: promote yourself (or anyone) to admin.
-- Run this in the Supabase SQL editor — NOT part of the migrations folder,
-- run it manually, once, whenever you need to grant admin.
--
-- Prerequisite: the target person has already signed up once through
-- /platform/login (SMS OTP + role selection), so their row already exists
-- in public.users. This script only flips their role — it does not create
-- an account.
-- ============================================================================

-- 1) Find the account by phone number (E.164 format, e.g. +30691234567).
--    Replace the number below, then run just this SELECT first to confirm
--    you're targeting the right person.
select id, phone_number, role, status, created_at
from public.users
where phone_number = '+30691234567';  -- <-- EDIT ME

-- 2) Once confirmed, promote it:
update public.users
set role = 'admin'
where phone_number = '+30691234567'   -- <-- EDIT ME (same number as above)
returning id, phone_number, role;

-- Optional: to demote someone back (e.g. mistaken promotion), run:
-- update public.users set role = 'client' where phone_number = '+30691234567';
