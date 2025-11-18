// XKCD official comic crawler

import { Database } from '../database';
import { BaseCrawler } from './base';
import { CrawlResult, CrawlStatus, XkcdComicData } from './types';
import { Comic } from '../types';
import { sendNewComicNotification } from '../utils/lambda-fcm';

export class XkcdCrawler extends BaseCrawler {
  constructor(db: Database, env?: any) {
    super(db, 'xkcd', env);
  }

  async crawl(): Promise<CrawlResult> {
    const startTime = Date.now();
    let itemsProcessed = 0;
    let itemsAdded = 0;
    let itemsUpdated = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    try {
      console.log();

      // Get latest comic ID from XKCD
      const latestComicId = await this.getLatestComicId();

      // Get current latest comic ID from database
      const currentLatest = await this.getCurrentLatestComicId();

      if (latestComicId <= currentLatest) {
        console.log(`Starting XKCD comic crawl, Latest comic ID: ${latestComicId}, Current latest comic ID in database: ${currentLatest}, No new comics to crawl`);
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
      console.log(`Crawling comics ${startId} to ${latestComicId} (${totalToCrawl} comics)`);

      // Crawl comics in batches
      const batchSize = 10;
      for (let currentId = startId; currentId <= latestComicId; currentId += batchSize) {
        const endId = Math.min(currentId + batchSize - 1, latestComicId);
        console.log(`Processing batch: ${currentId} to ${endId}`);

        const batchResults = await this.crawlBatch(currentId, endId);
        itemsProcessed += batchResults.processed;
        itemsAdded += batchResults.added;
        itemsUpdated += batchResults.updated;
        errors += batchResults.errors;
        errorDetails.push(...batchResults.errorDetails);

        // Add delay between batches to be respectful
        if (currentId + batchSize <= latestComicId) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`Crawl completed. Processed: ${itemsProcessed}, Added: ${itemsAdded}, Updated: ${itemsUpdated}, Errors: ${errors}`);

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
      console.warn(`Failed to get current latest comic ID: ${error}`);
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
        console.log(`Crawling comic ${comicId}`);
        
        const comicData = await this.getComicData(comicId);
        const comic = this.transformComicData(comicData);
        
        // Check if comic already exists
        const existingComic = await this.db.getComic(comicId);
        
        if (existingComic) {
          // Update existing comic
          await this.db.insertComic(comic);
          updated++;
          console.log(`Updated comic ${comicId}: ${comic.title}`);
        } else {
          // Add new comic
          await this.db.insertComic(comic);
          added++;
          console.log(`Added comic ${comicId}: ${comic.title}`);
          
          // Send FCM notification if enabled
          const fcmConfig = this.getFcmConfig();
          if (fcmConfig) {
            try {
              await sendNewComicNotification(
                fcmConfig.url,
                fcmConfig.apiKey,
                {
                  num: comic.id,
                  title: comic.title,
                  img: comic.img,
                  alt: comic.alt,
                  year: comic.year,
                  month: comic.month,
                  day: comic.day,
                  width: comic.width,
                  height: comic.height,
                },
                {
                  testMode: fcmConfig.testMode,
                  testToken: fcmConfig.testToken,
                }
              );
              console.log(`Sent FCM notification for comic ${comicId}${fcmConfig.testMode ? ' (TEST MODE)' : ''}`);
            } catch (error) {
              // Log error but don't fail the crawl
              console.warn(`Failed to send FCM notification for comic ${comicId}: ${error}`);
            }
          }
        }
        
        processed++;
      } catch (error) {
        errors++;
        const errorMsg = `Failed to crawl comic ${comicId}: ${error}`;
        errorDetails.push(errorMsg);
        console.error(errorMsg);
        await this.recordError('COMIC_CRAWL_ERROR', errorMsg, (error as Error).stack);
      }
    }

    return { processed, added, updated, errors, errorDetails };
  }

  private transformComicData(data: XkcdComicData): Omit<Comic, 'created_at' | 'updated_at'> {
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
      safe_title: data.safe_title || '',
      width: data.width || 0,
      height: data.height || 0
    };
  }

  async getStatus(): Promise<CrawlStatus> {
    // Simplified status - no longer tracking tasks in database
    return {
      is_running: false,
      last_run: undefined,
      next_run: undefined,
      total_tasks: 0,
      completed_tasks: 0,
      failed_tasks: 0,
      last_error: undefined
    };
  }

  async getLogs(limit: number = 50): Promise<any[]> {
    // Simplified - no longer storing logs in database
    return [];
  }
}
