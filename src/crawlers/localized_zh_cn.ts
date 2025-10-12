// zh-CN localized crawler using xkcd.in as source (CPU-friendly)

import { Database } from '../database';
import { BaseCrawler } from './base';
import { CrawlResult, CrawlStatus } from './types';

interface CrawlerState {
  allComicIds: number[];        // 全量扫描的所有漫画 ID
  processedIds: number[];       // 已处理的 ID
  lastScanTime: number;         // 上次全量扫描时间
}

export class LocalizedZhCnCrawler extends BaseCrawler {
  private readonly BATCH_SIZE = 20; // Process 20 comics per cron run
  private readonly KV_KEY = 'zh-cn-crawler-state';
  private kv: KVNamespace;

  constructor(db: Database, kv: KVNamespace) {
    super(db, 'localized');
    this.kv = kv;
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
      await this.log('info', 'Starting zh-CN localized crawl with KV state management');

      // Step 1: Get or create crawler state from KV
      let state = await this.getState();
      
      // Step 2: Check if we need a full scan
      const needsFullScan = !state || state.allComicIds.length === 0 || 
                           (state.processedIds.length >= state.allComicIds.length);
      
      if (needsFullScan) {
        await this.log('info', 'Performing full scan of xkcd.in (all pages)');
        const allComicIds = await this.scanAllPages();
        await this.log('info', `Full scan found ${allComicIds.length} comics`);
        
        // Get existing comics from DB
        const existingComics = await this.getExistingLocalizedComics();
        const pendingIds = allComicIds.filter(id => !existingComics.has(id));
        
        state = {
          allComicIds: pendingIds,
          processedIds: [],
          lastScanTime: Date.now()
        };
        await this.saveState(state);
        await this.log('info', `Saved ${pendingIds.length} pending comics to KV`);
      }

      // Step 3: Process a batch from the pending list
      if (!state) {
        throw new Error('State is null after initialization');
      }
      
      const remainingIds = state.allComicIds.filter(id => !state.processedIds.includes(id));
      await this.log('info', `Remaining comics: ${remainingIds.length}`);
      
      if (remainingIds.length === 0) {
        await this.log('info', 'All comics processed! Next run will perform a new full scan.');
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

      const comicsToProcess = remainingIds.slice(0, this.BATCH_SIZE);
      await this.log('info', `Processing batch of ${comicsToProcess.length} comics (${remainingIds.length} remaining)`);

      // Process comics
      for (let i = 0; i < comicsToProcess.length; i++) {
        const id = comicsToProcess[i];
        try {
          const comicData = await this.fetchComicFromXkcdIn(id);
          if (comicData) {
            await this.db.insertLocalizedComic(comicData, 'zh-cn');
            itemsAdded++;
            await this.log('info', `Added zh-CN localized ${id}: ${comicData.title}`);
          } else {
            await this.log('warn', `Failed to fetch comic ${id} from xkcd.in`);
          }
          itemsProcessed++;
          
          // Mark as processed in state
          state.processedIds.push(id);
        } catch (error) {
          errors++;
          const msg = `Failed to process zh-CN localized ${id}: ${error}`;
          errorDetails.push(msg);
          await this.log('error', msg);
          
          // Still mark as processed to avoid retrying forever
          state.processedIds.push(id);
        }

        // Update progress
        await this.updateProgress(i + 1, comicsToProcess.length);
        
        // Rate limiting: 1 second between requests
        if (i < comicsToProcess.length - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      // Save updated state to KV
      await this.saveState(state);
      const remainingAfter = state.allComicIds.length - state.processedIds.length;
      await this.log('info', `Batch completed. Processed: ${itemsProcessed}, Added: ${itemsAdded}, Errors: ${errors}, Remaining: ${remainingAfter}`);
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

  /**
   * Scan all pages on xkcd.in to get available comic IDs
   * Dynamically detects total pages from pagination
   */
  private async scanAllPages(): Promise<number[]> {
    const comicIds = new Set<number>();
    
    // First, check if scan is needed by comparing data_counts
    const scanInfo = await this.checkIfScanNeeded();
    await this.log('info', `Scan check: ${scanInfo.totalComicsOnSite} comics on site, ${scanInfo.totalComicsInDb} in DB`);
    
    // If counts match, return empty array (no need to scan)
    if (!scanInfo.needsScan) {
      await this.log('info', 'Data counts match, database is up to date');
      return [];
    }
    
    await this.log('info', `Need to scan ${scanInfo.totalPages} pages`);
    const totalPages = scanInfo.totalPages;
    
    let page = 1;
    let hasMore = true;

    // Scan ALL pages (full scan)
    while (hasMore && page <= totalPages) {
      try {
        await this.log('info', `Scanning xkcd.in page ${page}`);
        const url = `https://xkcd.in/?lg=cn&page=${page}`;
        const response = await this.fetchWithRetry(url);
        const html = await response.text();

        // Extract comic IDs from HTML
        // Format: /comic/123/ or [123]
        const idMatches = html.matchAll(/\/comic\/(\d+)\//g);
        const bracketMatches = html.matchAll(/\[(\d+)\]/g);
        
        let foundOnPage = 0;
        for (const match of idMatches) {
          const id = parseInt(match[1]);
          if (id > 0) {
            comicIds.add(id);
            foundOnPage++;
          }
        }
        
        for (const match of bracketMatches) {
          const id = parseInt(match[1]);
          if (id > 0 && id < 10000) { // Reasonable range for comic IDs
            comicIds.add(id);
            foundOnPage++;
          }
        }

        await this.log('info', `Found ${foundOnPage} comics on page ${page}`);

        // Check if there's a next page
        hasMore = html.includes(`page=${page + 1}`) || html.includes('>|');
        
        if (foundOnPage === 0) {
          // No comics found on this page, might be the end
          hasMore = false;
        }

        page++;
        
        // Rate limiting between pages
        if (hasMore) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error) {
        await this.log('error', `Failed to scan page ${page}: ${error}`);
        hasMore = false;
      }
    }

    return Array.from(comicIds).sort((a, b) => a - b);
  }

  /**
   * Check if full scan is needed by comparing data_counts with database
   * Returns scan info including whether scan is needed and total pages
   */
  private async checkIfScanNeeded(): Promise<{
    needsScan: boolean;
    totalComicsOnSite: number;
    totalComicsInDb: number;
    totalPages: number;
  }> {
    try {
      const url = 'https://xkcd.in/?lg=cn&page=1';
      const response = await this.fetchWithRetry(url);
      const html = await response.text();

      // Extract data_counts (total comics on site)
      const dataCountsMatch = html.match(/<input[^>]+id=["']data_counts["'][^>]+value=["'](\d+)["']/i) ||
                             html.match(/<input[^>]+value=["'](\d+)["'][^>]+id=["']data_counts["']/i);
      const totalComicsOnSite = dataCountsMatch ? parseInt(dataCountsMatch[1]) : 0;

      // Extract page_counts (total pages)
      const pageCountsMatch = html.match(/<input[^>]+id=["']page_counts["'][^>]+value=["'](\d+)["']/i) ||
                             html.match(/<input[^>]+value=["'](\d+)["'][^>]+id=["']page_counts["']/i);
      let totalPages = pageCountsMatch ? parseInt(pageCountsMatch[1]) : 0;

      // Fallback for page_counts using pagination links
      if (totalPages === 0) {
        const pageLinks = html.matchAll(/<a[^>]+href=["'][^"']*page=(\d+)["'][^>]*class=["'][^"']*footable-page-link["'][^>]*>/g);
        for (const match of pageLinks) {
          const pageNum = parseInt(match[1]);
          if (pageNum > totalPages) {
            totalPages = pageNum;
          }
        }
      }

      // Get total comics in database
      const result = await this.db.db.prepare('SELECT COUNT(*) as count FROM comics_zh_cn').first();
      const totalComicsInDb = (result as any)?.count || 0;

      // Determine if scan is needed
      const needsScan = totalComicsOnSite !== totalComicsInDb;

      return {
        needsScan,
        totalComicsOnSite,
        totalComicsInDb,
        totalPages: totalPages > 0 ? totalPages : 32
      };
    } catch (error) {
      await this.log('error', `Failed to check scan status: ${error}`);
      // If check fails, assume scan is needed to be safe
      return {
        needsScan: true,
        totalComicsOnSite: 0,
        totalComicsInDb: 0,
        totalPages: 32
      };
    }
  }

  /**
   * Get existing localized comics from database
   */
  private async getExistingLocalizedComics(): Promise<Set<number>> {
    try {
      const result = await this.db.db.prepare(
        'SELECT id FROM comics_zh_cn'
      ).all();
      
      const ids = new Set<number>();
      for (const row of result.results as any[]) {
        ids.add(row.id);
      }
      return ids;
    } catch (e) {
      await this.log('warn', `Failed to get existing comics: ${e}`);
      return new Set();
    }
  }

  /**
   * Fetch comic data from xkcd.in
   */
  private async fetchComicFromXkcdIn(id: number): Promise<any | null> {
    try {
      const url = `https://xkcd.in/comic?lg=cn&id=${id}`;
      const response = await this.fetchWithRetry(url);
      const html = await response.text();

      // Parse HTML to extract comic data
      // Try to find image from <a> tag with /resources/compiled_cn/ or <img> tag
      let img = '';
      let imgTitle = '';
      
      // Method 1: <a href="/resources/compiled_cn/..."><img src="..." title="..."></a>
      const aImgMatch = html.match(/<a[^>]+href=["']([^"']*\/resources\/compiled_cn\/[^"']*)["'][^>]*>\s*<img[^>]+src=["']([^"']*)["'][^>]*title=["']([^"']*)["']/i);
      if (aImgMatch) {
        img = aImgMatch[1]; // Use href from <a> tag
        imgTitle = aImgMatch[3]; // title from <img>
      } else {
        // Method 2: <img src="/resources/compiled_cn/..." title="...">
        const imgMatch = html.match(/<img[^>]+src=["']([^"']*\/resources\/compiled_cn\/[^"']*)["'][^>]*title=["']([^"']*)["']/i);
        if (imgMatch) {
          img = imgMatch[1];
          imgTitle = imgMatch[2];
        }
      }

      // Ensure full URL for image
      if (img && !img.startsWith('http')) {
        img = `https://xkcd.in${img}`;
      }

      // Use img title as the comic title (clean and without site suffix)
      const title = imgTitle || `Comic ${id}`;

      // Parse alt text from <div class="comic-details">
      const altMatch = html.match(/<div[^>]+class=["']comic-details["'][^>]*>([^<]*)<\/div>/i);
      const alt = altMatch ? altMatch[1].trim() : imgTitle;

      // Source URL
      const source_url = url;

      return {
        id,
        title,
        alt,
        img,
        transcript: '',
        source_url
      };
    } catch (e) {
      await this.log('error', `Failed to fetch comic ${id} from xkcd.in: ${e}`);
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

  /**
   * Get crawler state from KV
   */
  private async getState(): Promise<CrawlerState | null> {
    try {
      const stateJson = await this.kv.get(this.KV_KEY);
      if (!stateJson) {
        return null;
      }
      return JSON.parse(stateJson);
    } catch (error) {
      await this.log('error', `Failed to get state from KV: ${error}`);
      return null;
    }
  }

  /**
   * Save crawler state to KV
   */
  private async saveState(state: CrawlerState): Promise<void> {
    try {
      await this.kv.put(this.KV_KEY, JSON.stringify(state));
      await this.log('info', `Saved state: ${state.processedIds.length}/${state.allComicIds.length} processed`);
    } catch (error) {
      await this.log('error', `Failed to save state to KV: ${error}`);
    }
  }
}


