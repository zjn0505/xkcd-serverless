import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';

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
  protected readonly config: CrawlerConfig = {
    language: 'zh-cn',
    kvKey: 'zh-cn-crawler-state',
    tableName: 'comics_zh_cn',
    batchSize: 10, // Conservative batch size to stay within 50 subrequest limit
    totalField: 'zh_cn_total'
  };

  // ===== Abstract method implementations =====

  protected async getCurrentData(): Promise<{ dataCounts: number; totalPages: number; comicIds: number[] }> {
    return await this.getDataCountsWithFirstPage();
  }

  protected getTotalFromCurrentData(currentData: { dataCounts: number; totalPages: number; comicIds: number[] }): number {
    return currentData.dataCounts;
  }

  protected async getAvailableComicIds(): Promise<number[]> {
    const pageData = await this.getDataCountsWithFirstPage();
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
    const response = await fetch(`https://xkcd.in/comic?lg=cn&id=${id}`);
    const html = await response.text();

    let img = '';
    let imgTitle = '';

    const aImgMatch = html.match(/<a[^>]+href=["']([^"']*\/resources\/compiled_cn\/[^"']*)["'][^>]*>\s*<img[^>]+src=["']([^"']*)["'][^>]*title=["']([^"']*)["']/i);
    if (aImgMatch) {
      img = aImgMatch[1];
      imgTitle = aImgMatch[3];
    } else {
      const imgMatch = html.match(/<img[^>]+src=["']([^"']*\/resources\/compiled_cn\/[^"']*)["'][^>]*title=["']([^"']*)["']/i);
      if (imgMatch) {
        img = imgMatch[1];
        imgTitle = imgMatch[2];
      }
    }

    if (!img) {
      return null;
    }

    if (!img.startsWith('http')) {
      img = `https://xkcd.in${img}`;
    }

    const title = imgTitle || `Comic ${id}`;
    const altMatch = html.match(/<div[^>]+class=["']comic-details["'][^>]*>([^<]*)<\/div>/i);
    const alt = altMatch ? altMatch[1].trim() : imgTitle;

    return {
      id,
      title,
      imageUrl: img,
      altText: alt,
      originalUrl: `https://xkcd.in/comic?lg=cn&id=${id}`
    };
  }

  // ===== Helper methods =====

  private async getDataCountsWithFirstPage(): Promise<{ dataCounts: number; totalPages: number; comicIds: number[] }> {
    const response = await fetch('https://xkcd.in/?lg=cn&page=1');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch xkcd.in page 1: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    const dataCountsMatch = html.match(/<input[^>]+id=["']data_counts["'][^>]+value=["'](\d+)["']/i) ||
                           html.match(/<input[^>]+value=["'](\d+)["'][^>]+id=["']data_counts["']/i);
    
    if (!dataCountsMatch) {
      throw new Error('Failed to parse data_counts from xkcd.in - HTML structure may have changed');
    }
    
    const dataCounts = parseInt(dataCountsMatch[1]);
    
    const pageCountsMatch = html.match(/<input[^>]+id=["']page_counts["'][^>]+value=["'](\d+)["']/i) ||
                           html.match(/<input[^>]+value=["'](\d+)["'][^>]+id=["']page_counts["']/i);
    
    if (!pageCountsMatch) {
      throw new Error('Failed to parse page_counts from xkcd.in - HTML structure may have changed');
    }
    
    const totalPages = parseInt(pageCountsMatch[1]);
    
    const comicIds: number[] = [];
    const idMatches = html.matchAll(/\/comic\?lg=cn&id=(\d+)/g);
    for (const match of idMatches) {
      const id = parseInt(match[1]);
      if (id > 0) {
        comicIds.push(id);
      }
    }
    
    if (comicIds.length === 0) {
      throw new Error('Failed to parse any comic IDs from xkcd.in page 1 - HTML structure may have changed');
    }
    
    return { dataCounts, totalPages, comicIds };
  }

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