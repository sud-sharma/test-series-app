-- Test series: registrations, payments and admin users

CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(190)  NOT NULL UNIQUE,
  password_hash VARCHAR(100)  NOT NULL,
  last_login_at DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS registrations (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  phone        VARCHAR(15)  NOT NULL,
  email        VARCHAR(190) NOT NULL,
  -- new = full fee online; the others are concession categories confirmed by the team
  student_type ENUM('new','old_student','repeater','optional_student') NOT NULL,
  city         VARCHAR(100) NULL,
  status       ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  amount_paise INT UNSIGNED NOT NULL,
  paid_at      DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_reg_status (status),
  INDEX idx_reg_type (student_type),
  INDEX idx_reg_created (created_at),
  INDEX idx_reg_email (email),
  INDEX idx_reg_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  registration_id     INT UNSIGNED NOT NULL,
  razorpay_order_id   VARCHAR(40)  NOT NULL UNIQUE,
  razorpay_payment_id VARCHAR(40)  NULL UNIQUE,
  razorpay_signature  VARCHAR(128) NULL,
  amount_paise        INT UNSIGNED NOT NULL,
  currency            CHAR(3)      NOT NULL DEFAULT 'INR',
  status              ENUM('created','paid','failed') NOT NULL DEFAULT 'created',
  method              VARCHAR(30)  NULL,
  error_description   VARCHAR(255) NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pay_reg FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
  INDEX idx_pay_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
