import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';
import { FrCrawlerStrategy } from '../strategies/fr_strategy';

/**
 * French (fr) Crawler Workflow
 * 
 * Data source: https://xkcd.lapin.org
 * Range: 1-981 (fixed, no longer updated)
 * 
 * Architecture:
 * - Each Workflow instance processes a small batch (20 comics)
 * - State is persisted in KV across multiple Workflow runs
 * - Cron triggers monthly (low frequency since source is static)
 * 
 * Steps:
 * 1. check-state: Check KV and DB for existing comics
 * 2. scan (if needed): Generate list of 1-981 comics
 * 3. process-batch: Process 20 comics per run
 */
export class FrCrawlerWorkflow extends BaseLocalizedCrawlerWorkflow {

  private readonly strategy = new FrCrawlerStrategy();

  protected readonly config: CrawlerConfig = {
    language: 'fr',
    kvKey: 'fr-crawler-state',
    tableName: 'comics_fr',
    batchSize: 20,
    totalField: 'fr_total'
  };

  // ===== Abstract method implementations =====

  protected async getCurrentRemoteData(): Promise<number[]> {
    return await this.strategy.fetchAvailableComicIds();
  }

  protected getTotalFromCurrentData(currentData: number[]): number {
    return currentData.length;
  }

  protected async getAvailableComicIds(): Promise<number[]> {
    return this.strategy.fetchAvailableComicIds();
  }

  protected async fetchComic(id: number): Promise<ComicData | null> {
    return await this.strategy.fetchComic(id);
  }
}