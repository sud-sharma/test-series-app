-- Only needed if your database was created before the security update.
-- Fresh installs already get this column from schema.sql.
--
-- Run with:  mysql -u root -p <DB_NAME> < migrations/002_access_token.sql
--
-- Registrations created before this change have no token, so they can no longer start an
-- online payment from the old browser session; those students simply register again.

ALTER TABLE registrations
  ADD COLUMN access_token_hash CHAR(64) NULL AFTER amount_paise;
