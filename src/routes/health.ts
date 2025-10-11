import { RouterType } from 'itty-router';
import { createJsonResponse } from '../http/response';

export function registerHealthRoutes(router: RouterType) {
/**
 * Health check endpoint
 * GET /ping
 */
  router.get('/ping', () => {
    return createJsonResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'xkcd'
    });
  });
}


