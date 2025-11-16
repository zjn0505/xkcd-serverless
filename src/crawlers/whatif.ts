// What If article crawler

import { Database } from '../database';
import { BaseCrawler } from './base';
import { CrawlResult, CrawlStatus, WhatIfArticleData } from './types';
import { WhatIf } from '../types';
import { sendNewWhatIfNotification } from '../utils/lambda-fcm';

export class WhatIfCrawler extends BaseCrawler {
  constructor(db: Database, env?: any) {
    super(db, 'whatif', env);
  }

  private async extractWhatIfContent(html: string, articleId: number): Promise<WhatIfArticleData | null> {
    try {
      const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
      const title = titleMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';
      const dateMatch = html.match(/<div[^>]*class=\"date\"[^>]*>(.*?)<\/div>/is);
      const date = dateMatch?.[1]?.replace(/<[^>]*>/g, '').trim() || '';
      if (!title) return null;
      return {
        id: articleId,
        title,
        url: `https://what-if.xkcd.com/${articleId}/`,
        date
      };
    } catch (error) {
      console.error(`Failed to extract content for article ${articleId}: ${error}`);
      return null;
    }
  }

  async crawl(): Promise<CrawlResult> {
    const startTime = Date.now();
    let itemsProcessed = 0;
    let itemsAdded = 0;
    let itemsUpdated = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    try {
      console.log('Starting What If article crawl');

      // Get latest What If ID from the website
      const latestWhatIfId = await this.getLatestWhatIfId();
      console.log(`Latest What If ID: ${latestWhatIfId}`);

      // Get current latest What If ID from database
      const currentLatest = await this.getCurrentLatestWhatIfId();
      console.log(`Current latest What If ID in database: ${currentLatest}`);

      if (latestWhatIfId <= currentLatest) {
        console.log('No new What If articles to crawl');
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
      const totalToCrawl = latestWhatIfId - currentLatest;
      console.log(`Crawling What If articles ${startId} to ${latestWhatIfId} (${totalToCrawl} articles)`);

      // Process articles one at a time to minimize subrequests
      for (let currentId = startId; currentId <= latestWhatIfId; currentId++) {
        console.log(`Processing article: ${currentId}`);

        try {
          const articleData = await this.getWhatIfData(currentId);
          if (articleData && articleData.title) {
            const whatIf = this.transformWhatIfData(articleData, currentId);
            
            // Check if article already exists
            const existing = await this.db.getWhatIf(currentId);
            
            if (existing) {
              await this.db.insertWhatIf(whatIf);
              itemsUpdated++;
              console.log(`Updated What If article ${currentId}: ${whatIf.title}`);
            } else {
              await this.db.insertWhatIf(whatIf);
              itemsAdded++;
              console.log(`Added What If article ${currentId}: ${whatIf.title}`);
              
              // Send FCM notification if enabled
              const fcmConfig = this.getFcmConfig();
              if (fcmConfig) {
                try {
                  await sendNewWhatIfNotification(
                    fcmConfig.url,
                    fcmConfig.apiKey,
                    {
                      num: whatIf.id,
                      title: whatIf.title,
                      url: whatIf.url,
                      date: whatIf.date,
                      featureImg: `https://what-if.xkcd.com/imgs/a/${whatIf.id}/archive_crop.png`,
                    },
                    {
                      testMode: fcmConfig.testMode,
                      testToken: fcmConfig.testToken,
                    }
                  );
                  console.log(`Sent FCM notification for What If article ${currentId}${fcmConfig.testMode ? ' (TEST MODE)' : ''}`);
                } catch (error) {
                  // Log error but don't fail the crawl
                  console.warn(`Failed to send FCM notification for What If article ${currentId}: ${error}`);
                }
              }
            }
          } else {
            console.warn(`No data found for What If article ${currentId}`);
          }
          
          itemsProcessed++;
        } catch (error) {
          errors++;
          const errorMsg = `Failed to crawl What If article ${currentId}: ${error}`;
          errorDetails.push(errorMsg);
          console.error(errorMsg);
          await this.recordError('ARTICLE_CRAWL_ERROR', errorMsg, (error as Error).stack);
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

  private async getCurrentLatestWhatIfId(): Promise<number> {
    try {
      const result = await this.db.db.prepare('SELECT MAX(id) as max_id FROM what_if').first();
      return (result as any)?.max_id || 0;
    } catch (error) {
      console.warn(`Failed to get current latest What If ID: ${error}`);
      return 0;
    }
  }

  private async getLatestWhatIfId(): Promise<number> {
    try {
      // What If articles update very slowly, so we can use a simple incremental approach
      // Starting from a known recent ID (162 as of Sep 2025), probe forward
      const knownLatestId = 162;
      
      // Try the next few IDs to see if there's a new article
      for (let probe = knownLatestId; probe <= knownLatestId + 10; probe++) {
        try {
          const resp = await fetch(`https://what-if.xkcd.com/${probe}/`, {
            method: 'HEAD', // Use HEAD to reduce data transfer
            signal: AbortSignal.timeout(5000)
          });
          
          if (!resp.ok && probe === knownLatestId) {
            // If even the known ID fails, something is wrong
            throw new Error(`Known ID ${knownLatestId} returned ${resp.status}`);
          }
          
          if (!resp.ok) {
            // We've gone past the last article, return previous ID
            return probe - 1;
          }
        } catch (error) {
          if ((error as Error).message.includes('Known ID')) {
            throw error;
          }
          // Timeout or other error, assume we've reached the end
          return probe - 1;
        }
      }
      
      // If we got here, return the last checked ID
      return knownLatestId + 10;
    } catch (error) {
      await this.recordError('FETCH_ERROR', `Failed to get latest What If ID: ${error}`);
      throw error;
    }
  }


  private async getWhatIfData(articleId: number): Promise<WhatIfArticleData | null> {
    try {
      // Use native fetch with timeout instead of fetchWithRetry to reduce subrequests
      const response = await fetch(`https://what-if.xkcd.com/${articleId}/`, {
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) return null;
      const html = await response.text();
      return await this.extractWhatIfContent(html, articleId);
    } catch (error) {
      await this.recordError('FETCH_ERROR', `Failed to get What If article ${articleId}: ${error}`);
      return null; // Return null instead of throwing to continue with other articles
    }
  }

  private transformWhatIfData(data: WhatIfArticleData, articleId: number): Omit<WhatIf, 'created_at' | 'updated_at'> {
    return {
      id: articleId,
      title: data.title || '',
      url: data.url || `https://what-if.xkcd.com/${articleId}/`,
      date: data.date || ''
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
