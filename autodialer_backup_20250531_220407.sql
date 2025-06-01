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
-- Dumping data for table `audio_files`
--

LOCK TABLES `audio_files` WRITE;
/*!40000 ALTER TABLE `audio_files` DISABLE KEYS */;
INSERT INTO `audio_files` VALUES ('1eafe0ce-cfd5-4bd7-944b-fb5288171f71','549444996463302','1eafe0ce-cfd5-4bd7-944b-fb5288171f71-549444996463302.wav','/var/www/autodialer/backend/audio-files/1eafe0ce-cfd5-4bd7-944b-fb5288171f71-549444996463302.wav','audio/wav',600478,NULL,'','2025-05-30 10:23:19'),('2199a6a9-ad9d-407f-a040-bd02df762bb3','549444996463302','2199a6a9-ad9d-407f-a040-bd02df762bb3-549444996463302.wav','/var/www/autodialer/backend/audio-files/2199a6a9-ad9d-407f-a040-bd02df762bb3-549444996463302.wav','audio/wav',600478,NULL,'','2025-05-29 15:31:11'),('384f256c-26a2-4818-86e3-fbc83ef2bd9f','549444996463302','384f256c-26a2-4818-86e3-fbc83ef2bd9f-549444996463302.wav','/var/www/autodialer/backend/audio-files/384f256c-26a2-4818-86e3-fbc83ef2bd9f-549444996463302.wav','audio/wav',600478,NULL,'','2025-05-29 15:22:48'),('test-audio-001','テスト音声ファイル','welcome-test.wav','/var/www/autodialer/backend/audio-files/welcome-test.wav','audio/wav',8000,NULL,'テスト用音声メッセージ','2025-05-31 01:21:17');
/*!40000 ALTER TABLE `audio_files` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `audio_playback_logs`
--

LOCK TABLES `audio_playback_logs` WRITE;
/*!40000 ALTER TABLE `audio_playback_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `audio_playback_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
  PRIMARY KEY (`id`),
  UNIQUE KEY `call_id` (`call_id`),
  KEY `campaign_id` (`campaign_id`),
  KEY `contact_id` (`contact_id`),
  KEY `caller_id_id` (`caller_id_id`),
  CONSTRAINT `call_logs_ibfk_1` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns` (`id`),
  CONSTRAINT `call_logs_ibfk_2` FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`),
  CONSTRAINT `call_logs_ibfk_3` FOREIGN KEY (`caller_id_id`) REFERENCES `caller_ids` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=91 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `call_logs`
--

LOCK TABLES `call_logs` WRITE;
/*!40000 ALTER TABLE `call_logs` DISABLE KEYS */;
INSERT INTO `call_logs` VALUES (1,'sip-1748576013660-5306',NULL,NULL,NULL,'05018086649','2025-05-30 03:33:38','2025-05-30 03:34:06',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 03:33:38'),(2,'sip-1748577083746-9086',NULL,NULL,NULL,'05018086649','2025-05-30 03:51:23','2025-05-30 03:51:24',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 03:51:23'),(3,'sip-mock-1748580367171',NULL,NULL,NULL,'09012345678','2025-05-30 04:46:07','2025-05-30 04:46:17',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 04:46:07'),(4,'sip-mock-1748580403208',NULL,NULL,NULL,'09012345678','2025-05-30 04:46:43','2025-05-30 04:46:53',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 04:46:43'),(5,'sip-mock-1748580404215',NULL,NULL,NULL,'09012345678','2025-05-30 04:46:44','2025-05-30 04:46:54',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 04:46:44'),(6,'sip-1748580494255-3353',NULL,NULL,NULL,'05018086649','2025-05-30 04:48:14','2025-05-30 04:48:15',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 04:48:14'),(9,'sip-1748611763715-2573',NULL,NULL,NULL,'05018086649','2025-05-30 13:29:24','2025-05-30 13:29:25',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 13:29:24'),(10,'sip-1748612606422-4887',NULL,NULL,NULL,'05018086649','2025-05-30 13:43:27','2025-05-30 13:43:28',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 13:43:27'),(16,'sip-1748615041477-1764',NULL,NULL,NULL,'05018086649','2025-05-30 14:24:02','2025-05-30 14:24:03',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 14:24:02'),(19,'sip-1748616702929-626',NULL,NULL,NULL,'05018086649','2025-05-30 14:51:43','2025-05-30 14:51:44',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 14:51:43'),(23,'sip-1748619949318-7025',NULL,NULL,5,'05018086649','2025-05-30 15:45:50','2025-05-30 15:45:51',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 15:45:50'),(25,'sip-1748620172240-3678',NULL,NULL,NULL,'05018086649','2025-05-30 15:49:33','2025-05-30 15:49:34',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 15:49:33'),(26,'sip-1748620387983-2418',NULL,NULL,NULL,'05018086649','2025-05-30 15:53:09','2025-05-30 15:53:10',10,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-30 15:53:09'),(28,'sip-1748652730578-261',NULL,NULL,NULL,'05018086649','2025-05-31 00:52:15','2025-05-31 00:52:56',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 00:52:15'),(29,'sip-1748653332198-2501',NULL,NULL,NULL,'05018086649','2025-05-31 01:02:17','2025-05-31 01:02:58',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:02:17'),(30,'sip-1748654047375-8613',NULL,NULL,5,'05018086649','2025-05-31 01:14:12','2025-05-31 01:14:53',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:14:12'),(31,'sip-1748654173733-7237',NULL,NULL,5,'05018086649','2025-05-31 01:16:18','2025-05-31 01:16:59',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:16:18'),(32,'sip-1748654315368-749',NULL,NULL,5,'05018086649','2025-05-31 01:18:40','2025-05-31 01:19:21',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:18:40'),(33,'sip-1748654504518-7824',NULL,NULL,5,'05018086649','2025-05-31 01:21:49','2025-05-31 01:22:30',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:21:49'),(34,'sip-1748654526478-484',NULL,NULL,5,'05018086649','2025-05-31 01:22:07','2025-05-31 01:22:08',30,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:22:07'),(35,'sip-1748655471198-9911',NULL,NULL,5,'05018086649','2025-05-31 01:37:56','2025-05-31 01:38:37',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:37:56'),(36,'sip-1748655566299-1053',NULL,NULL,NULL,'05018086649','2025-05-31 01:39:31','2025-05-31 01:40:12',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:39:31'),(37,'sip-1748655628842-3193',NULL,NULL,NULL,'05018086649','2025-05-31 01:40:33','2025-05-31 01:41:14',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:40:33'),(38,'sip-1748656199866-6941',NULL,NULL,5,'05018086649','2025-05-31 01:50:04','2025-05-31 01:50:45',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 01:50:04'),(44,'sip-1748658788044-3471',NULL,NULL,5,'05018086649','2025-05-31 02:33:13','2025-05-31 02:33:54',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 02:33:13'),(48,'sip-1748662048292-2688',NULL,NULL,5,'05018086649','2025-05-31 03:27:30','2025-05-31 03:27:46',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 03:27:30'),(49,'sip-1748662355169-6048',NULL,NULL,5,'05018086649','2025-05-31 03:32:36','2025-05-31 03:32:38',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 03:32:36'),(52,'sip-1748664828762-5461',NULL,NULL,NULL,'05018086649','2025-05-31 04:13:50','2025-05-31 04:13:50',0,'FAILED',NULL,'sip',0,0,NULL,1,'2025-05-31 04:13:50'),(53,'sip-1748664850124-9100',NULL,NULL,NULL,'05018086649','2025-05-31 04:14:12','2025-05-31 04:14:28',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 04:14:12'),(55,'sip-1748665461084-2130',NULL,NULL,NULL,'05018086649','2025-05-31 04:24:23','2025-05-31 04:24:39',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 04:24:23'),(56,'sip-1748665956787-3521',22,21,5,'05018086649','2025-05-31 04:32:36',NULL,0,'ORIGINATING',NULL,'sip',1,1,NULL,0,'2025-05-31 04:32:36'),(58,'sip-1748668136530-9632',NULL,NULL,NULL,'09012345678','2025-05-31 05:08:58','2025-05-31 05:09:14',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 05:08:58'),(61,'sip-1748669737488-7493',NULL,NULL,NULL,'09012345678','2025-05-31 05:35:39','2025-05-31 05:35:55',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 05:35:39'),(62,'sip-1748669901668-7058',NULL,NULL,NULL,'05018086649','2025-05-31 05:38:23','2025-05-31 05:38:39',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 05:38:23'),(63,'sip-1748672398769-1110',NULL,NULL,NULL,'05018086649','2025-05-31 06:20:00','2025-05-31 06:20:16',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 06:20:00'),(64,'sip-1748675082986-8901',NULL,NULL,NULL,'05018086649','2025-05-31 07:04:44','2025-05-31 07:05:00',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 07:04:44'),(65,'sip-1748676051395-2985',NULL,NULL,NULL,'05018086649','2025-05-31 07:20:53','2025-05-31 07:21:09',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 07:20:53'),(66,'sip-1748676164776-3424',NULL,NULL,NULL,'05018086649','2025-05-31 07:22:46','2025-05-31 07:23:02',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 07:22:46'),(67,'sip-1748676653333-4439',NULL,NULL,NULL,'05018086649','2025-05-31 07:30:55','2025-05-31 07:31:11',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 07:30:55'),(68,'sip-1748676723131-5754',NULL,NULL,NULL,'05018086649','2025-05-31 07:32:05','2025-05-31 07:32:21',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 07:32:05'),(69,'sip-1748676857163-3321',NULL,NULL,NULL,'05018086649','2025-05-31 07:34:19','2025-05-31 07:34:35',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 07:34:19'),(72,'sip-1748684703245-815',NULL,NULL,NULL,'05018086649','2025-05-31 09:45:05','2025-05-31 09:45:21',15,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 09:45:05'),(73,'sip-1748685969037-5339',28,27,5,'05018086649','2025-05-31 10:06:12','2025-05-31 10:06:13',30,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 10:06:12'),(74,'sip-1748686103004-2954',NULL,NULL,NULL,'05018086649','2025-05-31 10:08:26','2025-05-31 10:08:27',30,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 10:08:26'),(75,'sip-1748686813013-7142',NULL,NULL,NULL,'05018086649','2025-05-31 10:20:16','2025-05-31 10:20:17',30,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 10:20:16'),(76,'sip-1748686958350-1804',NULL,NULL,NULL,'05018086649','2025-05-31 10:22:41','2025-05-31 10:22:42',30,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 10:22:41'),(77,'sip-1748687084996-6379',28,27,5,'05018086649','2025-05-31 10:24:48','2025-05-31 10:24:49',30,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 10:24:48'),(78,'sip-1748687155006-4603',28,27,5,'05018086649','2025-05-31 10:25:58','2025-05-31 10:25:59',30,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 10:25:58'),(79,'sip-1748687170005-3626',28,27,5,'05018086649','2025-05-31 10:26:13','2025-05-31 10:26:14',30,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 10:26:13'),(80,'sip-1748687698869-4902',NULL,NULL,NULL,'05018086649','2025-05-31 10:34:59',NULL,0,'ORIGINATING',NULL,'sip',0,0,NULL,1,'2025-05-31 10:34:59'),(81,'sip-1748687704747-8155',28,27,5,'05018086649','2025-05-31 10:35:05',NULL,0,'ORIGINATING',NULL,'sip',1,1,NULL,0,'2025-05-31 10:35:05'),(82,'sip-1748687774754-5825',29,28,5,'05018086649','2025-05-31 10:36:15',NULL,0,'ORIGINATING',NULL,'sip',1,1,NULL,0,'2025-05-31 10:36:15'),(83,'sip-1748688376373-8620',NULL,NULL,NULL,'05018086649','2025-05-31 10:46:20',NULL,0,'ORIGINATING',NULL,'sip',0,0,NULL,1,'2025-05-31 10:46:20'),(84,'sip-1748688653889-5148',31,30,5,'05018086649','2025-05-31 10:50:58',NULL,0,'ORIGINATING',NULL,'sip',1,1,NULL,0,'2025-05-31 10:50:58'),(85,'sip-1748702326970-1688',32,31,5,'05018086649','2025-05-31 14:38:56','2025-05-31 14:39:26',35,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 14:38:56'),(86,'sip-1748703152728-3808',33,32,5,'05018086649','2025-05-31 14:52:42','2025-05-31 14:53:12',35,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 14:52:42'),(87,'sip-1748706763666-8944',34,33,5,'05018086649','2025-05-31 15:52:53','2025-05-31 15:53:23',35,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 15:52:53'),(88,'sip-1748707273218-4508',NULL,NULL,5,'08012345678','2025-05-31 16:01:23','2025-05-31 16:01:53',35,'ANSWERED',NULL,'sip',0,0,NULL,1,'2025-05-31 16:01:23'),(89,'sip-1748707843864-4973',35,34,5,'05018086649','2025-05-31 16:10:53','2025-05-31 16:11:23',35,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 16:10:53'),(90,'sip-1748727150447-1790',36,35,5,'05018086649','2025-05-31 21:32:40','2025-05-31 21:33:10',35,'ANSWERED',NULL,'sip',1,1,NULL,0,'2025-05-31 21:32:40');
/*!40000 ALTER TABLE `call_logs` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caller_channels`
--

LOCK TABLES `caller_channels` WRITE;
/*!40000 ALTER TABLE `caller_channels` DISABLE KEYS */;
INSERT INTO `caller_channels` VALUES (12,5,'03760002','90176617','both','available',NULL,'2025-05-30 15:44:50'),(13,5,'03760003','40486119','both','available',NULL,'2025-05-30 15:45:08'),(14,5,'03760004','59654282','both','available',NULL,'2025-05-30 15:45:24'),(15,5,'03760005','09956732','both','available',NULL,'2025-05-30 15:45:40');
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `caller_ids`
--

LOCK TABLES `caller_ids` WRITE;
/*!40000 ALTER TABLE `caller_ids` DISABLE KEYS */;
INSERT INTO `caller_ids` VALUES (5,'0359468411','PBX2','PBX','ito258258.site',1,'2025-05-30 15:44:16');
/*!40000 ALTER TABLE `caller_ids` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB AUTO_INCREMENT=40 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `campaign_audio`
--

LOCK TABLES `campaign_audio` WRITE;
/*!40000 ALTER TABLE `campaign_audio` DISABLE KEYS */;
INSERT INTO `campaign_audio` VALUES (23,22,'384f256c-26a2-4818-86e3-fbc83ef2bd9f','welcome','2025-05-31 04:32:12'),(31,28,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 10:05:51'),(32,29,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 10:36:00'),(33,30,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 10:41:36'),(34,31,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 10:50:46'),(35,32,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 14:38:27'),(36,33,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 14:52:24'),(37,34,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 15:52:29'),(38,35,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 16:10:29'),(39,36,'2199a6a9-ad9d-407f-a040-bd02df762bb3','welcome','2025-05-31 21:32:20');
/*!40000 ALTER TABLE `campaign_audio` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `campaign_ivr_config`
--

LOCK TABLES `campaign_ivr_config` WRITE;
/*!40000 ALTER TABLE `campaign_ivr_config` DISABLE KEYS */;
/*!40000 ALTER TABLE `campaign_ivr_config` ENABLE KEYS */;
UNLOCK TABLES;

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
  PRIMARY KEY (`id`),
  KEY `caller_id_id` (`caller_id_id`),
  CONSTRAINT `campaigns_ibfk_1` FOREIGN KEY (`caller_id_id`) REFERENCES `caller_ids` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `campaigns`
--

LOCK TABLES `campaigns` WRITE;
/*!40000 ALTER TABLE `campaigns` DISABLE KEYS */;
INSERT INTO `campaigns` VALUES (22,'みの','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 04:31:57','2025-05-31 09:47:43'),(28,'テスト','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 10:05:26','2025-05-31 10:05:53'),(29,'テスト太郎','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 10:35:42','2025-05-31 10:36:01'),(30,'テスト5','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 10:41:18','2025-05-31 10:41:38'),(31,'テスト','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 10:50:31','2025-05-31 10:50:48'),(32,'テスト3','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 14:38:07','2025-05-31 14:38:30'),(33,'テスト10','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 14:52:04','2025-05-31 14:52:26'),(34,'テスト','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 15:51:54','2025-05-31 15:52:32'),(35,'テスト','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 16:10:11','2025-05-31 16:10:31'),(36,'テスト11','','active',5,'',0,5,NULL,NULL,'09:00:00','18:00:00',0,0,NULL,'2025-05-31 21:31:53','2025-05-31 21:32:23');
/*!40000 ALTER TABLE `campaigns` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contacts`
--

DROP TABLE IF EXISTS `contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contacts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `campaign_id` int DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
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
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contacts`
--

LOCK TABLES `contacts` WRITE;
/*!40000 ALTER TABLE `contacts` DISABLE KEYS */;
INSERT INTO `contacts` VALUES (21,22,'05018086649','','','called','2025-05-31 04:32:36',1,NULL,'2025-05-31 04:32:08','2025-05-31 04:32:36'),(27,28,'05018086649','','','called','2025-05-31 10:35:04',1,NULL,'2025-05-31 10:05:44','2025-05-31 10:35:04'),(28,29,'05018086649','','','called','2025-05-31 10:36:14',1,NULL,'2025-05-31 10:35:56','2025-05-31 10:36:14'),(29,30,'05018086649','','','called','2025-05-31 10:41:46',1,NULL,'2025-05-31 10:41:31','2025-05-31 10:41:46'),(30,31,'05018086649','','','called','2025-05-31 10:50:53',1,NULL,'2025-05-31 10:50:42','2025-05-31 10:50:53'),(31,32,'05018086649','','','called','2025-05-31 14:38:46',1,NULL,'2025-05-31 14:38:22','2025-05-31 14:38:46'),(32,33,'05018086649','','','called','2025-05-31 14:52:32',1,NULL,'2025-05-31 14:52:19','2025-05-31 14:52:32'),(33,34,'05018086649','','','called','2025-05-31 15:52:43',1,NULL,'2025-05-31 15:52:25','2025-05-31 15:52:43'),(34,35,'05018086649','','','called','2025-05-31 16:10:43',1,NULL,'2025-05-31 16:10:24','2025-05-31 16:10:43'),(35,36,'05018086649','','','called','2025-05-31 21:32:30',1,NULL,'2025-05-31 21:32:14','2025-05-31 21:32:30');
/*!40000 ALTER TABLE `contacts` ENABLE KEYS */;
UNLOCK TABLES;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dnc_list`
--

LOCK TABLES `dnc_list` WRITE;
/*!40000 ALTER TABLE `dnc_list` DISABLE KEYS */;
/*!40000 ALTER TABLE `dnc_list` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `operator_call_logs`
--

LOCK TABLES `operator_call_logs` WRITE;
/*!40000 ALTER TABLE `operator_call_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `operator_call_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `operator_shifts`
--

LOCK TABLES `operator_shifts` WRITE;
/*!40000 ALTER TABLE `operator_shifts` DISABLE KEYS */;
/*!40000 ALTER TABLE `operator_shifts` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `operator_status_logs`
--

LOCK TABLES `operator_status_logs` WRITE;
/*!40000 ALTER TABLE `operator_status_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `operator_status_logs` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `operators`
--

LOCK TABLES `operators` WRITE;
/*!40000 ALTER TABLE `operators` DISABLE KEYS */;
/*!40000 ALTER TABLE `operators` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('admin','user','operator') COLLATE utf8mb4_unicode_ci DEFAULT 'user',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `last_login` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-05-31 22:04:07
