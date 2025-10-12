import { Router, RouterType } from 'itty-router';
import { createJsonResponse, createErrorResponse } from '../http/response';
import { resolveLocale } from '../i18n/locale';

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
  // GET /info.0.json (latest localized comic)
  router.get('/info.0.json', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const locale = resolveLocale(url.searchParams.get('locale'));
      const localized = await db.getLatestLocalizedComic(locale);
      if (localized) {
        // Transform to match old API format: {_id, num, title, img, alt}
        const response = {
          _id: String(localized.id),
          num: String(localized.id),
          title: localized.title,
          img: localized.img,
          alt: localized.alt || ''
        };
        return createJsonResponse(response);
      }
      return createErrorResponse('No localized comics found', 404);
    } catch (error) {
      console.error('Error in /info.0.json:', error);
      return createErrorResponse('Failed to fetch latest localized comic');
    }
  });

  // GET /archive
  router.get('/archive', async (request, env, ctx, { db }) => {
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
  });

  // GET /:comicId/info.0.json (localized JSON)
  router.get('/:comicId/info.0.json', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const comicId = parseInt(url.pathname.split('/')[1]);
      if (isNaN(comicId)) return createErrorResponse('Invalid comic ID', 400);
      const locale = resolveLocale(url.searchParams.get('locale'));
      const localized = await db.getLocalizedComic(comicId, locale);
      if (localized) {
        // Transform to match old API format: {_id, num, title, img, alt}
        const response = {
          _id: String(localized.id),
          num: String(localized.id),
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
  });
}


