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
-- Dumping data for table `campaign_transfer_destinations`
--

LOCK TABLES `campaign_transfer_destinations` WRITE;
/*!40000 ALTER TABLE `campaign_transfer_destinations` DISABLE KEYS */;
INSERT INTO `campaign_transfer_destinations` VALUES (5,52,'1','03750001',1,'2025-06-09 01:52:14','2025-06-09 01:52:14'),(6,52,'2','03760001',1,'2025-06-09 01:52:14','2025-06-09 01:52:14'),(7,52,'3','03770001',1,'2025-06-09 01:52:14','2025-06-09 01:52:14');
/*!40000 ALTER TABLE `campaign_transfer_destinations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transfer_settings`
--

DROP TABLE IF EXISTS `transfer_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transfer_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int NOT NULL,
  `transfer_enabled` tinyint(1) DEFAULT '1' COMMENT '転送機能有効/無効',
  `transfer_key` varchar(5) DEFAULT '1' COMMENT '転送トリガーキー',
  `transfer_timeout` int DEFAULT '15' COMMENT '転送待機時間（秒）',
  `transfer_retry_attempts` int DEFAULT '2' COMMENT '転送リトライ回数',
  `announcement_before_transfer` text COMMENT '転送前アナウンス',
  `announcement_after_transfer` text COMMENT '転送後アナウンス',
  `transfer_hours_start` time DEFAULT '09:00:00' COMMENT '転送受付開始時刻',
  `transfer_hours_end` time DEFAULT '18:00:00' COMMENT '転送受付終了時刻',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_campaign_transfer` (`campaign_id`),
  KEY `idx_campaign_transfer` (`campaign_id`),
  CONSTRAINT `transfer_settings_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='転送設定テーブル';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transfer_settings`
--

LOCK TABLES `transfer_settings` WRITE;
/*!40000 ALTER TABLE `transfer_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `transfer_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transfer_logs`
--

DROP TABLE IF EXISTS `transfer_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `transfer_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `original_call_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '元の通話ID',
  `transfer_call_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '転送通話ID',
  `campaign_id` int DEFAULT NULL,
  `contact_id` int DEFAULT NULL,
  `original_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `transfer_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '転送先番号',
  `keypress` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'トリガーキー',
  `transfer_initiated_at` datetime NOT NULL COMMENT '転送開始時刻',
  `transfer_connected_at` datetime DEFAULT NULL COMMENT '転送接続時刻',
  `transfer_ended_at` datetime DEFAULT NULL COMMENT '転送終了時刻',
  `status` enum('initiated','ringing','connected','failed','completed','abandoned') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` int DEFAULT NULL COMMENT '転送通話時間（秒）',
  `failure_reason` text COLLATE utf8mb4_unicode_ci COMMENT '転送失敗理由',
  `operator_id` int DEFAULT NULL COMMENT '対応オペレーターID',
  `operator_satisfaction` int DEFAULT NULL COMMENT 'オペレーター評価（1-5）',
  `transfer_cost` decimal(8,4) DEFAULT '0.0000',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `contact_id` (`contact_id`),
  KEY `idx_campaign_id` (`campaign_id`),
  KEY `idx_transfer_time` (`transfer_initiated_at`),
  KEY `idx_original_call_id` (`original_call_id`),
  KEY `idx_transfer_status` (`status`),
  KEY `idx_transfer_number` (`transfer_number`),
  CONSTRAINT `transfer_logs_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`) ON DELETE CASCADE,
  CONSTRAINT `transfer_logs_ibfk_2` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='転送詳細ログテーブル';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transfer_logs`
--

LOCK TABLES `transfer_logs` WRITE;
/*!40000 ALTER TABLE `transfer_logs` DISABLE KEYS */;
INSERT INTO `transfer_logs` VALUES (6,'test-123',NULL,NULL,NULL,'05018086649','03760011','1','2025-06-06 11:01:19',NULL,NULL,'initiated',NULL,NULL,NULL,NULL,0.0000,'2025-06-06 11:01:19'),(7,'test-123',NULL,52,NULL,'05018086649','test001','4','2025-06-09 01:47:09',NULL,NULL,'initiated',NULL,NULL,NULL,NULL,0.0000,'2025-06-09 01:47:09'),(8,'test-key1',NULL,52,NULL,'05018086649','03750001','1','2025-06-09 01:53:44',NULL,NULL,'initiated',NULL,NULL,NULL,NULL,0.0000,'2025-06-09 01:53:44'),(9,'test-key2',NULL,52,NULL,'05018086649','03760001','2','2025-06-09 01:53:53',NULL,NULL,'initiated',NULL,NULL,NULL,NULL,0.0000,'2025-06-09 01:53:53'),(10,'test-key3',NULL,52,NULL,'05018086649','03770001','3','2025-06-09 01:53:59',NULL,NULL,'initiated',NULL,NULL,NULL,NULL,0.0000,'2025-06-09 01:53:59'),(11,'test-phase2-001',NULL,52,NULL,'09012345678','03750004','1','2025-06-09 03:08:13',NULL,'2025-06-09 03:09:10','completed',NULL,NULL,NULL,NULL,0.0000,'2025-06-09 03:08:13'),(12,'test-phase2-002',NULL,52,NULL,'09012345679','03750003','1','2025-06-09 03:09:03',NULL,NULL,'initiated',NULL,NULL,NULL,NULL,0.0000,'2025-06-09 03:09:03');
/*!40000 ALTER TABLE `transfer_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `caller_channels`
--

LOCK TABLES `caller_channels` WRITE;
/*!40000 ALTER TABLE `caller_channels` DISABLE KEYS */;
INSERT INTO `caller_channels` VALUES (13,5,'03760003','40486119','both','available',NULL,'2025-05-30 15:45:08'),(16,5,'03760011','77376453','both','available',NULL,'2025-06-02 05:29:45'),(17,6,'03750001','20811247','both','available',NULL,'2025-06-02 14:16:03'),(18,6,'03750002','41836922','both','available',NULL,'2025-06-02 14:16:20'),(19,6,'03750003','42301179','both','available',NULL,'2025-06-03 04:05:58'),(20,6,'03750004','80611651','both','available',NULL,'2025-06-03 04:06:10'),(21,6,'03750005','36473429','both','available',NULL,'2025-06-03 04:06:26'),(22,6,'03750006','90537505','both','available',NULL,'2025-06-03 04:06:36'),(23,6,'03750007','55811555','both','available',NULL,'2025-06-03 04:06:46'),(24,6,'03750008','60612419','both','available',NULL,'2025-06-03 04:06:57'),(25,6,'03750009','65881736','both','available',NULL,'2025-06-03 04:07:07'),(26,6,'03750010','27726401','both','available',NULL,'2025-06-03 04:07:18'),(27,6,'03750011','32559901','both','available',NULL,'2025-06-03 04:07:27'),(28,6,'03750012','37170878','both','available',NULL,'2025-06-03 04:07:38'),(29,6,'03750013','95378813','both','available',NULL,'2025-06-03 04:07:48'),(30,6,'03750014','28409995','both','available',NULL,'2025-06-03 04:07:58'),(31,6,'03750015','58303903','both','available',NULL,'2025-06-03 04:08:08'),(32,6,'03750016','35831108','both','available',NULL,'2025-06-03 04:08:19'),(33,6,'03750017','14928911','both','available',NULL,'2025-06-03 04:08:29'),(34,6,'03750018','98374759','both','available',NULL,'2025-06-03 04:08:39'),(35,6,'03750019','69370226','both','available',NULL,'2025-06-03 04:08:47'),(36,6,'03750020','40875996','both','available',NULL,'2025-06-03 04:08:58'),(37,5,'03760001','14302458','both','available',NULL,'2025-06-05 03:23:15'),(38,5,'03760002','90176617','both','available',NULL,'2025-06-05 03:23:54'),(39,5,'03760004','59654282','both','available',NULL,'2025-06-05 03:24:06'),(40,5,'03760005','09956732','both','available',NULL,'2025-06-05 03:24:26'),(41,5,'03760006','49270970','both','available',NULL,'2025-06-05 03:24:38'),(42,5,'03760007','45054121','both','available',NULL,'2025-06-05 03:24:50'),(43,5,'03760008','18417105','both','available',NULL,'2025-06-05 03:25:00'),(44,5,'03760009','64718864','both','available',NULL,'2025-06-05 03:25:10'),(45,5,'03760010','13616446','both','available',NULL,'2025-06-05 03:25:21'),(46,5,'03760012','00859827','both','available',NULL,'2025-06-05 03:25:30'),(47,5,'03760013','36562918','both','available',NULL,'2025-06-05 03:25:42'),(48,5,'03760014','37032220','both','available',NULL,'2025-06-05 03:25:53'),(49,5,'03760015','55758113','both','available',NULL,'2025-06-05 03:26:02'),(50,5,'03760016','32010009','both','available',NULL,'2025-06-05 03:26:12'),(51,5,'03760017','97752235','both','available',NULL,'2025-06-05 03:26:20'),(52,5,'03760018','88113683','both','available',NULL,'2025-06-05 03:26:31'),(53,5,'03760019','35941665','both','available',NULL,'2025-06-05 03:26:40'),(54,5,'03760020','02530663','both','available',NULL,'2025-06-05 03:26:48'),(55,7,'03770001','24685354','both','available',NULL,'2025-06-05 03:28:38'),(56,7,'03770002','91402739','both','available',NULL,'2025-06-05 03:28:49'),(57,7,'03770003','18085758','both','available',NULL,'2025-06-05 03:29:01'),(58,7,'03770004','84753833','both','available',NULL,'2025-06-05 03:29:12'),(59,7,'03770005','84297174','both','available',NULL,'2025-06-05 03:29:20'),(60,7,'03770006','97843028','both','available',NULL,'2025-06-05 03:29:28'),(61,7,'03770007','95365869','both','available',NULL,'2025-06-05 03:29:35'),(62,7,'03770008','82475594','both','available',NULL,'2025-06-05 03:29:44'),(63,7,'03770009','09895430','both','available',NULL,'2025-06-05 03:29:52'),(64,7,'03770010','31362295','both','available',NULL,'2025-06-05 03:29:59'),(65,7,'03770011','06837639','both','available',NULL,'2025-06-05 03:30:09'),(66,7,'03770012','59202654','both','available',NULL,'2025-06-05 03:30:19'),(67,7,'03770013','05753498','both','available',NULL,'2025-06-05 03:30:29'),(68,7,'03770014','42927195','both','available',NULL,'2025-06-05 03:30:39'),(69,7,'03770015','29691312','both','available',NULL,'2025-06-05 03:30:46'),(70,7,'03170016','50784954','both','available',NULL,'2025-06-05 03:30:54'),(71,7,'03770017','11856951','both','available',NULL,'2025-06-05 03:31:01'),(72,7,'03770018','15950432','both','available',NULL,'2025-06-05 03:31:08'),(73,7,'03770019','05527155','both','available',NULL,'2025-06-05 03:31:18'),(74,7,'03770020','33964060','both','available',NULL,'2025-06-05 03:31:26');
/*!40000 ALTER TABLE `caller_channels` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `caller_ids`
--

LOCK TABLES `caller_ids` WRITE;
/*!40000 ALTER TABLE `caller_ids` DISABLE KEYS */;
INSERT INTO `caller_ids` VALUES (5,'03-5579-2716','PBX②初期テスト','PBX','ito258258.site',1,'2025-05-30 15:44:16'),(6,'03-3528-9359','PBX①D社テスト','PBX','ito253258.site',1,'2025-06-02 14:11:02'),(7,'03-5946-8411','PBX③未使用','PBX','ito258258.site',1,'2025-06-05 03:28:26');
/*!40000 ALTER TABLE `caller_ids` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-06-09 10:28:59
