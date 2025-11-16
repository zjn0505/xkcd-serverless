import { Router, RouterType } from 'itty-router';
import { createJsonResponse, createErrorResponse } from '../http/response';
import { DataSync } from '../sync';
import { sendNotificationViaLambda } from '../utils/lambda-fcm';

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
  router.get('/overview.json', async (request, env, ctx, { db }) => {
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
        db.db.prepare('SELECT COUNT(id) as count FROM comics_ru').first()
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
          'ru': (localizedCounts[5] as any)?.count || 0
        },
        lastUpdated: new Date().toISOString()
      };

      return createJsonResponse(overview);
    } catch (error) {
      console.error('Error in /overview:', error);
      return createErrorResponse('Failed to get data overview');
    }
  });

  /**
   * POST /admin/fcm/test
   * Test FCM notification by sending to a specific device token
   * Bypasses FCM_ENABLED check - always sends if Lambda URL is configured
   * 
   * Request body:
   * {
   *   type: 'xkcd' | 'whatif',
   *   id?: number,  // Optional: comic/article ID. If not provided, uses latest
   *   token: string // FCM device token
   * }
   */
  router.post('/admin/fcm/test', async (request, env, ctx, { db }) => {
    try {
      // Parse request body
      let body: any;
      try {
        body = await request.json();
      } catch (error) {
        return createErrorResponse('Invalid JSON in request body', 400);
      }

      const { type, id, token } = body;

      // Validate required fields
      if (!type || (type !== 'xkcd' && type !== 'whatif')) {
        return createErrorResponse('Invalid type. Must be "xkcd" or "whatif"', 400);
      }

      if (!token || typeof token !== 'string') {
        return createErrorResponse('Missing or invalid token. Must be a string', 400);
      }

      // Check Lambda configuration
      if (!env.LAMBDA_FCM_URL) {
        return createErrorResponse('LAMBDA_FCM_URL not configured', 500);
      }

      const lambdaUrl = env.LAMBDA_FCM_URL;
      const apiKey = env.LAMBDA_API_KEY || null;

      let data: any;
      let notificationResult: any;

      if (type === 'xkcd') {
        // Get comic data
        let comic;
        if (id) {
          comic = await db.getComic(id);
          if (!comic) {
            return createErrorResponse(`Comic ${id} not found`, 404);
          }
        } else {
          comic = await db.getLatestComic();
          if (!comic) {
            return createErrorResponse('No comics found in database', 404);
          }
        }

        // Prepare comic data for notification
        const comicData = {
          num: comic.id,
          title: comic.title,
          img: comic.img,
          alt: comic.alt,
          year: comic.year,
          month: comic.month,
          day: comic.day,
          width: comic.width,
          height: comic.height,
        };

        // Send notification to device token (bypassing FCM_ENABLED)
        notificationResult = await sendNotificationViaLambda(lambdaUrl, apiKey, {
          tokens: [token],
          data: {
            xkcd: JSON.stringify(comicData),
          },
          android: {
            collapse_key: 'new_comics',
            priority: 'high',
            ttl: 60 * 60 * 24 * 2 * 1000, // 2 days
            fcm_options: {
              analytics_label: `${comic.id}-Android`,
            },
          },
          fcm_options: {
            analytics_label: `${comic.id}`,
          },
        });

        data = {
          type: 'xkcd',
          comic: comicData,
          sent: true,
        };
      } else if (type === 'whatif') {
        // Get What If article data
        let article;
        if (id) {
          article = await db.getWhatIf(id);
          if (!article) {
            return createErrorResponse(`What If article ${id} not found`, 404);
          }
        } else {
          article = await db.getLatestWhatIf();
          if (!article) {
            return createErrorResponse('No What If articles found in database', 404);
          }
        }

        // Prepare article data for notification
        const articleData = {
          num: article.id,
          title: article.title,
          url: article.url,
          date: article.date,
          featureImg: `https://what-if.xkcd.com/imgs/a/${article.id}/archive_crop.png`,
        };

        // Send notification to device token (bypassing FCM_ENABLED)
        notificationResult = await sendNotificationViaLambda(lambdaUrl, apiKey, {
          tokens: [token],
          data: {
            whatif: JSON.stringify(articleData),
          },
          android: {
            collapse_key: 'new_comics',
            priority: 'high',
            ttl: 60 * 60 * 24 * 7 * 4 * 1000, // 4 weeks
            fcm_options: {
              analytics_label: `${article.id}-Android`,
            },
          },
          fcm_options: {
            analytics_label: `${article.id}`,
          },
        });

        data = {
          type: 'whatif',
          article: articleData,
          sent: true,
        };
      }

      return createJsonResponse({
        success: true,
        data,
        notification: notificationResult,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error in /admin/fcm/test:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return createErrorResponse(`Failed to send test FCM notification: ${errorMessage}`, 500);
    }
  });
}