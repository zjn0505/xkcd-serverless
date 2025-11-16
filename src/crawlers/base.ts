// Base crawler class with common functionality

import { Database } from '../database';
import { CrawlTask, CrawlLog, CrawlError, CrawlResult, CrawlStatus } from './types';
import { getImageDimensions } from '../utils/image-probe';

export abstract class BaseCrawler {
  protected db: Database;
  protected taskId: string;
  protected taskType: 'xkcd' | 'whatif' | 'localized';

  constructor(db: Database, taskType: 'xkcd' | 'whatif' | 'localized') {
    this.db = db;
    this.taskType = taskType;
    this.taskId = this.generateTaskId();
  }

  protected generateTaskId(): string {
    return `${this.taskType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected async log(level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, any>): Promise<void> {
    const log: Omit<CrawlLog, 'id'> = {
      task_id: this.taskId,
      level,
      message,
      timestamp: new Date(),
      metadata
    };

    try {
      await this.db.db.prepare(`
        INSERT INTO crawl_logs (task_id, level, message, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        log.task_id,
        log.level,
        log.message,
        log.timestamp.toISOString(),
        metadata ? JSON.stringify(metadata) : null
      ).run();
    } catch (error) {
      console.error('Failed to log message:', error);
    }
  }

  protected async createTask(): Promise<void> {
    const task: Omit<CrawlTask, 'id'> = {
      type: this.taskType,
      status: 'pending',
      progress: 0,
      created_at: new Date(),
      updated_at: new Date()
    };

    try {
      await this.db.db.prepare(`
        INSERT INTO crawl_tasks (id, type, status, progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        this.taskId,
        task.type,
        task.status,
        task.progress,
        task.created_at.toISOString(),
        task.updated_at.toISOString()
      ).run();

      await this.log('info', `Created crawl task: ${this.taskId}`);
    } catch (error) {
      console.error('Failed to create task:', error);
      throw error;
    }
  }

  protected async updateTaskStatus(status: CrawlTask['status'], progress?: number, errorMessage?: string): Promise<void> {
    const updates: string[] = ['status = ?', 'updated_at = ?'];
    const values: any[] = [status, new Date().toISOString()];

    if (progress !== undefined) {
      updates.push('progress = ?');
      values.push(progress);
    }

    if (errorMessage) {
      updates.push('error_message = ?');
      values.push(errorMessage);
    }

    if (status === 'running') {
      updates.push('start_time = ?');
      values.push(new Date().toISOString());
    } else if (status === 'completed' || status === 'failed') {
      updates.push('end_time = ?');
      values.push(new Date().toISOString());
    }

    values.push(this.taskId);

    try {
      await this.db.db.prepare(`
        UPDATE crawl_tasks 
        SET ${updates.join(', ')}
        WHERE id = ?
      `).bind(...values).run();

      await this.log('info', `Task status updated to: ${status}`, { progress, errorMessage });
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  }

  protected async recordError(errorType: string, errorMessage: string, stackTrace?: string): Promise<void> {
    const error: Omit<CrawlError, 'id'> = {
      task_id: this.taskId,
      error_type: errorType,
      error_message: errorMessage,
      stack_trace: stackTrace,
      timestamp: new Date(),
      retry_count: 0,
      resolved: false
    };

    try {
      await this.db.db.prepare(`
        INSERT INTO crawl_errors (task_id, error_type, error_message, stack_trace, timestamp, retry_count, resolved)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        error.task_id,
        error.error_type,
        error.error_message,
        error.stack_trace,
        error.timestamp.toISOString(),
        error.retry_count,
        error.resolved
      ).run();

      await this.log('error', `Error recorded: ${errorType}`, { errorMessage, stackTrace });
    } catch (err) {
      console.error('Failed to record error:', err);
    }
  }

  protected async fetchWithRetry(url: string, options: RequestInit = {}, maxRetries: number = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.log('info', `Fetching URL (attempt ${attempt}/${maxRetries}): ${url}`);
        
        const response = await fetch(url, {
          ...options,
          headers: {
            'User-Agent': 'XKCD-Serverless-Crawler/1.0',
            ...options.headers
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        await this.log('info', `Successfully fetched URL: ${url}`);
        return response;
      } catch (error) {
        lastError = error as Error;
        await this.log('warn', `Fetch attempt ${attempt} failed: ${error}`, { url, attempt });
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await this.log('info', `Waiting ${delay}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  protected async parseJsonWithRetry<T>(response: Response, maxRetries: number = 3): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const text = await response.text();
        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error as Error;
        await this.log('warn', `JSON parse attempt ${attempt} failed: ${error}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError;
  }

  protected async getLatestComicId(): Promise<number> {
    try {
      const response = await this.fetchWithRetry('https://xkcd.com/info.0.json');
      const data = await this.parseJsonWithRetry<{ num: number }>(response);
      return data.num;
    } catch (error) {
      await this.recordError('FETCH_ERROR', `Failed to get latest comic ID: ${error}`);
      throw error;
    }
  }

  /**
   * Get comic data including image dimensions
   * Image dimensions are retrieved by only downloading image headers (efficient)
   */
  protected async getComicData(comicId: number): Promise<any> {
    try {
      const response = await this.fetchWithRetry(`https://xkcd.com/${comicId}/info.0.json`);
      const comicData: any = await this.parseJsonWithRetry(response);
      
      // Get image dimensions if image URL exists
      if (comicData.img) {
        const dimensions = await getImageDimensions(comicData.img, 10000);
        if (dimensions) {
          comicData.width = dimensions.width;
          comicData.height = dimensions.height;
          await this.log('info', `Got dimensions for comic ${comicId}: ${dimensions.width}x${dimensions.height}`);
        } else {
          await this.log('warn', `Failed to get dimensions for comic ${comicId}, continuing without dimensions`);
        }
      }
      
      return comicData;
    } catch (error) {
      await this.recordError('FETCH_ERROR', `Failed to get comic ${comicId}: ${error}`);
      throw error;
    }
  }

  protected async updateProgress(processed: number, total: number): Promise<void> {
    const progress = Math.round((processed / total) * 100);
    await this.updateTaskStatus('running', progress);
  }

  // Abstract methods to be implemented by subclasses
  abstract crawl(): Promise<CrawlResult>;
  abstract getStatus(): Promise<CrawlStatus>;
}
