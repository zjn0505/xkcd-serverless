// Base crawler class with common functionality

import { Database } from '../database';
import { CrawlResult, CrawlStatus, XkcdComicData } from './types';
import { getImageDimensions } from '../utils/image-probe';

export interface CrawlerEnv {
  LAMBDA_FCM_URL?: string;
  LAMBDA_API_KEY?: string;
  FCM_ENABLED?: string; // 'true' or '1' to enable
  FCM_TEST_MODE?: string; // 'true' or '1' to enable test mode (send to test token instead of topic)
  FCM_TEST_TOKEN?: string; // Test device token (set via wrangler secret)
}

export abstract class BaseCrawler {
  protected db: Database;
  protected taskType: 'xkcd' | 'whatif' | 'localized';
  protected env?: CrawlerEnv;

  constructor(db: Database, taskType: 'xkcd' | 'whatif' | 'localized', env?: CrawlerEnv) {
    this.db = db;
    this.taskType = taskType;
    this.env = env;
  }

  /**
   * Check if FCM notifications are enabled
   */
  protected isFcmEnabled(): boolean {
    if (!this.env) return false;
    const enabled = this.env.FCM_ENABLED;
    return enabled === 'true' || enabled === '1' || enabled === 'TRUE';
  }

  /**
   * Check if FCM test mode is enabled
   */
  protected isTestMode(): boolean {
    if (!this.env) return false;
    const testMode = this.env.FCM_TEST_MODE;
    return testMode === 'true' || testMode === '1' || testMode === 'TRUE';
  }

  /**
   * Get Lambda FCM URL and API key, with test mode support
   */
  protected getFcmConfig(): { url: string; apiKey: string | null; testMode: boolean; testToken: string | null } | null {
    if (!this.isFcmEnabled() || !this.env?.LAMBDA_FCM_URL) {
      return null;
    }
    return {
      url: this.env.LAMBDA_FCM_URL,
      apiKey: this.env.LAMBDA_API_KEY || null,
      testMode: this.isTestMode(),
      testToken: this.env.FCM_TEST_TOKEN || null,
    };
  }

  protected async recordError(errorType: string, errorMessage: string, stackTrace?: string): Promise<void> {
    console.error(`Error: ${errorType}`, { errorMessage, stackTrace });
  }

  protected async fetchWithRetry(url: string, options: RequestInit = {}, maxRetries: number = 3): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Fetching URL (attempt ${attempt}/${maxRetries}): ${url}`);
        
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

        console.log(`Successfully fetched URL: ${url}`);
        return response;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Fetch attempt ${attempt} failed: ${error}`, { url, attempt });
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Waiting ${delay}ms before retry`);
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
        console.warn(`JSON parse attempt ${attempt} failed: ${error}`);
        
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
  protected async getComicData(comicId: number): Promise<XkcdComicData> {
    try {
      const response = await this.fetchWithRetry(`https://xkcd.com/${comicId}/info.0.json`);
      const comicData = await this.parseJsonWithRetry<XkcdComicData>(response);
      
      // Get image dimensions if image URL exists
      if (comicData.img) {
        const dimensions = await getImageDimensions(comicData.img, 10000);
        if (dimensions) {
          comicData.width = dimensions.width;
          comicData.height = dimensions.height;
        } else {
          console.warn(`Failed to get dimensions for comic ${comicId}, continuing without dimensions`);
        }
      }
      
      return comicData;
    } catch (error) {
      await this.recordError('FETCH_ERROR', `Failed to get comic ${comicId}: ${error}`);
      throw error;
    }
  }

  // Removed updateProgress() - no longer tracking progress in database

  // Abstract methods to be implemented by subclasses
  abstract crawl(): Promise<CrawlResult>;
  abstract getStatus(): Promise<CrawlStatus>;
}
