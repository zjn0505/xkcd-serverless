import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';

import { ZhTwCrawlerStrategy } from '../strategies/zh_tw_strategy';

export class ZhTwCrawlerWorkflow extends BaseLocalizedCrawlerWorkflow {
  protected readonly config: CrawlerConfig = {
    language: 'zh-tw',
    kvKey: 'zh-tw-crawler-state',
    tableName: 'comics_zh_tw',
    batchSize: 20,
    totalField: 'zh_tw_total'
  };
  private readonly strategy = new ZhTwCrawlerStrategy();

  // ===== Abstract method implementations =====

  protected async getCurrentRemoteData(): Promise<number[]> {
    return await this.getAvailableComicIds();
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
