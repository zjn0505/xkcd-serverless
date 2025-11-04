import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';
import { DeCrawlerStrategy } from '../strategies/de_strategy';

/**
 * German (de) Crawler Workflow (Simplified)
 * 
 * Data source: https://xkcde.dapete.net
 * RSS feed: https://xkcde.dapete.net/rss.php
 * 
 * Key characteristics:
 * - German site is mostly static (no longer actively updated)
 * - IDs are NOT sequential (not every xkcd has German translation)
 * - RSS feed shows last 20 comics
 * - No comprehensive list page available
 * 
 * Simplified Strategy:
 * - Use RSS feed as the sole source of available comic IDs
 * - Only track the most recent ~20 comics from RSS
 * - For full historical data, consider local scraping + direct D1 upload
 * - Workflow runs monthly to check for any RSS updates
 * 
 * Architecture:
 * - Each Workflow instance processes a small batch (10 comics)
 * - State is persisted in KV across multiple Workflow runs
 * - Cron triggers monthly (low frequency since mostly static)
 */
export class DeCrawlerWorkflow extends BaseLocalizedCrawlerWorkflow {
  private readonly strategy = new DeCrawlerStrategy();

  protected readonly config: CrawlerConfig = {
    language: 'de',
    kvKey: 'de-crawler-state',
    tableName: 'comics_de',
    batchSize: 10, // Small batch due to low update frequency
    totalField: 'de_total'
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
