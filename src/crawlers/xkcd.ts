// XKCD official comic crawler

import { Database } from '../database';
import { BaseCrawler } from './base';
import { CrawlResult, CrawlStatus, XkcdComicData } from './types';
import { Comic } from '../types';

export class XkcdCrawler extends BaseCrawler {
  constructor(db: Database) {
    super(db, 'xkcd');
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
      await this.log('info', 'Starting XKCD comic crawl');

      // Get latest comic ID from XKCD
      const latestComicId = await this.getLatestComicId();
      await this.log('info', `Latest comic ID: ${latestComicId}`);

      // Get current latest comic ID from database
      const currentLatest = await this.getCurrentLatestComicId();
      await this.log('info', `Current latest comic ID in database: ${currentLatest}`);

      if (latestComicId <= currentLatest) {
        await this.log('info', 'No new comics to crawl');
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

      // Determine range to crawl
      const startId = currentLatest + 1;
      const totalToCrawl = latestComicId - currentLatest;
      await this.log('info', `Crawling comics ${startId} to ${latestComicId} (${totalToCrawl} comics)`);

      // Crawl comics in batches
      const batchSize = 10;
      for (let currentId = startId; currentId <= latestComicId; currentId += batchSize) {
        const endId = Math.min(currentId + batchSize - 1, latestComicId);
        await this.log('info', `Processing batch: ${currentId} to ${endId}`);

        const batchResults = await this.crawlBatch(currentId, endId);
        itemsProcessed += batchResults.processed;
        itemsAdded += batchResults.added;
        itemsUpdated += batchResults.updated;
        errors += batchResults.errors;
        errorDetails.push(...batchResults.errorDetails);

        // Update progress
        const progress = Math.round(((currentId - startId + 1) / totalToCrawl) * 100);
        await this.updateProgress(currentId - startId + 1, totalToCrawl);

        // Add delay between batches to be respectful
        if (currentId + batchSize <= latestComicId) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      await this.log('info', `Crawl completed. Processed: ${itemsProcessed}, Added: ${itemsAdded}, Updated: ${itemsUpdated}, Errors: ${errors}`);
      await this.updateTaskStatus('completed', 100);

      return {
        success: errors === 0,
        items_processed: itemsProcessed,
        items_added: itemsAdded,
        items_updated: itemsUpdated,
        errors,
        duration: Date.now() - startTime,
        error_details: errorDetails.length > 0 ? errorDetails : undefined
      };

    } catch (error) {
      await this.recordError('CRAWL_ERROR', `Crawl failed: ${error}`, (error as Error).stack);
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

  private async getCurrentLatestComicId(): Promise<number> {
    try {
      const result = await this.db.db.prepare('SELECT MAX(id) as max_id FROM comics').first();
      return (result as any)?.max_id || 0;
    } catch (error) {
      await this.log('warn', `Failed to get current latest comic ID: ${error}`);
      return 0;
    }
  }

  private async crawlBatch(startId: number, endId: number): Promise<{
    processed: number;
    added: number;
    updated: number;
    errors: number;
    errorDetails: string[];
  }> {
    let processed = 0;
    let added = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (let comicId = startId; comicId <= endId; comicId++) {
      try {
        await this.log('info', `Crawling comic ${comicId}`);
        
        const comicData = await this.getComicData(comicId);
        const comic = this.transformComicData(comicData);
        
        // Check if comic already exists
        const existingComic = await this.db.getComic(comicId);
        
        if (existingComic) {
          // Update existing comic
          await this.db.insertComic(comic);
          updated++;
          await this.log('info', `Updated comic ${comicId}: ${comic.title}`);
        } else {
          // Add new comic
          await this.db.insertComic(comic);
          added++;
          await this.log('info', `Added comic ${comicId}: ${comic.title}`);
        }
        
        processed++;
      } catch (error) {
        errors++;
        const errorMsg = `Failed to crawl comic ${comicId}: ${error}`;
        errorDetails.push(errorMsg);
        await this.log('error', errorMsg);
        await this.recordError('COMIC_CRAWL_ERROR', errorMsg, (error as Error).stack);
      }
    }

    return { processed, added, updated, errors, errorDetails };
  }

  private transformComicData(data: any): Omit<Comic, 'created_at' | 'updated_at'> {
    return {
      id: data.num,
      title: data.title || '',
      alt: data.alt || '',
      img: data.img || '',
      transcript: data.transcript || '',
      year: data.year || 0,
      month: data.month || 0,
      day: data.day || 0,
      link: data.link || '',
      news: data.news || '',
      safe_title: data.safe_title || ''
    };
  }

  async getStatus(): Promise<CrawlStatus> {
    try {
      // Get latest task
      const latestTask = await this.db.db.prepare(`
        SELECT * FROM crawl_tasks 
        WHERE type = 'xkcd' 
        ORDER BY created_at DESC 
        LIMIT 1
      `).first();

      // Get task statistics
      const stats = await this.db.db.prepare(`
        SELECT 
          COUNT(id) as total_tasks,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks
        FROM crawl_tasks 
        WHERE type = 'xkcd'
      `).first();

      // Get last error
      const lastError = await this.db.db.prepare(`
        SELECT error_message 
        FROM crawl_tasks 
        WHERE type = 'xkcd' AND status = 'failed' 
        ORDER BY created_at DESC 
        LIMIT 1
      `).first();

      const isRunning = latestTask && (latestTask as any).status === 'running';
      const lastRun = latestTask ? new Date((latestTask as any).created_at) : undefined;
      
      // Calculate next run (assuming hourly schedule)
      const nextRun = lastRun ? new Date(lastRun.getTime() + 60 * 60 * 1000) : undefined;

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
      await this.log('error', `Failed to get status: ${error}`);
      throw error;
    }
  }

  async getLogs(limit: number = 50): Promise<any[]> {
    try {
      const result = await this.db.db.prepare(`
        SELECT * FROM crawl_logs 
        WHERE task_id IN (
          SELECT id FROM crawl_tasks WHERE type = 'xkcd'
        )
        ORDER BY timestamp DESC 
        LIMIT ?
      `).bind(limit).all();

      return result.results || [];
    } catch (error) {
      await this.log('error', `Failed to get logs: ${error}`);
      throw error;
    }
  }
}
