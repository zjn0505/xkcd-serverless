import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

// KV state structure (shared with traditional crawler)
interface CrawlerState {
  allComicIds: number[];
  processedIds: number[];
  lastScanTime: number;
  zh_cn_total?: number;
}

// Workflow environment bindings
interface Env {
  DB: D1Database;
  CRAWLER_STATE: KVNamespace;
}

type Params = Record<string, never>;

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
export class ZhCnCrawlerWorkflow extends WorkflowEntrypoint<Env, Params> {
  private readonly KV_KEY = 'zh-cn-crawler-state';
  private readonly BATCH_SIZE = 10; // Conservative batch size to stay within 50 subrequest limit

  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Step 1: Check current state and get first page data
    const stateCheck = await step.do('check-state', async () => {
      const [pageData, kvState] = await Promise.all([
        this.getDataCountsWithFirstPage(),
        this.getKVState()
      ]);

      const action = this.determineAction(kvState, pageData.dataCounts);
      
      return {
        action,
        dataCounts: Number(pageData.dataCounts),
        totalPages: Number(pageData.totalPages),
        hasKVState: kvState !== null,
        pendingCount: kvState ? kvState.allComicIds.length - kvState.processedIds.length : 0,
        firstPageIds: pageData.comicIds
      };
    });

    // Step 2: Handle different actions
    if (stateCheck.action === 'SKIP') {
      return {
        success: true,
        action: 'SKIP',
        processed: 0,
        message: 'No changes detected'
      };
    }

    if (stateCheck.action === 'SCAN') {
      const scanResult = await step.do('scan-site', async () => {
        const existingComics = await this.getExistingComics();
        const expectedNew = stateCheck.dataCounts - existingComics.size;
        
        // Optimization: Try first page only
        const firstPagePending = stateCheck.firstPageIds.filter(id => !existingComics.has(id));
        
        if (expectedNew > 0 && firstPagePending.length >= expectedNew) {
          // All new comics found on first page!
          const newState: CrawlerState = {
            allComicIds: firstPagePending,
            processedIds: [],
            lastScanTime: Date.now(),
            zh_cn_total: stateCheck.dataCounts
          };
          await this.saveKVState(newState);
          
          return {
            totalFound: stateCheck.firstPageIds.length,
            alreadyInDB: existingComics.size,
            pending: firstPagePending.length,
            optimized: true,
            pagesScanned: 1
          };
        }
        
        // Need to scan more pages
        const allComicIds = await this.scanAllPagesOptimized(existingComics, expectedNew, stateCheck.firstPageIds, stateCheck.totalPages);
        const pendingIds = allComicIds.filter(id => !existingComics.has(id));

        const newState: CrawlerState = {
          allComicIds: pendingIds,
          processedIds: [],
          lastScanTime: Date.now(),
          zh_cn_total: stateCheck.dataCounts
        };
        await this.saveKVState(newState);

        return {
          totalFound: allComicIds.length,
          alreadyInDB: existingComics.size,
          pending: pendingIds.length,
          optimized: false
        };
      });

      if (scanResult.pending === 0) {
        return {
          success: true,
          action: 'SCAN',
          processed: 0,
          message: 'Scan complete, no pending comics'
        };
      }
    }

    // Step 3: Process a batch
    const processResult = await step.do('process-batch', async () => {
      const state = await this.getKVState();
      if (!state) {
        throw new Error('No state found after scan');
      }

      const remainingIds = state.allComicIds.filter(id => !state.processedIds.includes(id));
      const batchIds = remainingIds.slice(0, this.BATCH_SIZE);

      let processed = 0;
      let added = 0;
      let errors = 0;
      const failedIds: number[] = [];

      for (const id of batchIds) {
        try {
          const comicData = await this.fetchComic(id);
          if (comicData) {
            await this.saveComic(comicData);
            added++;
          }
          processed++;
          state.processedIds.push(id);
        } catch (error) {
          errors++;
          failedIds.push(id);
          state.processedIds.push(id);
        }

        if (processed < batchIds.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      await this.saveKVState(state);

      return {
        processed,
        added,
        errors,
        failedIds,
        remaining: state.allComicIds.length - state.processedIds.length
      };
    });

    return {
      success: processResult.errors === 0,
      action: stateCheck.action,
      ...processResult
    };
  }

  // ===== Helper Methods =====

  private determineAction(state: CrawlerState | null, currentDataCounts: number): 'SKIP' | 'SCAN' | 'PROCESS' {
    // No state - need to scan
    if (!state) {
      return 'SCAN';
    }

    // Data counts changed - need to rescan
    if (state.zh_cn_total && state.zh_cn_total !== currentDataCounts) {
      return 'SCAN';
    }

    // All comics processed and no new data - skip
    if (state.processedIds.length >= state.allComicIds.length &&
        state.zh_cn_total === currentDataCounts) {
      return 'SKIP';
    }

    // Has pending comics - process
    if (state.processedIds.length < state.allComicIds.length) {
      return 'PROCESS';
    }

    // All processed but data counts match - need new scan
    return 'SCAN';
  }

  private async getDataCountsWithFirstPage(): Promise<{ dataCounts: number; totalPages: number; comicIds: number[] }> {
    const response = await fetch('https://xkcd.in/?lg=cn&page=1');
    const html = await response.text();
    
    // Extract data_counts
    const dataCountsMatch = html.match(/<input[^>]+id=["']data_counts["'][^>]+value=["'](\d+)["']/i) ||
                           html.match(/<input[^>]+value=["'](\d+)["'][^>]+id=["']data_counts["']/i);
    const dataCounts = dataCountsMatch ? parseInt(dataCountsMatch[1]) : 0;
    
    // Extract page_counts
    const pageCountsMatch = html.match(/<input[^>]+id=["']page_counts["'][^>]+value=["'](\d+)["']/i) ||
                           html.match(/<input[^>]+value=["'](\d+)["'][^>]+id=["']page_counts["']/i);
    const totalPages = pageCountsMatch ? parseInt(pageCountsMatch[1]) : 32;
    
    // Extract comic IDs from first page (format: /comic?lg=cn&id=3134)
    const comicIds: number[] = [];
    const idMatches = html.matchAll(/\/comic\?lg=cn&id=(\d+)/g);
    for (const match of idMatches) {
      const id = parseInt(match[1]);
      if (id > 0) {
        comicIds.push(id);
      }
    }
    
    return { dataCounts, totalPages, comicIds };
  }

  private async getKVState(): Promise<CrawlerState | null> {
    const stateJson = await this.env.CRAWLER_STATE.get(this.KV_KEY);
    return stateJson ? JSON.parse(stateJson) : null;
  }

  private async saveKVState(state: CrawlerState): Promise<void> {
    await this.env.CRAWLER_STATE.put(this.KV_KEY, JSON.stringify(state));
  }

  private async scanAllPagesOptimized(
    existingComics: Set<number>,
    expectedNew: number,
    firstPageIds: number[],
    totalPages: number
  ): Promise<number[]> {
    const comicIds = new Set<number>(firstPageIds);
    let foundNew = firstPageIds.filter(id => !existingComics.has(id)).length;

    // Start from page 2 (already have page 1)
    for (let page = 2; page <= totalPages; page++) {
      const response = await fetch(`https://xkcd.in/?lg=cn&page=${page}`);
      const html = await response.text();

      const idMatches = html.matchAll(/\/comic\?lg=cn&id=(\d+)/g);
      for (const match of idMatches) {
        const id = parseInt(match[1]);
        if (id > 0) {
          const isNew = comicIds.has(id) === false;
          comicIds.add(id);
          
          // Check if this is a new comic
          if (isNew && !existingComics.has(id)) {
            foundNew++;
          }
        }
      }

      // Early exit if found all expected new comics
      if (expectedNew > 0 && foundNew >= expectedNew) {
        break;
      }

      if (page < totalPages) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return Array.from(comicIds).sort((a, b) => a - b);
  }

  private async getExistingComics(): Promise<Set<number>> {
    const result = await this.env.DB.prepare('SELECT id FROM comics_zh_cn').all();
    const ids = new Set<number>();
    for (const row of result.results as any[]) {
      ids.add(row.id);
    }
    return ids;
  }

  private async fetchComic(id: number): Promise<any | null> {
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
      alt,
      img,
      transcript: '',
      source_url: `https://xkcd.in/comic?lg=cn&id=${id}`
    };
  }

  private async saveComic(comic: any): Promise<void> {
    await this.env.DB.prepare(`
      INSERT OR REPLACE INTO comics_zh_cn (id, title, alt, img, transcript, source_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      comic.id,
      comic.title,
      comic.alt,
      comic.img,
      comic.transcript,
      comic.source_url
    ).run();
  }
}

