import { RouterType } from 'itty-router';
import { createJsonResponse, createErrorResponse } from '../http/response';

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

export function registerWhatIfRoutes(router: RouterType) {
  // GET /what-if-list
  router.get('/what-if-list', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const start = parseInt(url.searchParams.get('start') || '0');
      const size = parseInt(url.searchParams.get('size') || '100');
      const reversed = url.searchParams.get('reversed') === '1';

      const { whatIfs, hasMore, total } = await db.getWhatIfList(start, size, reversed);

      const response = createJsonResponse(convertIdToNum(whatIfs));
      response.headers.set('X-Pagination-Start', start.toString());
      response.headers.set('X-Pagination-Size', size.toString());
      response.headers.set('X-Pagination-Reversed', reversed ? '1' : '0');
      response.headers.set('X-Pagination-Total', total.toString());
      response.headers.set('X-Pagination-HasMore', hasMore ? '1' : '0');
      response.headers.set('X-Pagination-NextStart', hasMore ? (start + size).toString() : '');
      return response;
    } catch (error) {
      console.error('Error in /what-if-list:', error);
      return createErrorResponse('Failed to fetch What If articles list');
    }
  });

  // GET /what-if/:id
  router.get('/what-if/:id', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      // Extract ID from /what-if/:id pattern
      const pathMatch = url.pathname.match(/\/what-if\/(\d+)/);
      if (!pathMatch) return createErrorResponse('Invalid What If article ID', 400);
      const id = parseInt(pathMatch[1]);
      if (isNaN(id) || id <= 0) return createErrorResponse('Invalid What If article ID', 400);
      const whatIf = await db.getWhatIf(id);
      if (!whatIf) return createErrorResponse('What If article not found', 404);
      return createJsonResponse(convertIdToNum(whatIf));
    } catch (error) {
      console.error('Error in /what-if/:id:', error);
      return createErrorResponse('Failed to fetch What If article');
    }
  });

  // POST /what-if-thumb-up
  router.post('/what-if-thumb-up', async (request, env, ctx, { db }) => {
    try {
      const formData = await request.formData();
      const articleId = parseInt((formData.get('what_if_id') as string) || '0');
      if (isNaN(articleId) || articleId <= 0) return createErrorResponse('Invalid what_if_id parameter', 400);
      const whatIf = await db.getWhatIf(articleId);
      if (!whatIf) return createErrorResponse('What If article not found', 404);
      const newCount = await db.incrementLikeCount(articleId, 'what_if');
      return createJsonResponse({ thumbCount: newCount, num: articleId });
    } catch (error) {
      console.error('Error in /what-if-thumb-up:', error);
      return createErrorResponse('Failed to process What If thumb-up');
    }
  });

  // GET /what-if-top
  router.get('/what-if-top', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const sortby = url.searchParams.get('sortby') || 'thumb-up';
      const size = parseInt(url.searchParams.get('size') || '10');
      if (sortby !== 'thumb-up') return createErrorResponse('Only thumb-up sorting is supported', 400);
      const topWhatIfs = await db.getTopLiked('what_if', size);
      const result = topWhatIfs.map((wi: any) => ({ num: wi.comic_id }));
      return createJsonResponse(result);
    } catch (error) {
      console.error('Error in /what-if-top:', error);
      return createErrorResponse('Failed to get top What If articles');
    }
  });

  // GET /what-if-random
  router.get('/what-if-random', async (request, env, ctx, { db }) => {
    try {
      const randomWhatIf = await db.getRandomWhatIf();
      if (!randomWhatIf) return createErrorResponse('No What If articles found', 404);
      return createJsonResponse(convertIdToNum(randomWhatIf));
    } catch (error) {
      console.error('Error in /what-if-random:', error);
      return createErrorResponse('Failed to get random What If article');
    }
  });

  // GET /what-if-suggest
  router.get('/what-if-suggest', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const keyword = url.searchParams.get('q');
      const size = parseInt(url.searchParams.get('size') || '20');
      if (!keyword) return createErrorResponse('Missing required parameter: q', 400);
      const results = await db.searchWhatIf(keyword, size);
      return createJsonResponse(convertIdToNum(results));
    } catch (error) {
      console.error('Error in /what-if-suggest:', error);
      return createErrorResponse('Failed to search What If articles');
    }
  });
}


