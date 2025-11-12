import { Router } from 'itty-router';
import { Database } from './database';
import { createErrorResponse } from './http/response';
import { XkcdCrawler } from './crawlers/xkcd';
import { WhatIfCrawler } from './crawlers/whatif';
import { registerHealthRoutes } from './routes/health';
import { registerXkcdRoutes } from './routes/xkcd';
import { registerWhatIfRoutes } from './routes/whatif';
import { registerLocalizedRoutes } from './routes/localized';
import { registerAdminRoutes } from './routes/admin';
import { registerCrawlerRoutes } from './routes/crawler';
import { registerViewerRoutes } from './routes/viewer';

// Export Workflows
export { ZhCnCrawlerWorkflow } from './workflows/zh_cn_crawler';
export { FrCrawlerWorkflow } from './workflows/fr_crawler';
export { ZhTwCrawlerWorkflow } from './workflows/zh_tw_crawler';
export { RuCrawlerWorkflow } from './workflows/ru_crawler';
export { DeCrawlerWorkflow } from './workflows/de_crawler';
export { EsCrawlerWorkflow } from './workflows/es_crawler';

// Create API router for API domains
const apiRouter = Router({ base: '/xkcd' });
registerHealthRoutes(apiRouter);
registerXkcdRoutes(apiRouter);
registerWhatIfRoutes(apiRouter);

// Create localized router for localized domains
const localizedRouter = Router();
registerHealthRoutes(localizedRouter);
registerLocalizedRoutes(localizedRouter);

// Create main router (default for workers.dev)
const mainRouter = Router();
registerHealthRoutes(mainRouter);
registerXkcdRoutes(mainRouter);
registerWhatIfRoutes(mainRouter);
registerLocalizedRoutes(mainRouter);
registerAdminRoutes(mainRouter);
registerCrawlerRoutes(mainRouter);
registerViewerRoutes(mainRouter);

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
      const apiHostname = env.API_HOSTNAME;
      const localizedHostname = env.LOCALIZED_HOSTNAME;
      
      if (hostname === apiHostname && url.pathname.startsWith('/xkcd')) {
        // api_hostname/xkcd/* -> apiRouter (XKCD + What If)
        return apiRouter.handle(request, env, ctx, { db });
      } else if (hostname === localizedHostname) {
        // localized_hostname/* -> localizedRouter (Localized only)
        return localizedRouter.handle(request, env, ctx, { db });
      } else {
        // Default: workers.dev -> mainRouter (all routes)
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
      // console.log('Cron trigger fired:', event.cron);
      
      // Initialize database
      const db = new Database(env.DB);
      
      // Minute dispatcher: xkcd every minute; zh-CN every 15 minutes
      if (event.cron === '*/1 * * * *') {
        // xkcd main site every minute
        const xkcdCrawler = new XkcdCrawler(db);
        ctx.waitUntil(xkcdCrawler.crawl());

        // zh-CN every 15 minutes
        const minute = new Date().getUTCMinutes();
        if (minute % 15 === 0 && env.ZH_CN_CRAWLER) {
          const instance = await env.ZH_CN_CRAWLER.create();
          console.log('zh-CN Workflow started:', instance.id);
        }
      }

      // Daily dispatcher: What If + localized dailies (fr, zh-tw)
      if (event.cron === '15 0 * * *') {
        // What If daily
        const whatIfCrawler = new WhatIfCrawler(db);
        ctx.waitUntil(whatIfCrawler.crawl());

        // fr daily
        if (env.FR_CRAWLER) {
          const frInstance = await env.FR_CRAWLER.create();
          console.log('fr Workflow started:', frInstance.id);
        }

        // zh-TW daily
        if (env.ZH_TW_CRAWLER) {
          const twInstance = await env.ZH_TW_CRAWLER.create();
          console.log('zh-TW Workflow started:', twInstance.id);
        }

        // ru daily
        if (env.RU_CRAWLER) {
          const ruInstance = await env.RU_CRAWLER.create();
          console.log('ru Workflow started:', ruInstance.id);
        }

        // de daily
        if (env.DE_CRAWLER) {
          const deInstance = await env.DE_CRAWLER.create();
          console.log('de Workflow started:', deInstance.id);
        }

        // es daily
        if (env.ES_CRAWLER) {
          const esInstance = await env.ES_CRAWLER.create();
          console.log('es Workflow started:', esInstance.id);
        }
      }
      
      // console.log('Crawlers started via cron trigger');
    } catch (error) {
      console.error('Error in scheduled handler:', error);
    }
  }
};