import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

// Common interfaces
export interface CrawlerState {
  allComicIds: number[];
  processedIds: number[];
  lastScanTime: number;
  [key: string]: any; // Allow language-specific total fields
}

export interface Env {
  DB: D1Database;
  CRAWLER_STATE: KVNamespace;
}

export type Params = Record<string, never>;

export interface ComicData {
  id: number;
  title: string;
  imageUrl: string;
  altText: string;
  originalUrl: string;
}

export interface CrawlerConfig {
  language: string;
  kvKey: string;
  tableName: string;
  batchSize: number;
  totalField: string; // e.g., 'zh_cn_total', 'zh_tw_total', 'fr_total'
}

/**
 * Base class for localized crawler workflows
 * 
 * Provides common functionality:
 * - KV state management
 * - Database operations
 * - Decision logic
 * - Batch processing workflow
 */
export abstract class BaseLocalizedCrawlerWorkflow extends WorkflowEntrypoint<Env, Params> {
  protected abstract readonly config: CrawlerConfig;

  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Step 1: Check current state and get current data
    const stateCheck = await step.do('check-state', async () => {
      const [currentData, kvState] = await Promise.all([
        this.getCurrentData(),
        this.getKVState()
      ]);

      const action = this.determineAction(kvState, currentData);
      
      return {
        action,
        currentData,
        hasKVState: kvState !== null,
        pendingCount: kvState ? kvState.allComicIds.length - kvState.processedIds.length : 0,
        kvTotal: kvState?.[this.config.totalField] || 0
      };
    });

    // Step 2: Handle different actions
    if (stateCheck.action === 'SKIP') {
      return {
        success: true,
        action: 'SKIP',
        processed: 0,
        message: `No new ${this.config.language} comics to process`
      };
    }

    if (stateCheck.action === 'SCAN') {
      const scanResult = await step.do('scan-site', async () => {
        const existingComics = await this.getExistingComics();
        
        // Use custom scan logic (can be overridden by subclasses)
        const pendingIds = await this.customScanLogic(stateCheck.currentData, existingComics);

        const newState: CrawlerState = {
          allComicIds: pendingIds,
          processedIds: [],
          lastScanTime: Date.now(),
          [this.config.totalField]: this.getTotalFromCurrentData(stateCheck.currentData)
        };
        await this.saveKVState(newState);

        return {
          totalAvailable: this.getTotalFromCurrentData(stateCheck.currentData),
          alreadyInDB: existingComics.size,
          pending: pendingIds.length
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
      const batchIds = remainingIds.slice(0, this.config.batchSize);

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
          state.processedIds.push(id); // Mark as processed to avoid infinite retry
        }

        // Rate limiting: 1 second between requests
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
      processed: processResult.processed,
      added: processResult.added,
      errors: processResult.errors,
      failedIds: processResult.failedIds,
      remaining: processResult.remaining,
      message: `Processed ${processResult.processed} ${this.config.language} comics, added ${processResult.added}, ${processResult.errors} errors`
    };
  }

  // ===== Abstract methods to be implemented by subclasses =====

  /**
   * Get current data from the source (e.g., available IDs, max ID, data counts)
   */
  protected abstract getCurrentData(): Promise<any>;

  /**
   * Get available comic IDs from the source
   */
  protected abstract getAvailableComicIds(): Promise<number[]>;

  /**
   * Fetch a single comic from the source
   */
  protected abstract fetchComic(id: number): Promise<ComicData | null>;

  /**
   * Extract total count from current data
   */
  protected abstract getTotalFromCurrentData(currentData: any): number;

  // ===== Common helper methods =====

  protected async getKVState(): Promise<CrawlerState | null> {
    try {
      const state = await this.env.CRAWLER_STATE.get(this.config.kvKey, 'json');
      return state as CrawlerState | null;
    } catch (error) {
      console.error('Error reading KV state:', error);
      return null;
    }
  }

  protected async saveKVState(state: CrawlerState): Promise<void> {
    await this.env.CRAWLER_STATE.put(this.config.kvKey, JSON.stringify(state));
  }

  protected async getExistingComics(): Promise<Set<number>> {
    const result = await this.env.DB.prepare(`SELECT id FROM ${this.config.tableName}`).all();
    const existingIds = new Set<number>();
    
    if (result.results) {
      for (const row of result.results) {
        existingIds.add(row.id as number);
      }
    }
    
    return existingIds;
  }

  /**
   * Override this method for custom scan logic (e.g., zh-cn optimization)
   */
  protected async customScanLogic(currentData: any, existingComics: Set<number>): Promise<number[]> {
    // Default implementation: get all available IDs and filter
    const availableIds = await this.getAvailableComicIds();
    return availableIds.filter(id => !existingComics.has(id));
  }

  protected async saveComic(comic: ComicData): Promise<void> {
    await this.env.DB.prepare(`
      INSERT OR REPLACE INTO ${this.config.tableName} (id, title, img, alt, source_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(comic.id, comic.title, comic.imageUrl, comic.altText, comic.originalUrl).run();
  }

  protected determineAction(kvState: CrawlerState | null, currentData: any): 'SKIP' | 'SCAN' | 'PROCESS' {
    const currentTotal = this.getTotalFromCurrentData(currentData);
    
    // No state - need to scan
    if (!kvState) {
      return 'SCAN';
    }

    // Data counts changed - need to rescan
    if (kvState[this.config.totalField] && kvState[this.config.totalField] !== currentTotal) {
      return 'SCAN';
    }

    // All comics processed and no new data - skip
    if (kvState.processedIds.length >= kvState.allComicIds.length &&
        kvState[this.config.totalField] === currentTotal) {
      return 'SKIP';
    }

    // Has pending comics - process
    if (kvState.processedIds.length < kvState.allComicIds.length) {
      return 'PROCESS';
    }

    // Default to scan if state is inconsistent
    return 'SCAN';
  }
}
