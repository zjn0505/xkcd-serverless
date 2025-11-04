import { LocalizedCrawlerStrategy, ComicData, HtmlParserHelper } from './base_strategy';

export class ZhTwCrawlerStrategy implements LocalizedCrawlerStrategy {

    async fetchComic(id: number): Promise<ComicData | null> {
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

    async fetchAvailableComicIds(): Promise<number[]> {
        const response = await fetch('https://xkcd.tw/');
        if (!response.ok) {
            throw new Error(`Failed to fetch xkcd.tw homepage: HTTP ${response.status}`);
        }
        const html = await response.text();
        const idMatches = html.matchAll(/href="\/(\d+)"/g);
        const ids = new Set<number>();
        for (const match of idMatches) {
            const id = parseInt(match[1]);
            if (!isNaN(id) && id > 0) {
                ids.add(id);
            }
        }
        return Array.from(ids);
    }

}