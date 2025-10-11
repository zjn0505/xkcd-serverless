import { Router } from 'itty-router';
import { Database } from './database';
import { DataSync } from './sync';
import { createJsonResponse, createErrorResponse } from './http/response';
import { resolveLocale } from './i18n/locale';
import { XkcdCrawler } from './crawlers/xkcd';
import { WhatIfCrawler } from './crawlers/whatif';
import { LocalizedZhCnCrawler } from './crawlers/localized_zh_cn';
import { registerHealthRoutes } from './routes/health';
import { registerXkcdRoutes } from './routes/xkcd';
import { registerWhatIfRoutes } from './routes/whatif';
import { registerLocalizedRoutes } from './routes/localized';
import { registerAdminRoutes } from './routes/admin';
import { registerCrawlerRoutes } from './routes/crawler';
import overviewHtml from '../public/overview.html';

// Create API router for api2.jienan.xyz/xkcd
const apiRouter = Router({ base: '/xkcd' });
registerHealthRoutes(apiRouter);
registerXkcdRoutes(apiRouter);
registerWhatIfRoutes(apiRouter);

// Create localized router for xkcd2.jienan.xyz
const localizedRouter = Router();
registerHealthRoutes(localizedRouter);
registerLocalizedRoutes(localizedRouter);

// Create main router (default for xkcd.zjn0505.workers.dev)
const mainRouter = Router();
registerHealthRoutes(mainRouter);
registerXkcdRoutes(mainRouter);
registerWhatIfRoutes(mainRouter);
registerLocalizedRoutes(mainRouter);
registerAdminRoutes(mainRouter);
registerCrawlerRoutes(mainRouter);

// ============================================================================
// CORS AND ERROR HANDLING
// ============================================================================

/**
 * Handle CORS preflight requests for all routers
 */
const corsHandler = () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
};

apiRouter.options('*', corsHandler);
localizedRouter.options('*', corsHandler);
mainRouter.options('*', corsHandler);

/**
 * Serve static files for main router
 */
mainRouter.get('/overview.html', async () => {  
  return new Response(overviewHtml, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  });
});

// ============================================================================
// 404 HANDLER
// ============================================================================

/**
 * 404 handler for all routers
 */
const notFoundHandler = () => {
  return createErrorResponse('Not Found - The requested resource was not found', 404);
};

apiRouter.all('*', notFoundHandler);
localizedRouter.all('*', notFoundHandler);
mainRouter.all('*', notFoundHandler);

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Main fetch handler for Cloudflare Workers
 */
export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    try {
      // Initialize database
      const db = new Database(env.DB);
      
      // Parse request URL to determine routing
      const url = new URL(request.url);
      const hostname = url.hostname;
      
      // Route based on hostname
      if (hostname === 'api2.jienan.xyz' && url.pathname.startsWith('/xkcd')) {
        // api2.jienan.xyz/xkcd/* -> apiRouter (XKCD + What If)
        return apiRouter.handle(request, env, ctx, { db });
      } else if (hostname === 'xkcd2.jienan.xyz') {
        // xkcd2.jienan.xyz/* -> localizedRouter (Localized only)
        return localizedRouter.handle(request, env, ctx, { db });
      } else {
        // Default: xkcd.zjn0505.workers.dev -> mainRouter (all routes)
        return mainRouter.handle(request, env, ctx, { db });
      }
    } catch (error) {
      console.error('Error in fetch handler:', error);
      return createErrorResponse('Internal Server Error - An unexpected error occurred');
    }
  },

  /**
   * Cron trigger handler for scheduled crawler tasks
   */
  async scheduled(event: ScheduledEvent, env: any, ctx: ExecutionContext): Promise<void> {
    try {
      console.log('Cron trigger fired:', event.cron);
      
      // Initialize database
      const db = new Database(env.DB);
      
      // Run XKCD only on hourly trigger
      if (event.cron === '0 * * * *') {
        const xkcdCrawler = new XkcdCrawler(db);
        ctx.waitUntil(xkcdCrawler.crawl());
      }

      // Run What If only on daily trigger
      if (event.cron === '0 0 * * *') {
        const whatIfCrawler = new WhatIfCrawler(db);
        ctx.waitUntil(whatIfCrawler.crawl());
        // Also run zh-CN localized daily (slow moving)
        const zhcnCrawler = new LocalizedZhCnCrawler(db);
        ctx.waitUntil(zhcnCrawler.crawl());
      }
      
      console.log('Crawlers started via cron trigger');
    } catch (error) {
      console.error('Error in scheduled handler:', error);
    }
  }
};