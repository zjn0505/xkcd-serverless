import { Router, RouterType } from 'itty-router';
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

export function registerLocalizedRoutes(router: RouterType) {
  // GET /archive
  router.get('/archive', withCache(async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const start = parseInt(url.searchParams.get('start') || '0');
      const size = parseInt(url.searchParams.get('size') || '100');
      const locale = resolveLocale(url.searchParams.get('locale'));
      const comics = await db.getLocalizedComics(start, size, locale);
      return createJsonResponse(convertIdToNum(comics));
    } catch (error) {
      console.error('Error in /archive:', error);
      return createErrorResponse('Failed to fetch localized archive');
    }
  }, {
    ttl: 3600,      // 1 hour edge cache (archive updates frequently)
    browserTtl: 300 // 5 minutes browser cache
  }));

  // GET /:comicId/info.0.json (localized JSON)
  router.get('/:comicId/info.0.json', withCache(async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      // Extract comicId from /:comicId/info.0.json pattern
      const pathMatch = url.pathname.match(/^\/(\d+)\/info\.0\.json$/);
      if (!pathMatch) return createErrorResponse('Invalid comic ID', 400);
      const comicId = parseInt(pathMatch[1]);
      if (isNaN(comicId) || comicId <= 0) return createErrorResponse('Invalid comic ID', 400);
      const locale = resolveLocale(url.searchParams.get('locale'));
      const localized = await db.getLocalizedComic(comicId, locale);
      if (localized) {
        // Transform to match XKCD API format: {_id, num, title, img, alt}
        const response = {
          _id: localized.id,
          num: localized.id,
          title: localized.title,
          img: localized.img,
          alt: localized.alt || ''
        };
        return createJsonResponse(response);
      }
      return createErrorResponse('Localized comic not found', 404);
    } catch (error) {
      console.error('Error in localized /:comicId/info.0.json:', error);
      return createErrorResponse('Failed to fetch localized comic');
    }
  }, {
    ttl: 86400,        // 24 hours edge cache (localized comics rarely change)
    browserTtl: 3600,  // 1 hour browser cache
    notFoundTtl: 600   // 10 minutes for 404 (comic might be translated soon)
  }));
}


