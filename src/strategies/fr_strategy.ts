import { LocalizedCrawlerStrategy, ComicData, HtmlParserHelper } from './base_strategy';

export class FrCrawlerStrategy implements LocalizedCrawlerStrategy {

    async fetchComic(id: number): Promise<ComicData | null> {
        const response = await fetch(`https://xkcd.lapin.org/index.php?number=${id}`);

        if (!response.ok) {
            if (response.status === 404) {
                return null; // Comic doesn't exist
            }
            throw new Error(`Failed to fetch comic ${id}: HTTP ${response.status}`);
        }

        const html = await response.text();

        // Extract title from <h1>Title</h1>
        const titleMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/);
        if (!titleMatch) {
            throw new Error(`Failed to parse title for comic ${id}`);
        }

        // Extract image URL and alt text using robust attribute parsing
        // Strategy: Use multiline mode to find the line containing src="strips/..."
        // Then match the complete img tag on that line (which may contain > in attributes)
        // The 'm' flag makes ^ and $ match line boundaries
        const lines = html.split(/\r?\n/);
        const targetLine = lines.find(line => line.includes('src="strips/') || line.includes("src='strips/"));
        
        if (!targetLine) {
            throw new Error(`Failed to find comic image for comic ${id}`);
        }
        
        // Now match the img tag on this single line
        // (?:[^>"]|"[^"]*"|'[^']*')* matches attributes (handling > in quoted values)
        const imgMatch = targetLine.match(/<img\s+(?:[^>"]|"[^"]*"|'[^']*')*src=["'](strips\/[^"']+)["'](?:[^>"]|"[^"]*"|'[^']*')*\/>/);
        if (!imgMatch) {
            throw new Error(`Failed to parse image for comic ${id}`);
        }

        // imgMatch[1] contains the relative path like "strips/852G-locale.png"
        const imageUrl = `https://xkcd.lapin.org/${imgMatch[1]}`;

        // Use helper function to extract alt and title attributes from the full img tag
        const altText = this.getAttributeValue(imgMatch[0], 'alt') || '';
        const titleText = this.getAttributeValue(imgMatch[0], 'title') || '';
        return {
            id,
            title: titleMatch[1].trim(),
            imageUrl,
            altText: titleText || altText, // Use title attribute as alt text if available
            originalUrl: `https://xkcd.lapin.org/index.php?number=${id}`
        };
    }

    async fetchAvailableComicIds(): Promise<number[]> {
        const response = await fetch('https://xkcd.lapin.org/tous-episodes.php');
        if (!response.ok) {
            throw new Error(`Failed to fetch tous-episodes.php: HTTP ${response.status}`);
        }
        const html = await response.text();
        const idMatches = html.matchAll(/index\.php\?number=(\d+)/g);
        const ids = new Set<number>();
        for (const match of idMatches) {
            const id = parseInt(match[1]);
            if (!isNaN(id) && id > 0) {
                ids.add(id);
            }
        }
        return Array.from(ids);
    }

    /**
     * Robustly extract attribute values from HTML tags, handling both single and double quotes
     */
    private getAttributeValue(tag: string, attrName: string): string | null {
        return HtmlParserHelper.getAttributeValue(tag, attrName);
    }
}