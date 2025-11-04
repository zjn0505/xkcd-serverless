import { LocalizedCrawlerStrategy, ComicData, HtmlParserHelper } from './base_strategy';

/**
 * Chinese (Simplified) Crawler Strategy
 * 
 * Data source: https://xkcd.in
 * 
 * Key characteristics:
 * - Comics are paginated across multiple pages
 * - Total count and page count available from hidden inputs
 * - IDs are NOT sequential (not every xkcd has Chinese translation)
 * - Actively updated (every few days)
 * - New comics typically appear on first page
 */
export class ZhCnCrawlerStrategy implements LocalizedCrawlerStrategy {
  private readonly BASE_URL = 'https://xkcd.in';

  async fetchComic(id: number): Promise<ComicData | null> {
    const response = await fetch(`${this.BASE_URL}/comic?lg=cn&id=${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Comic doesn't exist
      }
      throw new Error(`Failed to fetch comic ${id}: HTTP ${response.status}`);
    }
    
    const html = await response.text();

    let img = '';
    let imgTitle = '';

    // Try to find <a><img> pattern first (some comics have clickable images)
    const aImgMatch = html.match(/<a[^>]+href=["']([^"']*\/resources\/compiled_cn\/[^"']*)["'][^>]*>\s*<img[^>]+src=["']([^"']*)["'][^>]*title=["']([^"']*)["']/i);
    if (aImgMatch) {
      img = aImgMatch[1];
      imgTitle = aImgMatch[3];
    } else {
      // Try standalone <img> pattern
      const imgMatch = html.match(/<img[^>]+src=["']([^"']*\/resources\/compiled_cn\/[^"']*)["'][^>]*title=["']([^"']*)["']/i);
      if (imgMatch) {
        img = imgMatch[1];
        imgTitle = imgMatch[2];
      }
    }

    if (!img) {
      return null;
    }

    // Make URL absolute if needed
    if (!img.startsWith('http')) {
      img = `${this.BASE_URL}${img}`;
    }

    const title = imgTitle || `Comic ${id}`;
    
    // Extract alt text from comic-details div
    const altMatch = html.match(/<div[^>]+class=["']comic-details["'][^>]*>([^<]*)<\/div>/i);
    const alt = altMatch ? altMatch[1].trim() : imgTitle;

    return {
      id,
      title,
      imageUrl: img,
      altText: alt,
      originalUrl: `${this.BASE_URL}/comic?lg=cn&id=${id}`
    };
  }

  async fetchAvailableComicIds(): Promise<number[]> {
    // Get first page which includes metadata
    const firstPageData = await this.getDataCountsWithFirstPage();
    
    // For zh-cn, we need to iterate through all pages to get all IDs
    const comicIds = new Set<number>(firstPageData.comicIds);
    
    // Fetch remaining pages if there are more
    for (let page = 2; page <= firstPageData.totalPages; page++) {
      const pageIds = await this.getComicIdsFromPage(page);
      pageIds.forEach(id => comicIds.add(id));
      
      // Rate limiting to be respectful
      await new Promise(r => setTimeout(r, 500));
    }
    
    return Array.from(comicIds).sort((a, b) => a - b);
  }

  /**
   * Get metadata and comic IDs from first page
   */
  async getDataCountsWithFirstPage(): Promise<{ dataCounts: number; totalPages: number; comicIds: number[] }> {
    const response = await fetch(`${this.BASE_URL}/?lg=cn&page=1`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch xkcd.in page 1: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract data_counts from hidden input
    const dataCountsMatch = html.match(/<input[^>]+id=["']data_counts["'][^>]+value=["'](\d+)["']/i) ||
                           html.match(/<input[^>]+value=["'](\d+)["'][^>]+id=["']data_counts["']/i);
    
    if (!dataCountsMatch) {
      throw new Error('Failed to parse data_counts from xkcd.in - HTML structure may have changed');
    }
    
    const dataCounts = parseInt(dataCountsMatch[1]);
    
    // Extract page_counts from hidden input
    const pageCountsMatch = html.match(/<input[^>]+id=["']page_counts["'][^>]+value=["'](\d+)["']/i) ||
                           html.match(/<input[^>]+value=["'](\d+)["'][^>]+id=["']page_counts["']/i);
    
    if (!pageCountsMatch) {
      throw new Error('Failed to parse page_counts from xkcd.in - HTML structure may have changed');
    }
    
    const totalPages = parseInt(pageCountsMatch[1]);
    
    // Extract comic IDs from the page
    const comicIds = this.extractComicIdsFromHtml(html);
    
    if (comicIds.length === 0) {
      throw new Error('Failed to parse any comic IDs from xkcd.in page 1 - HTML structure may have changed');
    }
    
    return { dataCounts, totalPages, comicIds };
  }

  /**
   * Get comic IDs from a specific page
   */
  private async getComicIdsFromPage(page: number): Promise<number[]> {
    const response = await fetch(`${this.BASE_URL}/?lg=cn&page=${page}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch xkcd.in page ${page}: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    return this.extractComicIdsFromHtml(html);
  }

  /**
   * Extract comic IDs from HTML
   */
  private extractComicIdsFromHtml(html: string): number[] {
    const comicIds: number[] = [];
    const idMatches = html.matchAll(/\/comic\?lg=cn&id=(\d+)/g);
    
    for (const match of idMatches) {
      const id = parseInt(match[1]);
      if (id > 0) {
        comicIds.push(id);
      }
    }
    
    return comicIds;
  }
}

