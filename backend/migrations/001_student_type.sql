-- Only needed if you ran `npm run db:init` BEFORE the switch to the Geography (Optional)
-- programme form (when registrations had class_level and mode columns).
-- Fresh installs already get this from schema.sql.
--
-- Run with:  mysql -u root -p <DB_NAME> < migrations/001_student_type.sql

ALTER TABLE registrations
  ADD COLUMN student_type ENUM('new','old_student','repeater','optional_student') NOT NULL DEFAULT 'new' AFTER email,
  ADD INDEX idx_reg_type (student_type),
  DROP COLUMN class_level,
  DROP COLUMN mode;

ALTER TABLE registrations ALTER COLUMN student_type DROP DEFAULT;
