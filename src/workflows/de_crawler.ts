import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { DeCrawlerStrategy } from '../strategies/de_strategy';

/**
 * German (de) Crawler Workflow - Standalone Implementation
 * 
 * Data source: https://xkcde.dapete.net
 * RSS feed: https://xkcde.dapete.net/rss.php
 * 
 * Strategy:
 * 1. Check RSS on each run and compare with cached RSS items
 * 2. If RSS changed -> immediately process new RSS items (high priority)
 * 3. If no RSS changes -> continue full-fetch from progress position
 * 4. Full-fetch: scan all IDs from 1 to maxId, 20 at a time
 * 5. Mark full-fetch completion in KV
 */

interface DeCrawlerState {
  // RSS tracking
  rssItems: number[];           // Cached RSS comic IDs
  lastRSSCheck: number;         // Last RSS check timestamp

  // Full-fetch tracking
  fullFetchProgress: number;    // Next ID to check (1-based)
  fullFetchMaxId: number;       // Maximum ID discovered
  fullFetchComplete: boolean;   // Whether full scan is done

  // Statistics
  totalProcessed: number;       // Total comics processed
  lastRunTime: number;          // Last run timestamp
}

interface Env {
  DB: D1Database;
  CRAWLER_STATE: KVNamespace;
}

type Params = Record<string, never>;

interface ComicData {
  id: number;
  title: string;
  imageUrl: string;
  altText: string;
  originalUrl: string;
}

export class DeCrawlerWorkflow extends WorkflowEntrypoint<Env, Params> {
  private readonly strategy = new DeCrawlerStrategy();
  private readonly KV_KEY = 'de-crawler-state';
  private readonly TABLE_NAME = 'comics_de';
  private readonly BATCH_SIZE = 20; // Reduced to stay within subrequest limits

  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Step 1: Check RSS and state
    const checkResult = await step.do('check-rss-and-state', async () => {
      const [rssItems, state, maxId] = await Promise.all([
        this.strategy.fetchAvailableComicIdsFromRSS(),
        this.getState(),
        this.getMaxId()
      ]);

      const rssChanged = !state || !this.arraysEqual(state.rssItems, rssItems);

      console.log('[de] Check result:', {
        rssItemsCount: rssItems.length,
        rssChanged,
        hasState: !!state,
        fullFetchComplete: state?.fullFetchComplete || false,
        fullFetchProgress: state?.fullFetchProgress || 0,
        maxId
      });

      return { rssItems, rssChanged, state, maxId };
    });

    // Step 2: Determine what to process
    const planResult = await step.do('plan-batch', async () => {
      const { rssItems, rssChanged, state, maxId } = checkResult;

      // Priority 1: Continue or start full-fetch if not complete
      if (!state || !state.fullFetchComplete) {
        const startId = state?.fullFetchProgress || 1;
        
        if (state && state.fullFetchProgress > 1) {
          console.log(`[de] Full-fetch in progress: resuming from ID ${startId} (${Math.round(startId / maxId * 100)}%)`);
        } else {
          console.log(`[de] Starting full-fetch from ID ${startId}`);
        }

        return {
          mode: 'full-fetch' as const,
          specificIds: null, // Will use smart iteration
          startFromId: startId,
          targetCount: this.BATCH_SIZE,
          rssItems,
          maxId,
          state: state || this.createInitialState(rssItems, maxId)
        };
      }

      // Priority 2: Check RSS changes (only when full-fetch is complete)
      if (rssChanged) {
        const existingIds = await this.getExistingComicIds();
        const newRSSItems = rssItems.filter(id => !existingIds.has(id));

        // If all 20 RSS items are new, RSS is likely truncated - restart full-fetch
        if (newRSSItems.length >= 20) {
          console.log(`[de] RSS changed: ${newRSSItems.length} new comics (RSS full, restarting full-fetch)`);

          // Reset full-fetch to start from beginning
          const resetState = state || this.createInitialState(rssItems, maxId);
          resetState.fullFetchProgress = 1;
          resetState.fullFetchComplete = false;

          return {
            mode: 'full-fetch' as const,
            specificIds: null, // Will use smart iteration
            startFromId: 1,
            targetCount: this.BATCH_SIZE,
            rssItems,
            maxId,
            state: resetState
          };
        }

        // Normal RSS update - process new items
        if (newRSSItems.length > 0) {
          console.log(`[de] RSS changed: ${newRSSItems.length} new comics from RSS`);

          return {
            mode: 'rss' as const,
            specificIds: newRSSItems, // RSS items are specific IDs
            startFromId: null,
            targetCount: null,
            rssItems,
            maxId,
            state
          };
        }
      }

      // Priority 3: Nothing to do
      console.log('[de] Full-fetch complete, RSS unchanged, nothing to do');
      return {
        mode: 'skip' as const,
        specificIds: null,
        startFromId: null,
        targetCount: null,
        rssItems,
        maxId,
        state
      };
    });

    if (planResult.mode === 'skip') {
      await this.updateState({
        ...planResult.state!,
        rssItems: planResult.rssItems,
        lastRSSCheck: Date.now(),
        lastRunTime: Date.now()
      });

      return {
        success: true,
        mode: 'skip',
        message: 'Full-fetch complete, no RSS changes'
      };
    }

    // Step 3: Process batch
    const processResult = await step.do('process-batch', async () => {
      const { specificIds, startFromId, targetCount, mode, maxId } = planResult;

      let processed = 0;
      let skipped = 0;
      let errors = 0;
      const errorIds: number[] = [];
      const comicsToSave: ComicData[] = [];
      let lastProcessedId = startFromId || 0;

      // Mode 1: Process specific IDs (RSS mode)
      // Note: specificIds are already deduplicated against DB in plan-batch step
      if (specificIds && specificIds.length > 0) {
        for (const id of specificIds) {
          try {
            // RSS IDs are trustworthy, use fetchComic directly
            const comic = await this.strategy.fetchComic(id);

            if (!comic) {
              console.log(`[de] RSS ID ${id} not found, skipping`);
              skipped++;
              processed++;
              continue;
            }

            // Collect for batch save
            comicsToSave.push(comic);
            console.log(`[de] Fetched comic ${comic.id}: ${comic.title}`);
            processed++;

            // Rate limiting
            if (processed < specificIds.length) {
              await new Promise(r => setTimeout(r, 500));
            }

          } catch (error) {
            console.error(`[de] Error processing RSS ID ${id}:`, error);
            errors++;
            errorIds.push(id);
            processed++;
          }
        }

        lastProcessedId = specificIds.length > 0 ? Math.max(...specificIds) : lastProcessedId;
      }
      // Mode 2: Smart iteration from startFromId (full-fetch mode)
      else if (startFromId !== null && targetCount !== null) {

        // Pre-fetch existing comic IDs for full-fetch mode (optimization)
        let existingIds: Set<number> | null = null;

        // Only fetch existing IDs from startFromId onwards
        // This reduces data transfer and memory usage
        existingIds = await this.getExistingComicIdsFrom(startFromId);
        console.log(`[de] Pre-fetched ${existingIds.size} existing comic IDs (>= ${startFromId}) for deduplication`);


        let currentId = startFromId;
        let requestCount = 0;
        // Limit HTTP requests to stay within Cloudflare's 50 subrequest limit
        // We've already used 2 requests (RSS + maxId), plus 1 for DB query
        // Leaving ~45 requests for comic fetching to be safe
        const MAX_REQUESTS = 45;

        while (comicsToSave.length < targetCount && currentId <= maxId && requestCount < MAX_REQUESTS) {
          try {
            const comic = await this.strategy.fetchComicOrClosest(currentId);
            requestCount++; // Count each HTTP request

            // Check if we got redirected
            if (comic.id !== currentId) {
              console.log(`[de] ID ${currentId} redirected to ${comic.id}`);
              // Jump to the redirected ID for processing
              currentId = comic.id;
            }

            // Check if already exists (using pre-fetched set, no DB query)
            if (existingIds && existingIds.has(comic.id)) {
              console.log(`[de] Comic ${comic.id} already exists, skipping`);
              skipped++;
              currentId = comic.id + 1; // Move to next ID
              continue;
            }

            // Collect for batch save
            comicsToSave.push(comic);
            console.log(`[de] [${comicsToSave.length}/${targetCount}] Fetched comic ${comic.id}: ${comic.title}`);

            lastProcessedId = comic.id;
            currentId = comic.id + 1; // Move to next ID after successful addition
            processed++;

            // Rate limiting
            await new Promise(r => setTimeout(r, 500));

          } catch (error) {
            console.error(`[de] Error processing ID ${currentId}:`, error);
            requestCount++; // Failed requests also count
            errors++;
            errorIds.push(currentId);
            currentId++; // Try next ID on error
          }
        }

        // Log why we stopped
        if (comicsToSave.length >= targetCount) {
          console.log(`[de] Target reached: collected ${comicsToSave.length} comics`);
        } else if (currentId > maxId) {
          console.log(`[de] Reached end of ID range (maxId: ${maxId})`);
        } else if (requestCount >= MAX_REQUESTS) {
          console.warn(`[de] Reached HTTP request limit (${requestCount}/${MAX_REQUESTS}), stopping to stay within Cloudflare limits`);
        }
      }

      // Batch save all comics to database
      let added = 0;
      if (comicsToSave.length > 0) {
        try {
          console.log(`[de] Batch saving ${comicsToSave.length} comics to database...`);
          await this.saveComicsBatch(comicsToSave);
          added = comicsToSave.length;
          console.log(`[de] Successfully saved ${added} comics`);
        } catch (error) {
          console.error(`[de] Error in batch save:`, error);
          // Fallback: try saving one by one
          console.log(`[de] Falling back to individual saves...`);
          for (const comic of comicsToSave) {
            try {
              await this.saveComic(comic);
              added++;
            } catch (e) {
              console.error(`[de] Failed to save comic ${comic.id}:`, e);
              errors++;
              errorIds.push(comic.id);
            }
          }
        }
      }

      return { processed, added, skipped, errors, errorIds, lastProcessedId };
    });

    // Step 4: Update state
    await step.do('update-state', async () => {
      const { mode, rssItems, maxId, state } = planResult;

      const newState: DeCrawlerState = {
        rssItems,
        lastRSSCheck: Date.now(),
        fullFetchProgress: mode === 'full-fetch' ? processResult.lastProcessedId + 1 : state!.fullFetchProgress,
        fullFetchMaxId: maxId,
        fullFetchComplete: mode === 'full-fetch' && processResult.lastProcessedId >= maxId ? true : state!.fullFetchComplete,
        totalProcessed: (state?.totalProcessed || 0) + processResult.processed,
        lastRunTime: Date.now()
      };

      await this.updateState(newState);

      if (newState.fullFetchComplete && mode === 'full-fetch') {
        console.log('[de] 🎉 Full-fetch completed!');
      }

      return newState;
    });

    // Return summary
    return {
      success: processResult.errors === 0,
      mode: planResult.mode,
      processed: processResult.processed,
      added: processResult.added,
      skipped: processResult.skipped,
      errors: processResult.errors,
      errorIds: processResult.errorIds,
      fullFetchProgress: planResult.mode === 'full-fetch'
        ? `${processResult.lastProcessedId}/${planResult.maxId}`
        : 'N/A',
      fullFetchComplete: planResult.mode === 'full-fetch' && processResult.lastProcessedId >= planResult.maxId,
      message: `[de] ${planResult.mode}: processed ${processResult.processed}, added ${processResult.added}, skipped ${processResult.skipped}, errors ${processResult.errors}`
    };
  }

  // ===== State Management =====

  private async getState(): Promise<DeCrawlerState | null> {
    try {
      const state = await this.env.CRAWLER_STATE.get(this.KV_KEY, 'json');
      return state as DeCrawlerState | null;
    } catch (error) {
      console.error('[de] Error reading state:', error);
      return null;
    }
  }

  private async updateState(state: DeCrawlerState): Promise<void> {
    await this.env.CRAWLER_STATE.put(this.KV_KEY, JSON.stringify(state));
  }

  private createInitialState(rssItems: number[], maxId: number): DeCrawlerState {
    return {
      rssItems,
      lastRSSCheck: Date.now(),
      fullFetchProgress: 1,
      fullFetchMaxId: maxId,
      fullFetchComplete: false,
      totalProcessed: 0,
      lastRunTime: Date.now()
    };
  }

  // ===== Database Operations =====

  private async getExistingComicIds(): Promise<Set<number>> {
    const result = await this.env.DB.prepare(`SELECT id FROM ${this.TABLE_NAME}`).all();
    const ids = new Set<number>();

    if (result.results) {
      for (const row of result.results) {
        ids.add(row.id as number);
      }
    }

    return ids;
  }

  private async getExistingComicIdsFrom(startId: number): Promise<Set<number>> {
    const result = await this.env.DB.prepare(
      `SELECT id FROM ${this.TABLE_NAME} WHERE id >= ?`
    ).bind(startId).all();

    const ids = new Set<number>();

    if (result.results) {
      for (const row of result.results) {
        ids.add(row.id as number);
      }
    }

    return ids;
  }

  private async saveComic(comic: ComicData): Promise<void> {
    await this.env.DB.prepare(`
      INSERT OR REPLACE INTO ${this.TABLE_NAME} (id, title, img, alt, source_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      comic.id,
      comic.title,
      comic.imageUrl,
      comic.altText,
      comic.originalUrl
    ).run();
  }

  private async saveComicsBatch(comics: ComicData[]): Promise<void> {
    if (comics.length === 0) return;

    // Build batch insert query
    const values = comics.map(() => '(?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))').join(', ');
    const query = `
      INSERT OR REPLACE INTO ${this.TABLE_NAME} (id, title, img, alt, source_url, created_at, updated_at)
      VALUES ${values}
    `;

    // Flatten all comic data into a single array
    const params: any[] = [];
    for (const comic of comics) {
      params.push(
        comic.id,
        comic.title,
        comic.imageUrl,
        comic.altText,
        comic.originalUrl
      );
    }

    await this.env.DB.prepare(query).bind(...params).run();
  }

  // ===== Helper Methods =====

  private async getMaxId(): Promise<number> {
    const allIds = await this.strategy.fetchAvailableComicIds();
    return Math.max(...allIds);
  }

  private arraysEqual(a: number[], b: number[]): boolean {
    if (!a || !b || a.length !== b.length) return false;
    const sortedA = [...a].sort((x, y) => x - y);
    const sortedB = [...b].sort((x, y) => x - y);
    return sortedA.every((val, idx) => val === sortedB[idx]);
  }
}
