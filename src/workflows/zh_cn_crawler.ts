import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';
import { ZhCnCrawlerStrategy } from '../strategies/zh_cn_strategy';

/**
 * zh-CN Crawler Workflow
 * 
 * Architecture:
 * - Each Workflow instance processes a small batch (10-15 comics)
 * - State is persisted in KV across multiple Workflow runs
 * - Cron triggers a new Workflow every 15 minutes
 * 
 * Steps:
 * 1. check-state: Check KV for data_counts and pending comics
 * 2. scan (if needed): Scan xkcd.in for new comics
 * 3. process-batch: Process 10-15 comics
 * 4. save-state: Update KV with progress
 */
export class ZhCnCrawlerWorkflow extends BaseLocalizedCrawlerWorkflow {
  private readonly strategy = new ZhCnCrawlerStrategy();

  protected readonly config: CrawlerConfig = {
    language: 'zh-cn',
    kvKey: 'zh-cn-crawler-state',
    tableName: 'comics_zh_cn',
    batchSize: 10, // Conservative batch size to stay within 50 subrequest limit
    totalField: 'zh_cn_total'
  };

  // ===== Abstract method implementations =====

  protected async getCurrentRemoteData(): Promise<{ dataCounts: number; totalPages: number; comicIds: number[] }> {
    return await this.strategy.getDataCountsWithFirstPage();
  }

  protected getTotalFromCurrentData(currentData: { dataCounts: number; totalPages: number; comicIds: number[] }): number {
    return currentData.dataCounts;
  }

  protected async getAvailableComicIds(): Promise<number[]> {
    // Note: For zh-cn, fetching ALL available comic IDs can be expensive
    // The strategy will iterate through all pages
    // For optimization, we use the first page data in customScanLogic
    const pageData = await this.strategy.getDataCountsWithFirstPage();
    return pageData.comicIds;
  }

  protected async customScanLogic(currentData: { dataCounts: number; totalPages: number; comicIds: number[] }, existingComics: Set<number>): Promise<number[]> {
    const expectedNew = currentData.dataCounts - existingComics.size;
    
    // Optimization: Try first page only
    const firstPagePending = currentData.comicIds.filter(id => !existingComics.has(id));
    
    if (expectedNew > 0 && firstPagePending.length >= expectedNew) {
      // All new comics found on first page!
      return firstPagePending;
    }
    
    // Need to scan more pages
    return await this.scanAllPagesOptimized(existingComics, expectedNew, currentData.comicIds, currentData.totalPages);
  }

  protected async fetchComic(id: number): Promise<ComicData | null> {
    return await this.strategy.fetchComic(id);
  }

  // ===== Helper methods =====


  private async scanAllPagesOptimized(
    existingComics: Set<number>,
    expectedNew: number,
    firstPageIds: number[],
    totalPages: number
  ): Promise<number[]> {
    const comicIds = new Set<number>(firstPageIds);
    let foundNew = firstPageIds.filter(id => !existingComics.has(id)).length;
    
    // Scan additional pages if needed
    for (let page = 2; page <= totalPages && foundNew < expectedNew; page++) {
      const response = await fetch(`https://xkcd.in/?lg=cn&page=${page}`);
      const html = await response.text();
      
      const idMatches = html.matchAll(/\/comic\?lg=cn&id=(\d+)/g);
      for (const match of idMatches) {
        const id = parseInt(match[1]);
        if (id > 0 && !comicIds.has(id)) {
          comicIds.add(id);
          if (!existingComics.has(id)) {
            foundNew++;
          }
        }
      }
      
      // Rate limiting
      await new Promise(r => setTimeout(r, 1000));
    }

    return Array.from(comicIds).sort((a, b) => a - b);
  }
}