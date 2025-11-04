/**
 * Base interfaces and types for localized crawler strategies
 * 
 * Each strategy implements the core crawling logic for a specific language site,
 * independent of the Cloudflare Workers workflow orchestration.
 */

export interface ComicData {
  id: number;
  title: string;
  imageUrl: string;
  altText: string;
  originalUrl: string;
}

/**
 * Common interface for all localized crawler strategies
 * 
 * Each language implementation should provide:
 * 1. fetchComic() - Fetch and parse a single comic by ID
 * 2. fetchAvailableComicIds() - Get all available comic IDs from the site
 */
export interface LocalizedCrawlerStrategy {
  /**
   * Fetch a single comic by ID
   * @param id Comic ID
   * @returns Comic data if exists, null if not found (404)
   * @throws Error if parsing fails or network error occurs
   */
  fetchComic(id: number): Promise<ComicData | null>;

  /**
   * Fetch all available comic IDs from the site
   * @returns Array of comic IDs sorted in ascending order
   * @throws Error if fetching or parsing fails
   */
  fetchAvailableComicIds(): Promise<number[]>;
}

/**
 * Helper class with common HTML parsing utilities
 */
export class HtmlParserHelper {
  /**
   * Robustly extract attribute values from HTML tags, handling both single and double quotes
   * @param tag HTML tag string
   * @param attrName Attribute name to extract
   * @returns Attribute value or null if not found
   */
  static getAttributeValue(tag: string, attrName: string): string | null {
    // Try double quotes first
    const doubleQuoteMatch = tag.match(new RegExp(`${attrName}\\s*=\\s*"([^"]*)"`, 'i'));
    if (doubleQuoteMatch) {
      return doubleQuoteMatch[1];
    }

    // Try single quotes
    const singleQuoteMatch = tag.match(new RegExp(`${attrName}\\s*=\\s*'([^']*)'`, 'i'));
    if (singleQuoteMatch) {
      return singleQuoteMatch[1];
    }

    return null;
  }

  /**
   * Extract text content from an HTML element
   * @param html HTML string
   * @param tagName Tag name (e.g., 'h1', 'div')
   * @param selector Optional attribute selector (e.g., 'class="title"')
   * @returns Text content or null if not found
   */
  static extractText(html: string, tagName: string, selector?: string): string | null {
    const selectorPattern = selector ? `[^>]*${selector}[^>]*` : '[^>]*';
    const pattern = new RegExp(`<${tagName}${selectorPattern}>([^<]+)<\/${tagName}>`, 'i');
    const match = html.match(pattern);
    return match ? match[1].trim() : null;
  }

  /**
   * Make URL absolute if it's relative
   * @param url URL to process
   * @param baseUrl Base URL for the site
   * @returns Absolute URL
   */
  static makeAbsoluteUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('/')) {
      return `${baseUrl}${url}`;
    }
    return `${baseUrl}/${url}`;
  }
}

