import { BaseLocalizedCrawlerWorkflow, CrawlerConfig, ComicData } from './base_localized_crawler';

/**
 * French (fr) Crawler Workflow
 * 
 * Data source: https://xkcd.lapin.org
 * Range: 1-981 (fixed, no longer updated)
 * 
 * Architecture:
 * - Each Workflow instance processes a small batch (20 comics)
 * - State is persisted in KV across multiple Workflow runs
 * - Cron triggers monthly (low frequency since source is static)
 * 
 * Steps:
 * 1. check-state: Check KV and DB for existing comics
 * 2. scan (if needed): Generate list of 1-981 comics
 * 3. process-batch: Process 20 comics per run
 */
export class FrCrawlerWorkflow extends BaseLocalizedCrawlerWorkflow {
  protected readonly config: CrawlerConfig = {
    language: 'fr',
    kvKey: 'fr-crawler-state',
    tableName: 'comics_fr',
    batchSize: 20,
    totalField: 'fr_total'
  };

  // ===== Abstract method implementations =====

  protected async getCurrentData(): Promise<number> {
    return await this.getMaxComicId();
  }

  protected getTotalFromCurrentData(currentData: number): number {
    return currentData;
  }

  protected async getAvailableComicIds(): Promise<number[]> {
    const maxComicId = await this.getMaxComicId();
    const allComicIds: number[] = [];
    for (let id = 1; id <= maxComicId; id++) {
      allComicIds.push(id);
    }
    return allComicIds;
  }

  protected async fetchComic(id: number): Promise<ComicData | null> {
    const response = await fetch(`https://xkcd.lapin.org/index.php?number=${id}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return null; // Comic doesn't exist
      }
      throw new Error(`Failed to fetch comic ${id}: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract title from <h1>Title</h1>
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (!titleMatch) {
      throw new Error(`Failed to parse title for comic ${id}`);
    }
    
    // Extract image URL and alt text using robust attribute parsing
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/);
    if (!imgMatch) {
      throw new Error(`Failed to parse image for comic ${id}`);
    }
    
    const imageUrl = imgMatch[1].startsWith('http') ? imgMatch[1] : `https://xkcd.lapin.org/${imgMatch[1]}`;
    
    // Use helper function to extract alt and title attributes
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

  // ===== Helper methods =====

  /**
   * Get max comic ID from https://xkcd.lapin.org/tous-episodes.php
   * 
   * This page lists all comics with links like: index.php?number=123
   */
  private async getMaxComicId(): Promise<number> {
    const response = await fetch('https://xkcd.lapin.org/tous-episodes.php');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tous-episodes.php: HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const idMatches = html.matchAll(/index\.php\?number=(\d+)/g);
    
    let maxId = 0;
    for (const match of idMatches) {
      const id = parseInt(match[1]);
      if (id > maxId) {
        maxId = id;
      }
    }

    if (maxId === 0) {
      throw new Error('Failed to parse any comic IDs from tous-episodes.php - HTML structure may have changed');
    }

    return maxId;
  }

  /**
   * Robustly extract attribute values from HTML tags, handling both single and double quotes
   */
  private getAttributeValue(tag: string, attrName: string): string | null {
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
}