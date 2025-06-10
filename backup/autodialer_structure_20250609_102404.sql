-- MySQL dump 10.13  Distrib 8.0.42, for Linux (x86_64)
--
-- Host: localhost    Database: autodialer
-- ------------------------------------------------------
-- Server version	8.0.42-0ubuntu0.24.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `audio_files`
--

DROP TABLE IF EXISTS `audio_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audio_files` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `filename` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mimetype` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` int NOT NULL,
  `duration` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audio_playback_logs`
--

DROP TABLE IF EXISTS `audio_playback_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audio_playback_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `call_id` varchar(255) NOT NULL,
  `audio_file_id` varchar(255) DEFAULT NULL,
  `audio_type` enum('welcome','menu','goodbye','error') NOT NULL,
  `played_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('played','failed','skipped') DEFAULT 'played',
  `duration_ms` int DEFAULT '0',
  `error_message` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_call_id` (`call_id`),
  KEY `idx_audio_file_id` (`audio_file_id`),
  KEY `idx_played_at` (`played_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `call_logs`
--

DROP TABLE IF EXISTS `call_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `call_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `call_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `campaign_id` int DEFAULT NULL,
  `contact_id` int DEFAULT NULL,
  `caller_id_id` int DEFAULT NULL,
  `phone_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_time` datetime DEFAULT NULL,
  `end_time` datetime DEFAULT NULL,
  `duration` int DEFAULT '0',
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `keypress` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `call_provider` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'sip',
  `has_audio` tinyint(1) DEFAULT '0',
  `audio_file_count` int DEFAULT '0',
  `audio_played_at` timestamp NULL DEFAULT NULL,
  `test_call` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `transfer_attempted` tinyint(1) NOT NULL DEFAULT '0',
  `transfer_successful` tinyint(1) NOT NULL DEFAULT '0',
  `transfer_target` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transfer_duration` int NOT NULL DEFAULT '0',
  `ivr_menu_reached` tinyint(1) NOT NULL DEFAULT '0',
  `is_transfer` tinyint(1) DEFAULT '0' COMMENT '転送通話フラグ',
  `transfer_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '転送ID',
  `transfer_type` enum('customer','operator') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '通話種別',
  PRIMARY KEY (`id`),
  UNIQUE KEY `call_id` (`call_id`),
  KEY `campaign_id` (`campaign_id`),
  KEY `contact_id` (`contact_id`),
  KEY `caller_id_id` (`caller_id_id`),
  CONSTRAINT `call_logs_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`),
  CONSTRAINT `call_logs_ibfk_2` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`),
  CONSTRAINT `call_logs_ibfk_3` FOREIGN KEY (`caller_id_id`) REFERENCES `caller_ids` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=520 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `caller_channels`
--

DROP TABLE IF EXISTS `caller_channels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `caller_channels` (
  `id` int NOT NULL AUTO_INCREMENT,
  `caller_id_id` int NOT NULL,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel_type` enum('outbound','inbound','both') COLLATE utf8mb4_unicode_ci DEFAULT 'both',
  `status` enum('available','busy','error') COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `last_used` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `caller_id_id` (`caller_id_id`),
  CONSTRAINT `caller_channels_ibfk_1` FOREIGN KEY (`caller_id_id`) REFERENCES `caller_ids` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=75 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `caller_ids`
--

DROP TABLE IF EXISTS `caller_ids`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `caller_ids` (
  `id` int NOT NULL AUTO_INCREMENT,
  `number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `provider` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `domain` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `campaign_audio`
--

DROP TABLE IF EXISTS `campaign_audio`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaign_audio` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `audio_file_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `audio_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_campaign_audio_type` (`campaign_id`,`audio_type`),
  KEY `audio_file_id` (`audio_file_id`),
  CONSTRAINT `campaign_audio_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `campaign_audio_ibfk_2` FOREIGN KEY (`audio_file_id`) REFERENCES `audio_files` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `campaign_ivr_config`
--

DROP TABLE IF EXISTS `campaign_ivr_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaign_ivr_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `config` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_campaign_ivr_config` (`campaign_id`),
  CONSTRAINT `campaign_ivr_config_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `campaign_transfer_destinations`
--

DROP TABLE IF EXISTS `campaign_transfer_destinations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaign_transfer_destinations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `dtmf_key` varchar(1) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sip_username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_campaign_key` (`campaign_id`,`dtmf_key`),
  CONSTRAINT `campaign_transfer_destinations_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `campaigns`
--

DROP TABLE IF EXISTS `campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campaigns` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('draft','active','paused','completed') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `caller_id_id` int DEFAULT NULL,
  `script` text COLLATE utf8mb4_unicode_ci,
  `retry_attempts` int DEFAULT '0',
  `max_concurrent_calls` int DEFAULT '5',
  `schedule_start` datetime DEFAULT NULL,
  `schedule_end` datetime DEFAULT NULL,
  `working_hours_start` time DEFAULT '09:00:00',
  `working_hours_end` time DEFAULT '18:00:00',
  `progress` int DEFAULT '0',
  `ivr_deployed` tinyint(1) DEFAULT '0',
  `ivr_deploy_time` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `transfer_enabled` tinyint(1) DEFAULT '1' COMMENT '転送機能有効/無効',
  `operator_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'オペレーター番号（転送先）',
  `transfer_message` text COLLATE utf8mb4_unicode_ci COMMENT 'カスタム転送メッセージ',
  PRIMARY KEY (`id`),
  KEY `caller_id_id` (`caller_id_id`),
  CONSTRAINT `campaigns_ibfk_1` FOREIGN KEY (`caller_id_id`) REFERENCES `caller_ids` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `contacts`
--

DROP TABLE IF EXISTS `contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contacts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int DEFAULT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `company` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','called','completed','failed','dnc') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `last_attempt` datetime DEFAULT NULL,
  `attempt_count` int DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `campaign_id` (`campaign_id`),
  CONSTRAINT `contacts_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10057 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dnc_list`
--

DROP TABLE IF EXISTS `dnc_list`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dnc_list` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `operator_call_logs`
--

DROP TABLE IF EXISTS `operator_call_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `operator_call_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `operator_id` int NOT NULL,
  `call_log_id` int NOT NULL,
  `start_time` datetime NOT NULL,
  `end_time` datetime DEFAULT NULL,
  `duration` int DEFAULT NULL,
  `disposition` enum('completed','transferred','dropped','voicemail') COLLATE utf8mb4_unicode_ci DEFAULT 'completed',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `customer_satisfaction` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `operator_id` (`operator_id`),
  KEY `call_log_id` (`call_log_id`),
  CONSTRAINT `operator_call_logs_ibfk_1` FOREIGN KEY (`operator_id`) REFERENCES `operators` (`id`),
  CONSTRAINT `operator_call_logs_ibfk_2` FOREIGN KEY (`call_log_id`) REFERENCES `call_logs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `operator_shifts`
--

DROP TABLE IF EXISTS `operator_shifts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `operator_shifts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `operator_id` int NOT NULL,
  `shift_date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `break_start` time DEFAULT NULL,
  `break_end` time DEFAULT NULL,
  `status` enum('scheduled','active','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'scheduled',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_shift` (`operator_id`,`shift_date`,`start_time`),
  CONSTRAINT `operator_shifts_ibfk_1` FOREIGN KEY (`operator_id`) REFERENCES `operators` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `operator_status_logs`
--

DROP TABLE IF EXISTS `operator_status_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `operator_status_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `operator_id` int NOT NULL,
  `old_status` enum('available','busy','offline','break') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` enum('available','busy','offline','break') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `operator_id` (`operator_id`),
  CONSTRAINT `operator_status_logs_ibfk_1` FOREIGN KEY (`operator_id`) REFERENCES `operators` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `operators`
--

DROP TABLE IF EXISTS `operators`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `operators` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `operator_id` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('available','busy','offline','break') COLLATE utf8mb4_unicode_ci DEFAULT 'offline',
  `current_call_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `skills` json DEFAULT NULL,
  `max_concurrent_calls` int DEFAULT '1',
  `priority` int DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `operator_id` (`operator_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `operators_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_logs`
--

DROP TABLE IF EXISTS `system_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `level` enum('DEBUG','INFO','WARN','ERROR','FATAL') DEFAULT 'INFO',
  `component` varchar(50) NOT NULL COMMENT 'ログ出力元（dialerService, sipService等）',
  `message` text NOT NULL,
  `details` json DEFAULT NULL COMMENT '詳細情報',
  `user_id` int DEFAULT NULL,
  `session_id` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_level` (`level`),
  KEY `idx_component` (`component`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `system_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='システムログテーブル';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text,
  `setting_type` enum('string','integer','boolean','json') DEFAULT 'string',
  `description` text,
  `is_public` tinyint(1) DEFAULT '0' COMMENT '一般ユーザーに表示するか',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`),
  KEY `idx_setting_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='システム設定テーブル';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `transfer_key_capacity`
--

DROP TABLE IF EXISTS `transfer_key_capacity`;
