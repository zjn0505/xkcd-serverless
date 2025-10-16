import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';

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
  protected readonly config: CrawlerConfig = {
    language: 'ru',
    kvKey: 'ru-crawler-state',
    tableName: 'comics_ru',
    batchSize: 20,
    totalField: 'ru_total'
  };

  // ===== Abstract method implementations =====

  protected async getCurrentData(): Promise<number[]> {
    return await this.getAvailableComicIds();
  }

  protected getTotalFromCurrentData(currentData: number[]): number {
    return currentData.length;
  }

  protected async getAvailableComicIds(): Promise<number[]> {
    const response = await fetch('https://xkcd.ru/num/');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch xkcd.ru/num/: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract comic IDs from <li class="real "><a href="/{id}/">{id}</a></li>
    const idMatches = html.matchAll(/<li class="real[^"]*"><a href="\/(\d+)\/">\d+<\/a><\/li>/g);
    
    const ids = new Set<number>();
    for (const match of idMatches) {
      const id = parseInt(match[1]);
      if (id > 0) {
        ids.add(id);
      }
    }

    if (ids.size === 0) {
      throw new Error('Failed to parse any comic IDs from xkcd.ru/num/ - HTML structure may have changed');
    }

    return Array.from(ids).sort((a, b) => a - b);
  }

  protected async fetchComic(id: number): Promise<ComicData | null> {
    const response = await fetch(`https://xkcd.ru/${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Comic doesn't exist
      }
      throw new Error(`Failed to fetch comic ${id}: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract title from <h1>Title</h1>
    const titleMatch = html.match(/<h1>([^<]+)<\/h1>/);
    if (!titleMatch) {
      throw new Error(`Failed to parse title for comic ${id}`);
    }
    
    // Extract image URL and alt text from <img border=0 src="..." alt="...">
    const imgMatch = html.match(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/);
    if (!imgMatch) {
      throw new Error(`Failed to parse image for comic ${id}`);
    }
    
    const imageUrl = imgMatch[1].startsWith('http') ? imgMatch[1] : `https://xkcd.ru${imgMatch[1]}`;
    const altText = imgMatch[2] || '';
    
    // Extract alt text from <div class="comics_text">...</div>
    const altMatch = html.match(/<div class="comics_text">([^<]*)<\/div>/);
    const comicsText = altMatch ? altMatch[1].trim() : '';
    
    return {
      id,
      title: titleMatch[1].trim(),
      imageUrl,
      altText: comicsText || altText, // Use comics_text as alt text if available
      originalUrl: `https://xkcd.ru/${id}`
    };
  }
}
