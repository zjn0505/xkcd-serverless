import { Router, RouterType } from 'itty-router';
import { createJsonResponse, createErrorResponse } from '../http/response';
import { DataSync } from '../sync';

export function registerAdminRoutes(router: RouterType) {
  router.post('/sync/xkcd', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const start = parseInt(url.searchParams.get('start') || '1');
      const size = parseInt(url.searchParams.get('size') || '100');
      const sync = new DataSync(db);
      const result = await sync.syncXkcdComics(start, size);
      return createJsonResponse({ message: 'XKCD sync completed', synced: result.synced, errors: result.errors });
    } catch (error) {
      console.error('Error in /sync/xkcd:', error);
      return createErrorResponse('Failed to sync XKCD comics');
    }
  });

  router.post('/sync/whatif', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const start = parseInt(url.searchParams.get('start') || '1');
      const size = parseInt(url.searchParams.get('size') || '100');
      const sync = new DataSync(db);
      const result = await sync.syncWhatIfArticles(start, size);
      return createJsonResponse({ message: 'What If sync completed', synced: result.synced, errors: result.errors });
    } catch (error) {
      console.error('Error in /sync/whatif:', error);
      return createErrorResponse('Failed to sync What If articles');
    }
  });

  router.post('/sync/all', async (request, env, ctx, { db }) => {
    try {
      const sync = new DataSync(db);
      const result = await sync.syncAll();
      return createJsonResponse({ message: 'Full sync completed', comics: result.comics, whatIf: result.whatIf });
    } catch (error) {
      console.error('Error in /sync/all:', error);
      return createErrorResponse('Failed to sync all data');
    }
  });

  router.get('/sync/status', async (request, env, ctx, { db }) => {
    try {
      const sync = new DataSync(db);
      const status = await sync.getSyncStatus();
      return createJsonResponse(status);
    } catch (error) {
      console.error('Error in /sync/status:', error);
      return createErrorResponse('Failed to get sync status');
    }
  });

  // GET /overview
  router.get('/overview', async (request, env, ctx, { db }) => {
    try {
      const comicsCount = await db.db.prepare('SELECT COUNT(id) as count FROM comics').first();
      const whatIfCount = await db.db.prepare('SELECT COUNT(id) as count FROM what_if').first();
      const likeCountsTotal = await db.db.prepare('SELECT COUNT(id) as count FROM like_counts').first();

      const comicLikes = await db.db.prepare(`
        SELECT COUNT(id) as count, SUM(count) as total 
        FROM like_counts 
        WHERE comic_type = 'comic'
      `).first();

      const whatIfLikes = await db.db.prepare(`
        SELECT COUNT(id) as count, SUM(count) as total 
        FROM like_counts 
        WHERE comic_type = 'what_if'
      `).first();

      const latestComics = await db.db.prepare(`
        SELECT id, title, year, month, day 
        FROM comics 
        ORDER BY id DESC 
        LIMIT 5
      `).all();

      const latestWhatIf = await db.db.prepare(`
        SELECT id, title, date 
        FROM what_if 
        ORDER BY id DESC 
        LIMIT 5
      `).all();

      const topComics = await db.db.prepare(`
        SELECT lc.comic_id, lc.count, c.title 
        FROM like_counts lc 
        JOIN comics c ON lc.comic_id = c.id 
        WHERE lc.comic_type = 'comic' 
        ORDER BY lc.count DESC 
        LIMIT 5
      `).all();

      const topWhatIf = await db.db.prepare(`
        SELECT lc.comic_id, lc.count, w.title 
        FROM like_counts lc 
        JOIN what_if w ON lc.comic_id = w.id 
        WHERE lc.comic_type = 'what_if' 
        ORDER BY lc.count DESC 
        LIMIT 5
      `).all();

      const localizedCounts = await Promise.all([
        db.db.prepare('SELECT COUNT(id) as count FROM comics_zh_cn').first(),
        db.db.prepare('SELECT COUNT(id) as count FROM comics_zh_tw').first(),
        db.db.prepare('SELECT COUNT(id) as count FROM comics_es').first(),
        db.db.prepare('SELECT COUNT(id) as count FROM comics_fr').first(),
        db.db.prepare('SELECT COUNT(id) as count FROM comics_de').first(),
        db.db.prepare('SELECT COUNT(id) as count FROM comics_ja').first()
      ]);

      const overview = {
        summary: {
          totalComics: (comicsCount as any)?.count || 0,
          totalWhatIf: (whatIfCount as any)?.count || 0,
          totalLikeRecords: (likeCountsTotal as any)?.count || 0,
          totalComicLikes: (comicLikes as any)?.total || 0,
          totalWhatIfLikes: (whatIfLikes as any)?.total || 0
        },
        latest: {
          comics: latestComics.results || [],
          whatIf: latestWhatIf.results || []
        },
        topLiked: {
          comics: topComics.results || [],
          whatIf: topWhatIf.results || []
        },
        localized: {
          'zh-cn': (localizedCounts[0] as any)?.count || 0,
          'zh-tw': (localizedCounts[1] as any)?.count || 0,
          'es': (localizedCounts[2] as any)?.count || 0,
          'fr': (localizedCounts[3] as any)?.count || 0,
          'de': (localizedCounts[4] as any)?.count || 0,
          'ja': (localizedCounts[5] as any)?.count || 0
        },
        lastUpdated: new Date().toISOString()
      };

      return createJsonResponse(overview);
    } catch (error) {
      console.error('Error in /overview:', error);
      return createErrorResponse('Failed to get data overview');
    }
  });
}


