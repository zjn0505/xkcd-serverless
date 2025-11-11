import { LocalizedCrawlerStrategy, ComicData, HtmlParserHelper } from './base_strategy';

/**
 * German Crawler Strategy (Simplified)
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
 * Strategy:
 * - Use RSS feed as the source of available comic IDs
 * - This provides the most recent ~20 comics
 * - For a full historical crawl, consider local scraping + upload to D1
 * - Workflow checks RSS monthly for any updates
 */
export class DeCrawlerStrategy implements LocalizedCrawlerStrategy {
  private readonly BASE_URL = 'https://xkcde.dapete.net';

  async fetchComic(id: number): Promise<ComicData | null> {
    const closestComic = await this.fetchComicOrClosest(id);
    if (closestComic.id !== id) {
      return null;
    }
    return closestComic;
    
  }

  async fetchComicOrClosest(id: number): Promise<ComicData> {
    const response = await fetch(`${this.BASE_URL}/${id}/`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch comic ${id}: HTTP ${response.status}`);
    }
    
    const html = await response.text();

    const idMatch = html.match(/<a href="http:\/\/www\.xkcd\.com\/(\d+)\/" hreflang="en">/);
    if (!idMatch) {
      throw new Error(`Failed to parse id for comic ${id}`);
    }

    // check id and idMatch[1] are the same
    const comicIdStr = idMatch[1];
    const comicId = Number(comicIdStr);
    if (isNaN(comicId)) {
      throw new Error(`Parsed comic ID "${comicIdStr}" is not a valid number for comic ${id}`);
    }
    
    // Extract title from <h1> or <title>
    // Parse <title>xkcDE &ndash; Eine deutsche Version von xkcd &ndash; #1159: Countdown</title>
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
    let titleMatch: RegExpMatchArray | null = null;
    if (titleTagMatch) {
      // Extracts the text after the last colon and trims whitespace
      // Example: ... #1159: Countdown   -->  Countdown
      const colonParts = titleTagMatch[1].split(':');
      if (colonParts.length > 1) {
        const last = colonParts[colonParts.length - 1].trim();
        titleMatch = [last, last];
      } else {
        // fallback: use the <title> as is
        titleMatch = [titleTagMatch[1], titleTagMatch[1]];
      }
    }
    if (!titleMatch) {
      throw new Error(`Failed to parse title for comic ${id}`);
    }
    
    // Specifically look for an <img> whose src starts with "/comics/" (the pattern used on xkcde.dapete.net)
    const imgMatch = html.match(/<img\s+[^>]*src=["'](\/comics\/[^"']+\.(?:png|jpg|jpeg|gif|svg))["'][^>]*>/i);
    if (!imgMatch) {
      throw new Error(`Failed to parse image for comic ${id}`);
    }

    const imageUrl = HtmlParserHelper.makeAbsoluteUrl(imgMatch[1], this.BASE_URL);
    
    // Extract alt text and title attributes
    const altText = HtmlParserHelper.getAttributeValue(imgMatch[0], 'alt') || '';
    const titleText = HtmlParserHelper.getAttributeValue(imgMatch[0], 'title') || '';
    
    return {
      id: comicId,
      title: titleMatch[1].trim(),
      imageUrl,
      altText: titleText || altText,
      originalUrl: `${this.BASE_URL}/${comicId}/`
    };
  }

   async fetchAvailableComicIdsFromRSS(): Promise<number[]> {
     const response = await fetch(`${this.BASE_URL}/rss.php`);
     if (!response.ok) {
       throw new Error(`Failed to fetch RSS: HTTP ${response.status}`);
     }
     const xml = await response.text();
     
     // Extract comic IDs from RSS feed
     // Look for URLs like: https://xkcde.dapete.net/1234/
     const urlMatches = xml.matchAll(/<guid\s+isPermaLink=["']true["']>\s*http:\/\/xkcde\.dapete\.net\/(\d+)\//g);
     const ids = new Set<number>();
     
     for (const match of urlMatches) {
       const id = parseInt(match[1], 10);
       if (!isNaN(id) && id > 0) {
         ids.add(id);
       }
     }
     
     if (ids.size === 0) {
       throw new Error('Failed to parse any comic IDs from RSS feed');
     }
     
     return Array.from(ids).sort((a, b) => a - b);
   }

  async fetchAvailableComicIds(): Promise<number[]> {
    // Get the latest comic ID from latest page
    const response = await fetch(this.BASE_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch latest page: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Get latest comic id by parsing <a href="http://www.xkcd.com/1162/" hreflang="en">
    const latestIdMatch = html.match(/<a href="http:\/\/www\.xkcd\.com\/(\d+)\/" hreflang="en">/);
    if (!latestIdMatch) {
      throw new Error('Failed to parse latest comic id from German xkcd site.');
    }
    const latestId = parseInt(latestIdMatch[1], 10);
    if (isNaN(latestId)) {
      throw new Error('Latest comic id is not a valid number.');
    }

    return Array.from({ length: latestId }, (_, i) => i + 1);
  }
}

