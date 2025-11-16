import { RouterType } from 'itty-router';
import { createJsonResponse, createErrorResponse } from '../http/response';
import { resolveLocale } from '../i18n/locale';
import { withCache, withDynamicCache } from '../http/cache';

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
  // Apply dynamic caching: long cache for non-last chunks, short cache for last chunk
  // Cache time is determined by hasMore flag from response (no hardcoded values)
  router.get('/xkcd-list', withDynamicCache(async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const start = parseInt(url.searchParams.get('start') || '0');
      const size = parseInt(url.searchParams.get('size') || '100');
      const reversed = url.searchParams.get('reversed') === '1';

      const { comics, hasMore } = await db.getComicsWithPagination(start, size, reversed);

      const response = createJsonResponse(convertIdToNum(comics));
      response.headers.set('X-Pagination-Start', start.toString());
      response.headers.set('X-Pagination-Size', size.toString());
      response.headers.set('X-Pagination-Reversed', reversed ? '1' : '0');
      response.headers.set('X-Pagination-HasMore', hasMore ? '1' : '0');
      if (hasMore) {
        response.headers.set('X-Pagination-NextStart', (start + size).toString());
      }
      return response;
    } catch (error) {
      console.error('Error in /xkcd-list:', error);
      return createErrorResponse('Failed to fetch comics list');
    }
  }, 
  // Default cache options (used for cache lookup, will be overridden by response-based options)
  (request) => {
    // Default to long cache, will be adjusted based on response
    return { ttl: 86400, browserTtl: 3600 };
  },
  // Cache options based on response - determines if this is the last chunk
  (request, response) => {
    const url = new URL(request.url);
    const start = parseInt(url.searchParams.get('start') || '0');
    const size = parseInt(url.searchParams.get('size') || '100');
    const reversed = url.searchParams.get('reversed') === '1';
    const hasMore = response.headers.get('X-Pagination-HasMore') === '1';
    
    // For reversed queries, we can't reliably determine last chunk from hasMore alone
    // So we use default long cache for reversed queries
    if (reversed) {
      return { ttl: 86400, browserTtl: 3600 };
    }
    
    // Special case: if size is 1 and start <= 3000, use long cache (old comics)
    if (size === 1 && start <= 3000) {
      // Long cache for old comics (24 hours edge, 1 hour browser)
      return { ttl: 86400, browserTtl: 3600 };
    }
    
    // If hasMore is false, this is the last chunk - use short cache
    // If hasMore is true, there are more chunks - use long cache
    if (!hasMore) {
      // Short cache for last chunk (5 minutes edge, 1 minute browser)
      return { ttl: 300, browserTtl: 60 };
    } else {
      // Long cache for other chunks (24 hours edge, 1 hour browser)
      return { ttl: 86400, browserTtl: 3600 };
    }
  }));

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
  router.get('/xkcd-suggest', withCache(async (request, env, ctx, { db }) => {
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
  }, {
    ttl: 600,        // 10 minutes edge cache
    browserTtl: 120, // 2 minutes browser cache
    notFoundTtl: 60  // 1 minute for 404
  }));
}


