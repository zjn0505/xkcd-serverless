import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';
import { RuCrawlerStrategy } from '../strategies/ru_strategy';

/**
 * Russian (ru) Crawler Workflow
 * 
 * Data source: https://xkcd.ru
 * List page: https://xkcd.ru/num/
 * Detail page: https://xkcd.ru/{id}
 * 
 * Architecture:
 * - Each Workflow instance processes a small batch (20 comics)
 * - State is persisted in KV across multiple Workflow runs
 * - Cron triggers daily
 * 
 * Steps:
 * 1. check-state: Check KV and get available comic IDs
 * 2. scan (if needed): Get all available comic IDs from list page
 * 3. process-batch: Process 20 comics per run
 */
export class RuCrawlerWorkflow extends BaseLocalizedCrawlerWorkflow {
  private readonly strategy = new RuCrawlerStrategy();

  protected readonly config: CrawlerConfig = {
    language: 'ru',
    kvKey: 'ru-crawler-state',
    tableName: 'comics_ru',
    batchSize: 20,
    totalField: 'ru_total'
  };

  // ===== Abstract method implementations =====

  protected async getCurrentRemoteData(): Promise<number[]> {
    return await this.strategy.fetchAvailableComicIds();
  }

  protected getTotalFromCurrentData(currentData: number[]): number {
    return currentData.length;
  }

  protected async getAvailableComicIds(): Promise<number[]> {
    return await this.strategy.fetchAvailableComicIds();
  }

  protected async fetchComic(id: number): Promise<ComicData | null> {
    return await this.strategy.fetchComic(id);
  }
}
