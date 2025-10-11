// zh-CN localized crawler using xkcd.in as source (CPU-friendly)

import { Database } from '../database';
import { BaseCrawler } from './base';
import { CrawlResult, CrawlStatus } from './types';

export class LocalizedZhCnCrawler extends BaseCrawler {
  constructor(db: Database) {
    super(db, 'localized');
  }

  async crawl(): Promise<CrawlResult> {
    const startTime = Date.now();
    let itemsProcessed = 0;
    let itemsAdded = 0;
    let itemsUpdated = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    try {
      await this.createTask();
      await this.updateTaskStatus('running', 0);
      await this.log('info', 'Starting zh-CN localized crawl (xkcd.in)');

      const currentLatestLocalized = await this.getCurrentLatestLocalizedId();
      const latestOriginal = await this.getLatestOriginalId();
      if (latestOriginal <= currentLatestLocalized) {
        await this.log('info', 'No new comics to localize (zh-CN)');
        await this.updateTaskStatus('completed', 100);
        return {
          success: true,
          items_processed: 0,
          items_added: 0,
          items_updated: 0,
          errors: 0,
          duration: Date.now() - startTime
        };
      }

      const startId = currentLatestLocalized + 1;
      const endId = latestOriginal;
      const totalToProcess = endId - startId + 1;
      await this.log('info', `Processing zh-CN localized comics ${startId}..${endId}`);

      for (let id = startId; id <= endId; id++) {
        try {
          // Fetch original minimal metadata to avoid heavy HTML parsing
          const info = await this.fetchOriginalInfo(id);
          if (!info) {
            await this.log('warn', `Original comic ${id} not found, skip`);
          } else {
            // Try lightweight probe to xkcd.in page (HEAD) to set source_url availability
            const sourceUrl = `https://xkcd.in/comic/${id}/`;
            let available = false;
            try {
              const head = await fetch(sourceUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
              available = head.ok;
            } catch (_) { /* ignore */ }

            const localized = {
              id,
              title: info.safe_title || info.title || '',
              alt: info.alt || '',
              img: info.img || '', // do not store image content
              transcript: '', // placeholder until full parser added
              source_url: available ? sourceUrl : ''
            };

            // Upsert
            const exists = await this.db.getLocalizedComic(id, 'zh-cn');
            await this.db.insertLocalizedComic(localized, 'zh-cn');
            if (exists) {
              itemsUpdated++;
              await this.log('info', `Updated zh-CN localized ${id}: ${localized.title}`);
            } else {
              itemsAdded++;
              await this.log('info', `Added zh-CN localized ${id}: ${localized.title}`);
            }
          }
          itemsProcessed++;
        } catch (error) {
          errors++;
          const msg = `Failed to process zh-CN localized ${id}: ${error}`;
          errorDetails.push(msg);
          await this.log('error', msg);
          await this.recordError('LOCALIZED_CRAWL_ERROR', msg, (error as Error).stack);
        }

        // Progress + gentle pacing (avoid CPU spikes and subrequest limits)
        const processed = id - startId + 1;
        await this.updateProgress(processed, totalToProcess);
        if (id < endId) {
          await new Promise(r => setTimeout(r, 1000)); // 1s between items
        }
      }

      await this.log('info', `zh-CN crawl completed. Processed: ${itemsProcessed}, Added: ${itemsAdded}, Updated: ${itemsUpdated}, Errors: ${errors}`);
      await this.updateTaskStatus('completed', 100);

      return {
        success: errors === 0,
        items_processed: itemsProcessed,
        items_added: itemsAdded,
        items_updated: itemsUpdated,
        errors,
        duration: Date.now() - startTime,
        error_details: errorDetails.length ? errorDetails : undefined
      };
    } catch (error) {
      await this.recordError('CRAWL_ERROR', `zh-CN crawl failed: ${error}`, (error as Error).stack);
      await this.updateTaskStatus('failed', undefined, (error as Error).message);
      return {
        success: false,
        items_processed: itemsProcessed,
        items_added: itemsAdded,
        items_updated: itemsUpdated,
        errors: errors + 1,
        duration: Date.now() - startTime,
        error_details: [...errorDetails, (error as Error).message]
      };
    }
  }

  private async getCurrentLatestLocalizedId(): Promise<number> {
    try {
      const row = await this.db.db.prepare('SELECT MAX(id) as max_id FROM comics_zh_cn').first();
      return (row as any)?.max_id || 0;
    } catch (e) {
      await this.log('warn', `Failed to get current latest zh-CN id: ${e}`);
      return 0;
    }
  }

  private async getLatestOriginalId(): Promise<number> {
    try {
      const row = await this.db.db.prepare('SELECT MAX(id) as max_id FROM comics').first();
      return (row as any)?.max_id || 0;
    } catch (e) {
      await this.log('warn', `Failed to get latest original id: ${e}`);
      return 0;
    }
  }

  private async fetchOriginalInfo(id: number): Promise<any | null> {
    try {
      const resp = await fetch(`https://xkcd.com/${id}/info.0.json`, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    }
  }

  async getStatus(): Promise<CrawlStatus> {
    try {
      const latestTask = await this.db.db.prepare(`
        SELECT * FROM crawl_tasks 
        WHERE type = 'localized' 
        ORDER BY created_at DESC 
        LIMIT 1
      `).first();

      const stats = await this.db.db.prepare(`
        SELECT 
          COUNT(*) as total_tasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks
        FROM crawl_tasks 
        WHERE type = 'localized'
      `).first();

      const lastError = await this.db.db.prepare(`
        SELECT error_message 
        FROM crawl_tasks 
        WHERE type = 'localized' AND status = 'failed' 
        ORDER BY created_at DESC 
        LIMIT 1
      `).first();

      const isRunning = latestTask ? (latestTask as any).status === 'running' : false;
      const lastRun = latestTask ? new Date((latestTask as any).created_at) : undefined;
      const nextRun = lastRun ? new Date(lastRun.getTime() + 24 * 60 * 60 * 1000) : undefined;

      return {
        is_running: isRunning,
        last_run: lastRun,
        next_run: nextRun,
        total_tasks: (stats as any)?.total_tasks || 0,
        completed_tasks: (stats as any)?.completed_tasks || 0,
        failed_tasks: (stats as any)?.failed_tasks || 0,
        last_error: (lastError as any)?.error_message
      };
    } catch (error) {
      await this.log('error', `Failed to get zh-CN status: ${error}`);
      throw error;
    }
  }

  async getLogs(limit: number = 50): Promise<any[]> {
    try {
      const result = await this.db.db.prepare(`
        SELECT * FROM crawl_logs 
        WHERE task_id IN (
          SELECT id FROM crawl_tasks WHERE type = 'localized'
        )
        ORDER BY timestamp DESC 
        LIMIT ?
      `).bind(limit).all();

      return result.results || [];
    } catch (error) {
      await this.log('error', `Failed to get zh-CN logs: ${error}`);
      throw error;
    }
  }
}


