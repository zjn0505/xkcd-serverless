import { RouterType } from 'itty-router';
import { createJsonResponse, createErrorResponse } from '../http/response';
import { resolveLocale } from '../i18n/locale';
import { withCache } from '../http/cache';

// Helper function to convert id to num in response objects
function convertIdToNum(obj: any): any {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(convertIdToNum);
    } else {
      const converted = { ...obj };
      if ('id' in converted) {
        converted.num = converted.id;
        delete converted.id;
      }
      return converted;
    }
  }
  return obj;
}

export function registerXkcdRoutes(router: RouterType) {
  // GET /xkcd-list
  router.get('/xkcd-list', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const start = parseInt(url.searchParams.get('start') || '0');
      const size = parseInt(url.searchParams.get('size') || '100');
      const reversed = url.searchParams.get('reversed') === '1';

      const { comics, hasMore, total } = await db.getComicsWithPagination(start, size, reversed);

      const response = createJsonResponse(convertIdToNum(comics));
      response.headers.set('X-Pagination-Start', start.toString());
      response.headers.set('X-Pagination-Size', size.toString());
      response.headers.set('X-Pagination-Reversed', reversed ? '1' : '0');
      response.headers.set('X-Pagination-Total', total.toString());
      response.headers.set('X-Pagination-HasMore', hasMore ? '1' : '0');
      response.headers.set('X-Pagination-NextStart', hasMore ? (start + size).toString() : '');
      return response;
    } catch (error) {
      console.error('Error in /xkcd-list:', error);
      return createErrorResponse('Failed to fetch comics list');
    }
  });

  // GET /:comicId/info.0.json (official; supports ?locale fallback)
  router.get('/:comicId/info.0.json', withCache(async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      // Extract comicId from /xkcd/:comicId/info.0.json pattern (with base /xkcd)
      const pathMatch = url.pathname.match(/^\/xkcd\/(\d+)\/info\.0\.json$/);
      if (!pathMatch) return createErrorResponse('Invalid comic ID', 400);
      const comicId = parseInt(pathMatch[1]);
      if (isNaN(comicId) || comicId <= 0) return createErrorResponse('Invalid comic ID', 400);

      const localeParam = url.searchParams.get('locale');
      if (localeParam) {
        const locale = resolveLocale(localeParam);
        const localized = await db.getLocalizedComic(comicId, locale);
        if (!localized) return createErrorResponse('Localized comic not found', 404);
        return createJsonResponse(convertIdToNum(localized));
      }

      const comic = await db.getComic(comicId);
      if (!comic) return createErrorResponse('Comic not found', 404);
      return createJsonResponse(convertIdToNum(comic));
    } catch (error) {
      console.error('Error in /:comicId/info.0.json:', error);
      return createErrorResponse('Failed to fetch comic info');
    }
  }, {
    ttl: 86400,        // 24 hours edge cache
    browserTtl: 3600,  // 1 hour browser cache
    notFoundTtl: 600   // 10 minutes for 404
  }));

  // POST /xkcd-thumb-up
  router.post('/xkcd-thumb-up', async (request, env, ctx, { db }) => {
    try {
      const formData = await request.formData();
      const comicId = parseInt((formData.get('comic_id') as string) || '0');
      if (isNaN(comicId) || comicId <= 0) {
        return createErrorResponse('Invalid comic_id parameter', 400);
      }
      const comic = await db.getComic(comicId);
      if (!comic) return createErrorResponse('Comic not found', 404);
      const newCount = await db.incrementLikeCount(comicId, 'comic');
      return createJsonResponse({ thumbCount: newCount, num: comicId });
    } catch (error) {
      console.error('Error in /xkcd-thumb-up:', error);
      return createErrorResponse('Failed to process thumb-up');
    }
  });

  // GET /xkcd-top
  router.get('/xkcd-top', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const sortby = url.searchParams.get('sortby') || 'thumb-up';
      const size = parseInt(url.searchParams.get('size') || '10');
      if (sortby !== 'thumb-up') return createErrorResponse('Only thumb-up sorting is supported', 400);
      const topComics = await db.getTopLiked('comic', size);
      const result = topComics.map((comic: any) => ({ num: comic.comic_id }));
      return createJsonResponse(result);
    } catch (error) {
      console.error('Error in /xkcd-top:', error);
      return createErrorResponse('Failed to get top comics');
    }
  });

  // GET /xkcd-random
  router.get('/xkcd-random', async (request, env, ctx, { db }) => {
    try {
      const randomComic = await db.getRandomComic();
      if (!randomComic) return createErrorResponse('No comics found', 404);
      return createJsonResponse(convertIdToNum(randomComic));
    } catch (error) {
      console.error('Error in /xkcd-random:', error);
      return createErrorResponse('Failed to get random comic');
    }
  });

  // GET /xkcd-suggest
  router.get('/xkcd-suggest', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const keyword = url.searchParams.get('q');
      const size = parseInt(url.searchParams.get('size') || '20');
      if (!keyword) return createErrorResponse('Missing required parameter: q', 400);
      const results = await db.searchComics(keyword, size);
      return createJsonResponse(convertIdToNum(results));
    } catch (error) {
      console.error('Error in /xkcd-suggest:', error);
      return createErrorResponse('Failed to search comics');
    }
  });
}


