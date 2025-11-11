import { LocalizedCrawlerStrategy, ComicData, HtmlParserHelper } from './base_strategy';

/**
 * Russian Crawler Strategy
 * 
 * Data source: https://xkcd.ru
 * List page: https://xkcd.ru/num/
 * 
 * Key characteristics:
 * - All comic IDs available on single list page (/num/)
 * - IDs are NOT sequential (not every xkcd has Russian translation)
 * - Site is mostly static (no longer actively updated)
 * - Simple HTML structure for parsing
 */
export class RuCrawlerStrategy implements LocalizedCrawlerStrategy {
  private readonly BASE_URL = 'https://xkcd.ru';

  async fetchComic(id: number): Promise<ComicData | null> {
    const response = await fetch(`${this.BASE_URL}/${id}`);
    
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
    
    const imageUrl = HtmlParserHelper.makeAbsoluteUrl(imgMatch[1], this.BASE_URL);
    
    // Extract alt text from <div class="comics_text">...</div>
    // Use [\s\S]*? to match any character including < and >, but non-greedy to stop at </div>
    const altMatch = html.match(/<div class="comics_text">([\s\S]*?)<\/div>/);
    const comicsText = altMatch ? altMatch[1].trim() : '';
    return {
      id,
      title: titleMatch[1].trim(),
      imageUrl,
      altText: comicsText, // Use comics_text as alt text if available
      originalUrl: `${this.BASE_URL}/${id}`
    };
  }

  async fetchAvailableComicIds(): Promise<number[]> {
    const response = await fetch(`${this.BASE_URL}/num/`);
    
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
}

