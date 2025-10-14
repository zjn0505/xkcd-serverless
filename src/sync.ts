import { Database } from './database';

interface XkcdApiComic {
  width: number;
  height: number;
  thumbCount: number;
  num: number;
  alt: string;
  title: string;
  img: string;
  day: string;
  month: string;
  year: string;
}

interface WhatIfApiArticle {
  num: number;
  title: string;
  date: string;
  featureImg: string;
  thumbCount: number;
}

export class DataSync {
  private db: Database;
  private baseUrl: string;

  constructor(db: Database, baseUrl: string = 'https://api.jienan.xyz/xkcd') {
    this.db = db;
    this.baseUrl = baseUrl;
  }

  /**
   * Sync XKCD comics from API to local D1
   */
  async syncXkcdComics(start: number = 1, size: number = 100): Promise<{ synced: number, errors: number }> {
    let synced = 0;
    let errors = 0;
    let currentStart = start;

    console.log(`Starting XKCD comics sync from ${start} with size ${size}`);

    while (true) {
      try {
        const url = `${this.baseUrl}/xkcd-list?start=${currentStart}&size=${size}`;
        console.log(`Fetching: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const comics: XkcdApiComic[] = await response.json();
        
        if (comics.length === 0) {
          console.log('No more comics to sync');
          break;
        }

        console.log(`Processing ${comics.length} comics starting from ${currentStart}`);

        for (const comic of comics) {
          try {
            await this.db.insertComic({
              id: comic.num,
              title: comic.title,
              alt: comic.alt,
              img: comic.img,
              transcript: null, // API doesn't provide transcript
              year: parseInt(comic.year),
              month: parseInt(comic.month),
              day: parseInt(comic.day),
              link: null,
              news: null,
              safe_title: null
            });

            // Insert like count if available
            if (comic.thumbCount > 0) {
              await this.db.db.prepare(`
                INSERT OR REPLACE INTO like_counts (comic_id, comic_type, count, created_at, updated_at)
                VALUES (?, 'comic', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).bind(comic.num, comic.thumbCount).run();
            }

            synced++;
            console.log(`Synced comic ${comic.num}: ${comic.title}`);
          } catch (error) {
            console.error(`Error syncing comic ${comic.num}:`, error);
            errors++;
          }
        }

        currentStart += size;
        
        // Add delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error fetching comics from ${currentStart}:`, error);
        errors++;
        break;
      }
    }

    console.log(`XKCD sync completed. Synced: ${synced}, Errors: ${errors}`);
    return { synced, errors };
  }

  /**
   * Sync What If articles from API to local D1
   */
  async syncWhatIfArticles(start: number = 1, size: number = 100): Promise<{ synced: number, errors: number }> {
    let synced = 0;
    let errors = 0;
    let currentStart = start;

    console.log(`Starting What If articles sync from ${start} with size ${size}`);

    while (true) {
      try {
        const url = `${this.baseUrl}/what-if-list?start=${currentStart}&size=${size}`;
        console.log(`Fetching: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const articles: WhatIfApiArticle[] = await response.json();
        
        if (articles.length === 0) {
          console.log('No more articles to sync');
          break;
        }

        console.log(`Processing ${articles.length} articles starting from ${currentStart}`);

        for (const article of articles) {
          try {
            await this.db.insertWhatIf({
              id: article.num,
              title: article.title,
              url: `https://what-if.xkcd.com/${article.num}/`,
              date: article.date,
              question: `What if ${article.title}?`,
              answer: `This is a placeholder answer for ${article.title}.`
            });

            // Insert like count if available
            if (article.thumbCount > 0) {
              await this.db.db.prepare(`
                INSERT OR REPLACE INTO like_counts (comic_id, comic_type, count, created_at, updated_at)
                VALUES (?, 'what_if', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
              `).bind(article.num, article.thumbCount).run();
            }

            synced++;
            console.log(`Synced What If article ${article.num}: ${article.title}`);
          } catch (error) {
            console.error(`Error syncing article ${article.num}:`, error);
            errors++;
          }
        }

        currentStart += size;
        
        // Add delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error fetching articles from ${currentStart}:`, error);
        errors++;
        break;
      }
    }

    console.log(`What If sync completed. Synced: ${synced}, Errors: ${errors}`);
    return { synced, errors };
  }

  /**
   * Sync all data (comics + what if articles)
   */
  async syncAll(): Promise<{ comics: { synced: number, errors: number }, whatIf: { synced: number, errors: number } }> {
    console.log('Starting full data sync...');
    
    const comics = await this.syncXkcdComics();
    const whatIf = await this.syncWhatIfArticles();
    
    console.log('Full sync completed');
    return { comics, whatIf };
  }

  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{ comics: number, whatIf: number, lastSync: string }> {
    const comicsCount = await this.db.db.prepare('SELECT COUNT(id) as count FROM comics').first();
    const whatIfCount = await this.db.db.prepare('SELECT COUNT(id) as count FROM what_if').first();
    
    return {
      comics: (comicsCount as any).count || 0,
      whatIf: (whatIfCount as any).count || 0,
      lastSync: new Date().toISOString()
    };
  }
}
