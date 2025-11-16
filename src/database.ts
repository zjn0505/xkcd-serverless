import { Comic, WhatIf, LocalizedComic, LikeCount, CrawlTask, SupportedLanguage } from './types';

export class Database {
  public db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // Fields to select for comic queries (exclude unused fields: news, transcript, link, safe_title, created_at, updated_at)
  private readonly COMIC_SELECT_FIELDS = 'id, title, alt, img, year, month, day, width, height';

  // Comic related operations
  async getComic(id: number): Promise<Comic | null> {
    const result = await this.db
      .prepare(`SELECT ${this.COMIC_SELECT_FIELDS} FROM comics WHERE id = ?`)
      .bind(id)
      .first();
    return result as Comic | null;
  }

  async getLatestComic(): Promise<Comic | null> {
    const result = await this.db
      .prepare(`SELECT ${this.COMIC_SELECT_FIELDS} FROM comics ORDER BY id DESC LIMIT 1`)
      .first();
    return result as Comic | null;
  }

  async getComics(start: number = 0, size: number = 100, reversed: boolean = false): Promise<Comic[]> {
    const order = reversed ? 'DESC' : 'ASC';
    const operator = reversed ? '<=' : '>=';
    const result = await this.db
      .prepare(`SELECT ${this.COMIC_SELECT_FIELDS} FROM comics WHERE id ${operator} ? ORDER BY id ${order} LIMIT ?`)
      .bind(start, size)
      .all();
    return result.results as unknown as Comic[];
  }

  async getComicsWithPagination(start: number = 0, size: number = 100, reversed: boolean = false, includeTotal: boolean = false): Promise<{ comics: Comic[], hasMore: boolean, total: number }> {
    const order = reversed ? 'DESC' : 'ASC';
    const operator = reversed ? '<=' : '>=';
    
    // Get total count only if requested (avoid expensive COUNT query when not needed)
    let total = -1;
    if (includeTotal) {
      const totalResult = await this.db
        .prepare('SELECT COUNT(id) as count FROM comics')
        .first();
      total = (totalResult as any).count || 0;
    }
    
    // Optimization for size = 1: query only the needed record, skip hasMore check
    if (size === 1) {
      const result = await this.db
        .prepare(`SELECT ${this.COMIC_SELECT_FIELDS} FROM comics WHERE id ${operator} ? ORDER BY id ${order} LIMIT 1`)
        .bind(start)
        .all();
      
      const comics = result.results as unknown as Comic[];
      
      // When size = 1, hasMore is not needed, always return false
      return { comics, hasMore: false, total };
    }
    
    // For size > 1, use the original approach (query size + 1 records)
    const result = await this.db
      .prepare(`SELECT ${this.COMIC_SELECT_FIELDS} FROM comics WHERE id ${operator} ? ORDER BY id ${order} LIMIT ?`)
      .bind(start, size + 1)
      .all();
    
    const comics = result.results as unknown as Comic[];
    const hasMore = comics.length > size;
    
    // Remove the extra record if it exists
    if (hasMore) {
      comics.pop();
    }
    
    return { comics, hasMore, total };
  }

  async insertComic(comic: Omit<Comic, 'created_at' | 'updated_at'>): Promise<void> {
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO comics 
        (id, title, alt, img, transcript, year, month, day, link, news, safe_title, width, height)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        comic.id,
        comic.title || '',
        comic.alt || '',
        comic.img || '',
        comic.transcript || '',
        comic.year || 0,
        comic.month || 0,
        comic.day || 0,
        comic.link || '',
        comic.news || '',
        comic.safe_title || '',
        comic.width || null,
        comic.height || null
      )
      .run();
  }


  // Fields to select for what_if queries (exclude unused fields: question, answer, created_at, updated_at)
  private readonly WHATIF_SELECT_FIELDS = 'id, title, url, date';

  async insertWhatIf(whatIf: Omit<WhatIf, 'created_at' | 'updated_at'>): Promise<void> {
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO what_if 
        (id, title, url, date)
        VALUES (?, ?, ?, ?)
      `)
      .bind(
        whatIf.id,
        whatIf.title || '',
        whatIf.url || '',
        whatIf.date || ''
      )
      .run();
  }

  // Localized comics related operations
  private getLocalizedTableName(language: SupportedLanguage): string {
    // Normalize hyphenated locales to underscores to match table names
    const normalized = (language as string).replace('-', '_');
    return `comics_${normalized}`;
  }

  async getLocalizedComic(id: number, language: SupportedLanguage): Promise<LocalizedComic | null> {
    const tableName = this.getLocalizedTableName(language);
    const result = await this.db
      .prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
      .bind(id)
      .first();
    return result as LocalizedComic | null;
  }

  async getLocalizedComics(start: number = 0, size: number = 100, language: SupportedLanguage): Promise<LocalizedComic[]> {
    const tableName = this.getLocalizedTableName(language);
    const result = await this.db
      .prepare(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .bind(size, start)
      .all();
    return result.results as unknown as LocalizedComic[];
  }

  async insertLocalizedComic(comic: Omit<LocalizedComic, 'created_at' | 'updated_at'>, language: SupportedLanguage): Promise<void> {
    const tableName = this.getLocalizedTableName(language);
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO ${tableName} 
        (id, title, alt, img, transcript, source_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        comic.id,
        comic.title,
        comic.alt,
        comic.img,
        comic.transcript,
        comic.source_url
      )
      .run();
  }

  async getAvailableLanguages(comicId: number): Promise<SupportedLanguage[]> {
    const languages: SupportedLanguage[] = ['zh-cn', 'zh-tw', 'es', 'fr', 'de', 'ru'];
    const availableLanguages: SupportedLanguage[] = [];
    
    for (const lang of languages) {
      const tableName = this.getLocalizedTableName(lang);
      const result = await this.db
        .prepare(`SELECT COUNT(id) as count FROM ${tableName} WHERE id = ?`)
        .bind(comicId)
        .first();
      
      if ((result as any).count > 0) {
        availableLanguages.push(lang);
      }
    }
    
    return availableLanguages;
  }

  // Like count related operations
  async incrementLikeCount(comicId: number, comicType: 'comic' | 'what_if'): Promise<number> {
    // Use UPSERT approach - try INSERT first, then UPDATE if it fails
    try {
      // Try to insert new record
      const insertResult = await this.db
        .prepare(`
          INSERT INTO like_counts (comic_id, comic_type, count)
          VALUES (?, ?, 1)
        `)
        .bind(comicId, comicType)
        .run();
      
      // If insert succeeded, return 1
      if ((insertResult as any).changes > 0) {
        return 1;
      }
    } catch (error) {
      // If insert failed (likely due to unique constraint), try to update
      const updateResult = await this.db
        .prepare(`
          UPDATE like_counts 
          SET count = count + 1, updated_at = CURRENT_TIMESTAMP 
          WHERE comic_id = ? AND comic_type = ?
        `)
        .bind(comicId, comicType)
        .run();
    }

    // Return updated count
    const countResult = await this.db
      .prepare('SELECT count FROM like_counts WHERE comic_id = ? AND comic_type = ?')
      .bind(comicId, comicType)
      .first();
    
    return (countResult as any)?.count || 1;
  }

  async getLikeCount(comicId: number, comicType: 'comic' | 'what_if'): Promise<number> {
    const result = await this.db
      .prepare('SELECT count FROM like_counts WHERE comic_id = ? AND comic_type = ?')
      .bind(comicId, comicType)
      .first();
    return (result as any)?.count || 0;
  }

  async getTopLiked(comicType: 'comic' | 'what_if', limit: number = 10): Promise<LikeCount[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM like_counts 
        WHERE comic_type = ? 
        ORDER BY count DESC 
        LIMIT ?
      `)
      .bind(comicType, limit)
      .all();
    return result.results as unknown as LikeCount[];
  }

  async getRandomComic(): Promise<Comic | null> {
    const result = await this.db
      .prepare(`SELECT ${this.COMIC_SELECT_FIELDS} FROM comics ORDER BY RANDOM() LIMIT 1`)
      .first();
    return result as Comic | null;
  }

  async searchComics(keyword: string, limit: number = 20): Promise<Comic[]> {
    const numericId = parseInt(keyword);
    const isNumeric = !isNaN(numericId) && numericId > 0;
    
    let query: string;
    let params: any[];
    
    if (isNumeric) {
      // Search by ID or text fields (transcript used in WHERE but not returned)
      query = `
        SELECT ${this.COMIC_SELECT_FIELDS} FROM comics 
        WHERE id = ? 
           OR title LIKE ? 
           OR alt LIKE ? 
           OR transcript LIKE ?
        ORDER BY 
          CASE WHEN id = ? THEN 1 ELSE 2 END,
          id DESC
        LIMIT ?
      `;
      const searchTerm = `%${keyword}%`;
      params = [numericId, searchTerm, searchTerm, searchTerm, numericId, limit];
    } else {
      // Search with exact match priority using SQL CASE (case insensitive)
      // transcript used in WHERE/ORDER BY but not returned
      query = `
        SELECT ${this.COMIC_SELECT_FIELDS} FROM comics 
        WHERE title COLLATE NOCASE = ? OR title COLLATE NOCASE LIKE ? OR alt COLLATE NOCASE = ? OR alt COLLATE NOCASE LIKE ? OR transcript COLLATE NOCASE = ? OR transcript COLLATE NOCASE LIKE ?
        ORDER BY 
          CASE 
            WHEN title COLLATE NOCASE = ? THEN 1
            WHEN alt COLLATE NOCASE = ? THEN 2
            WHEN transcript COLLATE NOCASE = ? THEN 3
            WHEN title COLLATE NOCASE LIKE ? THEN 4
            WHEN alt COLLATE NOCASE LIKE ? THEN 5
            WHEN transcript COLLATE NOCASE LIKE ? THEN 6
            ELSE 7
          END,
          id DESC
        LIMIT ?
      `;
      const searchTerm = `%${keyword}%`;
      params = [
        keyword, searchTerm, keyword, searchTerm, keyword, searchTerm,  // WHERE conditions
        keyword, keyword, keyword,  // exact matching ORDER BY
        searchTerm, searchTerm, searchTerm,  // phrase matching ORDER BY
        limit
      ];
    }
    
    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all();
    
    const comics = result.results as unknown as Comic[];
    
    return comics;
  }

  // What If related operations
  async getWhatIfList(start: number = 0, size: number = 100, reversed: boolean = false): Promise<{ whatIfs: WhatIf[], hasMore: boolean, total: number }> {
    const order = reversed ? 'DESC' : 'ASC';
    const operator = reversed ? '<=' : '>=';
    
    // Get total count (use COUNT(id) for better performance with primary key)
    const countResult = await this.db
      .prepare('SELECT COUNT(id) as count FROM what_if')
      .first();
    const total = (countResult as any).count || 0;
    
    // Get paginated results with one extra record to check if there are more
    const result = await this.db
      .prepare(`
        SELECT ${this.WHATIF_SELECT_FIELDS} FROM what_if 
        WHERE id ${operator} ?
        ORDER BY id ${order} 
        LIMIT ?
      `)
      .bind(start, size + 1)
      .all();
    
    const whatIfs = result.results as unknown as WhatIf[];
    const hasMore = whatIfs.length > size;
    
    // Remove the extra record if it exists
    if (hasMore) {
      whatIfs.pop();
    }
    
    return { whatIfs, hasMore, total };
  }

  async getWhatIf(id: number): Promise<WhatIf | null> {
    const result = await this.db
      .prepare(`SELECT ${this.WHATIF_SELECT_FIELDS} FROM what_if WHERE id = ?`)
      .bind(id)
      .first();
    return result as WhatIf | null;
  }

  async getRandomWhatIf(): Promise<WhatIf | null> {
    const result = await this.db
      .prepare(`SELECT ${this.WHATIF_SELECT_FIELDS} FROM what_if ORDER BY RANDOM() LIMIT 1`)
      .first();
    return result as WhatIf | null;
  }

  async searchWhatIf(keyword: string, limit: number = 20): Promise<WhatIf[]> {
    const numericId = parseInt(keyword);
    const isNumeric = !isNaN(numericId) && numericId > 0;
    
    let query: string;
    let params: any[];
    
    if (isNumeric) {
      // Search by ID or title (question and answer fields removed)
      query = `
        SELECT ${this.WHATIF_SELECT_FIELDS} FROM what_if 
        WHERE id = ? 
           OR title LIKE ?
        ORDER BY 
          CASE WHEN id = ? THEN 1 ELSE 2 END,
          id DESC
        LIMIT ?
      `;
      const searchTerm = `%${keyword}%`;
      params = [numericId, searchTerm, numericId, limit];
    } else {
      // Search only title field (question and answer fields removed)
      query = `
        SELECT ${this.WHATIF_SELECT_FIELDS} FROM what_if 
        WHERE title COLLATE NOCASE = ? OR title COLLATE NOCASE LIKE ?
        ORDER BY 
          CASE 
            WHEN title COLLATE NOCASE = ? THEN 1
            WHEN title COLLATE NOCASE LIKE ? THEN 2
            ELSE 3
          END,
          id DESC
        LIMIT ?
      `;
      const searchTerm = `%${keyword}%`;
      params = [
        keyword, searchTerm,  // WHERE conditions
        keyword, searchTerm,  // ORDER BY conditions
        limit
      ];
    }
    
    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all();
    
    const whatIfs = result.results as unknown as WhatIf[];
    
    return whatIfs;
  }

  // Crawler task related operations
  async getCrawlTask(taskType: 'xkcd' | 'what_if' | 'localized'): Promise<CrawlTask | null> {
    const result = await this.db
      .prepare('SELECT * FROM crawl_tasks WHERE task_type = ? ORDER BY created_at DESC LIMIT 1')
      .bind(taskType)
      .first();
    return result as CrawlTask | null;
  }

  async updateCrawlTask(taskId: number, updates: Partial<CrawlTask>): Promise<void> {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    
    await this.db
      .prepare(`UPDATE crawl_tasks SET ${fields} WHERE id = ?`)
      .bind(...values, taskId)
      .run();
  }

  async createCrawlTask(task: Omit<CrawlTask, 'id' | 'created_at'>): Promise<number> {
    const result = await this.db
      .prepare(`
        INSERT INTO crawl_tasks 
        (task_type, status, last_comic_id, total_processed, error_message, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        task.task_type,
        task.status,
        task.last_comic_id,
        task.total_processed,
        task.error_message,
        task.started_at,
        task.completed_at
      )
      .run();
    return result.meta.last_row_id;
  }
}
