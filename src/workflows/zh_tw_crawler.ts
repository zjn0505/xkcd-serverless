import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';

export class ZhTwCrawlerWorkflow extends BaseLocalizedCrawlerWorkflow {
  protected readonly config: CrawlerConfig = {
    language: 'zh-tw',
    kvKey: 'zh-tw-crawler-state',
    tableName: 'comics_zh_tw',
    batchSize: 20,
    totalField: 'zh_tw_total'
  };

  // ===== Abstract method implementations =====

  protected async getCurrentData(): Promise<number[]> {
    return await this.getAvailableComicIds();
  }

  protected getTotalFromCurrentData(currentData: number[]): number {
    return currentData.length;
  }

  protected async getAvailableComicIds(): Promise<number[]> {
    const response = await fetch('https://xkcd.tw/');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch xkcd.tw homepage: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const idMatches = html.matchAll(/href="\/(\d+)"/g);
    
    const ids = new Set<number>();
    for (const match of idMatches) {
      const id = parseInt(match[1]);
      if (id > 0) {
        ids.add(id);
      }
    }

    if (ids.size === 0) {
      throw new Error('Failed to parse any comic IDs from xkcd.tw homepage - HTML structure may have changed');
    }

    return Array.from(ids).sort((a, b) => a - b);
  }

  protected async fetchComic(id: number): Promise<ComicData | null> {
    const response = await fetch(`https://xkcd.tw/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Comic doesn't exist
      }
      throw new Error(`Failed to fetch comic ${id}: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract title from <h1>[ID] Title</h1>
    const titleMatch = html.match(/<h1>\[\d+\]\s*(.+?)<\/h1>/);
    if (!titleMatch) {
      throw new Error(`Failed to parse title for comic ${id}`);
    }
    
    // Extract image URL and alt text
    const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"[^>]*title="([^"]*)"[^>]*>/);
    if (!imgMatch) {
      throw new Error(`Failed to parse image for comic ${id}`);
    }
    
    const imageUrl = imgMatch[1].startsWith('http') ? imgMatch[1] : `https://xkcd.tw${imgMatch[1]}`;
    const altText = imgMatch[2] || '';
    const titleText = imgMatch[3] || '';
    
    return {
      id,
      title: titleMatch[1].trim(),
      imageUrl,
      altText: titleText || altText, // Use title attribute as alt text if available
      originalUrl: `https://xkcd.tw/${id}`
    };
  }

}
