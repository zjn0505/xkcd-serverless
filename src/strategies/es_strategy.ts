import { LocalizedCrawlerStrategy, ComicData } from './base_strategy';

/**
 * Spanish Crawler Strategy
 * 
 * Data source: https://es.xkcd.com
 * 
 * Key characteristics:
 * - Archive page lists all comics with URLs (not IDs)
 * - No direct ID-based access (must use URLs from archive)
 * - IDs are NOT sequential (not every xkcd has Spanish translation)
 * - Occasionally updated (every few months)
 * - Total comics available from archive page
 */

export interface EsArchiveItem {
    url: string;
    title: string;
}

export class EsCrawlerStrategy implements LocalizedCrawlerStrategy {
    private readonly BASE_URL = 'https://es.xkcd.com';

    /**
     * Fetch comic by ID - ES doesn't support direct ID access
     * This method is provided for interface compatibility but should not be used
     */
    async fetchComic(id: number): Promise<ComicData | null> {
        throw new Error('ES site does not support ID-based access. Use fetchComicFromUrl instead.');
    }

    /**
     * Fetch available comic IDs - ES doesn't have IDs in advance
     * This method is provided for interface compatibility but should not be used
     */
    async fetchAvailableComicIds(): Promise<number[]> {
        throw new Error('ES site does not support ID-based listing. Use fetchArchive instead.');
    }

    /**
     * Fetch all available comics from the archive page
     * Returns: Array of { url, title } for all comics
     */
    async fetchArchive(): Promise<EsArchiveItem[]> {
        const response = await fetch(`${this.BASE_URL}/archive/`);

        if (!response.ok) {
            throw new Error(`Failed to fetch ES archive: HTTP ${response.status}`);
        }

        const html = await response.text();

        // Parse archive entries
        // Expected format: <div class="archive-entry"><a href="/3093/">Title</a></div>
        const entryRegex = /<div class="archive-entry">\s*<a href="([^"]+)">([^<]+)<\/a>/g;
        const items: EsArchiveItem[] = [];

        let match;
        while ((match = entryRegex.exec(html)) !== null) {
            const url = match[1];
            const title = match[2].trim();

            // Make URL absolute if needed
            const fullUrl = url.startsWith('http') ? url : `${this.BASE_URL}${url}`;

            items.push({ url: fullUrl, title });
        }

        console.log(`[es] Found ${items.length} comics in archive`);
        return items;
    }

    /**
     * Fetch a comic from a specific URL and extract its data
     * The xkcd ID must be extracted from the page content
     */
    async fetchComicFromUrl(url: string): Promise<ComicData | null> {
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error(`Failed to fetch comic from ${url}: HTTP ${response.status}`);
        }

        const html = await response.text();

        // Extract xkcd ID from the page
        // Look for link to original: <a href="https://xkcd.com/3093/" ...>
        const idMatch = html.match(/xkcd\.com\/(\d+)\//);
        if (!idMatch) {
            console.warn(`[es] Could not extract xkcd ID from ${url}`);
            return null;
        }
        const id = parseInt(idMatch[1], 10);

        // Extract image URL
        // Look for <img class="strip" ...>
        // Order: alt, title, class, src (must match all 4 attributes in order)
        // The HTML may contain illegal or unescaped quotes within attribute values,
        // which can break the naive regex. 
        // We'll try a safer match; fallback to a more forgiving one if needed.

        // First try strict: attributes in order, values may include double quotes in title/alt
        let imgMatch = html.match(/<img\s+alt="([^"]*)"\s+title="([^"]*)"\s+class="([^"]*)"\s+src="([^"]+)"[^>]*>/);
        // If strict match fails, try a more permissive match for illegal HTML with unescaped quotes.
        if (!imgMatch) {
            // Try to find <img ... class="strip" ...> and then extract attributes manually
            const imgTagMatch = html.match(/<img\b([^>]+class="strip"[^>]*)>/i);
            if (imgTagMatch) {
                const imgTag = imgTagMatch[0];

                // Helper function to extract attribute even if there is an unescaped quote
                function getAttr(str: string, attr: string): string | null {
                    // Find attr="
                    const attrStart = attr + '="';
                    const idx = str.toLowerCase().indexOf(attrStart.toLowerCase());
                    if (idx === -1) return null;
                    
                    const valueStart = idx + attrStart.length;
                    
                    // Find the closing quote by looking for " followed by:
                    // 1. Space + word + =" (next attribute)
                    // 2. > or /> (tag end)
                    // This handles unescaped quotes inside attribute values
                    let pos = valueStart;
                    while (pos < str.length) {
                        const quotePos = str.indexOf('"', pos);
                        if (quotePos === -1) break;
                        
                        // Check what comes after this quote
                        const after = str.substring(quotePos + 1, Math.min(quotePos + 20, str.length));
                        
                        // If followed by next attribute pattern (space + word + =) or tag end (> or />)
                        if (/^\s+\w+\s*=/.test(after) || /^\s*\/?>/.test(after)) {
                            // This is the closing quote
                            return str.substring(valueStart, quotePos);
                        }
                        
                        // Otherwise, this quote is inside the value, continue searching
                        pos = quotePos + 1;
                    }
                    
                    // Fallback: couldn't find proper closing quote
                    return null;
                }

                const alt = getAttr(imgTag, "alt") ?? '';
                const title = getAttr(imgTag, "title") ?? '';
                const cls = getAttr(imgTag, "class") ?? '';
                const src = getAttr(imgTag, "src") ?? '';

                // All attributes must be present for a valid match
                // attr title is empty for https://es.xkcd.com/strips/audiofilos/, https://es.xkcd.com/strips/rps/
                if (alt && /* allow title empty */ cls && src) {
                    imgMatch = [imgTag, alt, title, cls, src];
                }
            }
        }
        if (!imgMatch) {
            console.warn(`[es] Could not extract image from ${url}`);
            return null;
        }

        let imageUrl = imgMatch[4];
        // Extract title from img tag (title attribute)
        const altText = imgMatch[2] || '';
        // Try to extract alt text from alt attribute in img tag (if present)
        // The regex may not capture alt attribute, so use a helper regex on the img tag
        const title = imgMatch[1] || '';

        // Make image URL absolute if needed
        if (!imageUrl.startsWith('http')) {
            // Handle protocol-relative URLs (//es.xkcd.com/...)
            if (imageUrl.startsWith('//')) {
                imageUrl = `https:${imageUrl}`;
            } else {
                imageUrl = `${this.BASE_URL}${imageUrl}`;
            }
        }

        // validate title, altText, imageUrl are not empty
        if (!title || !imageUrl) {
            console.warn(`[es] Could not extract title, altText, or imageUrl from ${url}`);
            return null;
        }


        let fixedId = id;
        if (this.wrongIdUrlsMapping[url]) {
            fixedId = this.wrongIdUrlsMapping[url];
        }
        // fix urls with wrong ids.
        return {
            id: fixedId,
            title,
            imageUrl,
            altText,
            originalUrl: url
        };
    }

    /**
     * Fetch a comic and extract its xkcd ID from the page content
     * Returns the ID if found, null otherwise
     */
    async extractIdFromUrl(url: string): Promise<number | null> {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;

            const html = await response.text();
            const idMatch = html.match(/xkcd\.com\/(\d+)\//);
            return idMatch ? parseInt(idMatch[1], 10) : null;
        } catch (error) {
            console.error(`[es] Error extracting ID from ${url}:`, error);
            return null;
        }
    }

    private wrongIdUrlsMapping: Record<string, number> = {
        'https://es.xkcd.com/strips/geografia/': 1472, // shouldn't be 1403
        'https://es.xkcd.com/strips/subjetividad/': 255, // shouldn't be 359
        'https://es.xkcd.com/strips/that-lovin-feelin/': 317, // shouldn't be 287
        'https://es.xkcd.com/strips/pensamientos/': 275, // shouldn't be 203
    };
}

