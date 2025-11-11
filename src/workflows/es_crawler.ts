import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { EsCrawlerStrategy, EsArchiveItem } from '../strategies/es_strategy';

interface EsCrawlerState {
  lastCheckTime: string;
  savedUrls: string[]; // URLs that have been successfully saved to D1
}

interface Env {
  DB: D1Database;
  CRAWLER_STATE: KVNamespace;
}

interface Params {
  // No params needed for scheduled workflow
}

interface ComicData {
  id: number;
  title: string;
  imageUrl: string;
  altText: string;
  originalUrl: string;
}

export class EsCrawlerWorkflow extends WorkflowEntrypoint<Env, Params> {
  private readonly strategy = new EsCrawlerStrategy();
  private readonly KV_KEY = 'es-crawler-state';
  private readonly TABLE_NAME = 'comics_es';
  private readonly BATCH_SIZE = 20; // Target number of comics to fetch per run (D1 has strict SQL variable limits)

  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    console.log('[es] Starting ES crawler workflow');

    // Step 1: Check archive and state
    const checkResult = await step.do('check-archive-and-state', async () => {
      const [archiveItems, state] = await Promise.all([
        this.strategy.fetchArchive(),
        this.getState()
      ]);

      const currentUrls = archiveItems.map(item => item.url);
      const savedUrls = state?.savedUrls || [];

      console.log(`[es] Archive has ${archiveItems.length} comics`);
      console.log(`[es] Already saved: ${savedUrls.length} comics`);

      return { archiveItems, currentUrls, savedUrls, state };
    });

    // Step 2: Determine what to process
    const planResult = await step.do('plan-batch', async () => {
      const { archiveItems, savedUrls } = checkResult;

      // Find missing URLs: archive URLs that are not yet in savedUrls
      const savedUrlsSet = new Set(savedUrls);
      const missingItems = archiveItems.filter(item => !savedUrlsSet.has(item.url));

      if (missingItems.length === 0) {
        console.log('[es] MODE: skip - all comics already saved');
        return {
          mode: 'skip' as const,
          urlsToProcess: []
        };
      }

      // Take first BATCH_SIZE missing items
      const urlsToProcess = missingItems.slice(0, this.BATCH_SIZE);
      console.log(`[es] MODE: process - ${missingItems.length} missing comics, processing ${urlsToProcess.length} in this batch`);

      return {
        mode: 'process' as const,
        urlsToProcess
      };
    });

    if (planResult.mode === 'skip') {
      console.log('[es] Workflow complete - no actions needed');
      return {
        success: true,
        mode: 'skip',
        processed: 0,
        added: 0
      };
    }

    // Step 3: Process batch
    const processResult = await step.do('process-batch', async () => {
      const { urlsToProcess } = planResult;
      let processed = 0;
      let skipped = 0;
      let errors = 0;
      const errorUrls: string[] = [];
      const comicsToSave: ComicData[] = [];
      const successfulUrls: string[] = [];

      // Pre-fetch existing comic IDs for deduplication
      const existingIds = await this.getExistingComicIds();
      console.log(`[es] Pre-fetched ${existingIds.size} existing comic IDs for deduplication`);

      for (const item of urlsToProcess) {
        try {
          const comic = await this.strategy.fetchComicFromUrl(item.url);
          
          if (!comic) {
            console.log(`[es] Skipping ${item.url} - could not extract data`);
            skipped++;
            continue;
          }

          // Check if already exists in DB
          if (existingIds.has(comic.id)) {
            console.log(`[es] Skipping comic ${comic.id} - already exists in database`);
            skipped++;
            // Should not be added to successfulUrls
            // successfulUrls.push(item.url);
            continue;
          }

          comicsToSave.push(comic);
          processed++;

          // Rate limiting: small delay between requests
          if (processed % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`[es] Error fetching ${item.url}:`, error);
          errorUrls.push(item.url);
          errors++;
        }
      }

      // Batch save all comics to database
      let added = 0;
      if (comicsToSave.length > 0) {
        console.log(`[es] Batch saving ${comicsToSave.length} comics to database...`);
        try {
          await this.saveComicsBatch(comicsToSave);
          added = comicsToSave.length;
          // Add URLs to successful list
          successfulUrls.push(...comicsToSave.map(c => c.originalUrl));
          console.log(`[es] Successfully saved ${added} comics`);
        } catch (error) {
          console.error('[es] Error in batch save:', error);
          
          // Fallback to individual saves
          console.log('[es] Falling back to individual saves...');
          for (const comic of comicsToSave) {
            try {
              await this.saveComic(comic);
              added++;
              successfulUrls.push(comic.originalUrl);
            } catch (saveError) {
              console.error(`[es] Error saving comic ${comic.id}:`, saveError);
              errors++;
            }
          }
        }
      }

      return { processed, added, skipped, errors, errorUrls, successfulUrls };
    });

    // Step 4: Update state
    await step.do('update-state', async () => {
      const { savedUrls, state } = checkResult;
      const { successfulUrls } = processResult;

      if (successfulUrls.length > 0) {
        // Merge successful URLs with existing saved URLs
        const updatedSavedUrls = [...new Set([...savedUrls, ...successfulUrls])];
        
        await this.updateState({
          savedUrls: updatedSavedUrls,
          lastCheckTime: new Date().toISOString()
        });

        console.log(`[es] Updated state: ${successfulUrls.length} new URLs saved (total: ${updatedSavedUrls.length})`);
      } else {
        // Update timestamp only
        await this.updateState({
          savedUrls,
          lastCheckTime: new Date().toISOString()
        });
        
        console.log('[es] Updated state: timestamp only');
      }
    });

    // Return summary
    const summary = {
      success: true,
      mode: planResult.mode,
      processed: processResult.processed,
      added: processResult.added,
      skipped: processResult.skipped,
      errors: processResult.errors,
      errorUrls: processResult.errorUrls
    };

    console.log(`[es] Workflow complete:`, summary);
    return summary;
  }

  // ============================================================================
  // Private helper methods
  // ============================================================================

  private async getState(): Promise<EsCrawlerState | null> {
    const stateJson = await this.env.CRAWLER_STATE.get(this.KV_KEY);
    if (!stateJson) return null;
    
    try {
      return JSON.parse(stateJson);
    } catch (error) {
      console.error('[es] Error parsing state from KV:', error);
      return null;
    }
  }

  private async updateState(state: EsCrawlerState): Promise<void> {
    await this.env.CRAWLER_STATE.put(this.KV_KEY, JSON.stringify(state));
  }

  private async getExistingComicIds(): Promise<Set<number>> {
    try {
      const result = await this.env.DB.prepare(
        `SELECT id FROM ${this.TABLE_NAME}`
      ).all<{ id: number }>();

      return new Set(result.results?.map(row => row.id) || []);
    } catch (error) {
      console.error('[es] Error fetching existing comic IDs:', error);
      return new Set();
    }
  }

  private async saveComic(comic: ComicData): Promise<void> {
    await this.env.DB.prepare(
      `INSERT OR REPLACE INTO ${this.TABLE_NAME} (id, title, img, alt, source_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(
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
}

