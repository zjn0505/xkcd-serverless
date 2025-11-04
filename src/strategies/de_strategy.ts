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
  private readonly RSS_URL = 'https://xkcde.dapete.net/rss.php';

  async fetchComic(id: number): Promise<ComicData | null> {
    const response = await fetch(`${this.BASE_URL}/${id}/`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Comic doesn't exist
      }
      throw new Error(`Failed to fetch comic ${id}: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract title from <h1> or <title>
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/) || 
                      html.match(/<title[^>]*>([^<]+)<\/title>/);
    if (!titleMatch) {
      throw new Error(`Failed to parse title for comic ${id}`);
    }
    
    // Extract image URL - German site uses different image formats
    const imgMatch = html.match(/<img[^>]+src=["']([^"']*\.(?:png|jpg|jpeg|gif|svg))["'][^>]*>/i);
    if (!imgMatch) {
      throw new Error(`Failed to parse image for comic ${id}`);
    }
    
    const imageUrl = HtmlParserHelper.makeAbsoluteUrl(imgMatch[1], this.BASE_URL);
    
    // Extract alt text and title attributes
    const altText = HtmlParserHelper.getAttributeValue(imgMatch[0], 'alt') || '';
    const titleText = HtmlParserHelper.getAttributeValue(imgMatch[0], 'title') || '';
    
    return {
      id,
      title: titleMatch[1].trim(),
      imageUrl,
      altText: titleText || altText,
      originalUrl: `${this.BASE_URL}/${id}/`
    };
  }

  async fetchAvailableComicIds(): Promise<number[]> {
    const response = await fetch(this.RSS_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: HTTP ${response.status}`);
    }
    
    const rssContent = await response.text();
    
    // Extract comic IDs from RSS feed
    const comicIds: number[] = [];
    
    // Look for comic URLs in RSS items: https://xkcde.dapete.net/{id}/
    const urlMatches = rssContent.matchAll(/https:\/\/xkcde\.dapete\.net\/(\d+)\//g);
    
    for (const match of urlMatches) {
      const id = parseInt(match[1]);
      if (!isNaN(id) && id > 0) {
        comicIds.push(id);
      }
    }
    
    if (comicIds.length === 0) {
      throw new Error('Failed to parse any comic IDs from RSS feed - RSS structure may have changed');
    }
    
    // Remove duplicates and sort
    const uniqueIds = [...new Set(comicIds)].sort((a, b) => a - b);
    
    return uniqueIds;
  }
}

