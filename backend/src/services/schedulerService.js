const schedule = require('node-schedule');
const logger = require('./logger');
const dialerService = require('./dialerService');
const db = require('./database');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
  }

  async initialize() {
    try {
      // 起動時にスケジュールされたキャンペーンを確認
      const scheduledCampaigns = await db.query(`
        SELECT * FROM campaigns 
        WHERE status = 'scheduled' 
        AND schedule_start <= NOW() 
        AND schedule_end >= NOW()
      `);

      for (const campaign of scheduledCampaigns) {
        this.scheduleCampaign(campaign);
      }

      logger.info('スケジューラーサービスを初期化しました');
    } catch (error) {
      logger.error('スケジューラー初期化エラー:', error);
    }
  }

  scheduleCampaign(campaign) {
    const { id, schedule_start, schedule_end, working_hours_start, working_hours_end } = campaign;
    
    // 既存のジョブがあれば削除
    if (this.jobs.has(id)) {
      this.jobs.get(id).cancel();
    }

    // 開始時刻のスケジュール
    const startDate = new Date(schedule_start);
    const startJob = schedule.scheduleJob(startDate, async () => {
      await dialerService.startCampaign(id);
      logger.info(`キャンペーン ${id} を開始しました`);
    });

    // 終了時刻のスケジュール
    const endDate = new Date(schedule_end);
    const endJob = schedule.scheduleJob(endDate, async () => {
      await dialerService.pauseCampaign(id);
      logger.info(`キャンペーン ${id} を終了しました`);
    });

    // 営業時間内の発信制御
    const rule = new schedule.RecurrenceRule();
    rule.hour = parseInt(working_hours_start.split(':')[0]);
    rule.minute = parseInt(working_hours_start.split(':')[1]);
    
    const dailyStartJob = schedule.scheduleJob(rule, async () => {
      if (await this.isCampaignActive(id)) {
        await dialerService.resumeCampaign(id);
        logger.info(`キャンペーン ${id} の営業時間を開始しました`);
      }
    });

    const endRule = new schedule.RecurrenceRule();
    endRule.hour = parseInt(working_hours_end.split(':')[0]);
    endRule.minute = parseInt(working_hours_end.split(':')[1]);
    
    const dailyEndJob = schedule.scheduleJob(endRule, async () => {
      if (await this.isCampaignActive(id)) {
        await dialerService.pauseCampaign(id);
        logger.info(`キャンペーン ${id} の営業時間を終了しました`);
      }
    });

    this.jobs.set(id, {
      startJob,
      endJob,
      dailyStartJob,
      dailyEndJob
    });
  }

  async isCampaignActive(campaignId) {
    const [campaign] = await db.query('SELECT status FROM campaigns WHERE id = ?', [campaignId]);
    return campaign && campaign.status === 'active';
  }

  cancelCampaignSchedule(campaignId) {
    if (this.jobs.has(campaignId)) {
      const jobs = this.jobs.get(campaignId);
      Object.values(jobs).forEach(job => job.cancel());
      this.jobs.delete(campaignId);
      logger.info(`キャンペーン ${campaignId} のスケジュールをキャンセルしました`);
    }
  }
}

module.exports = new SchedulerService();