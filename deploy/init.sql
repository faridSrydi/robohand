-- =============================================================================
-- Robotic Hand — MySQL Schema & Seed Default User
-- Domain : robotic-hand.my.id
-- Akun   : robohand / robohandti24 (tersimpan sebagai hash bcrypt)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS `robotic_hand`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `robotic_hand`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'admin',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Password default: robohandti24 (bcrypt cost 10)
INSERT IGNORE INTO `users` (`username`, `password_hash`, `role`)
VALUES (
  'robohand',
  '$2b$10$FJNvAYzw9WHscm9RwN4GCuSUeUrPoNTbwF/0HwPsrDq8smWgDHb3G',
  'admin'
);
