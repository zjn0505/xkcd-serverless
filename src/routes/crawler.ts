import { Router, RouterType } from 'itty-router';
import { createJsonResponse, createErrorResponse } from '../http/response';
import { XkcdCrawler } from '../crawlers/xkcd';
import { WhatIfCrawler } from '../crawlers/whatif';

export function registerCrawlerRoutes(router: RouterType) {
  router.get('/crawler/xkcd/status', async (request, env, ctx, { db }) => {
    try {
      const crawler = new XkcdCrawler(db);
      const status = await crawler.getStatus();
      return createJsonResponse(status);
    } catch (error) {
      console.error('Error in /crawler/xkcd/status:', error);
      return createErrorResponse('Failed to get crawler status');
    }
  });

  router.post('/crawler/xkcd/start', async (request, env, ctx, { db }) => {
    try {
      const crawler = new XkcdCrawler(db);
      ctx.waitUntil(crawler.crawl());
      return createJsonResponse({ message: 'XKCD crawler started', timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Error in /crawler/xkcd/start:', error);
      return createErrorResponse('Failed to start crawler');
    }
  });

  router.get('/crawler/xkcd/logs', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const crawler = new XkcdCrawler(db);
      const logs = await crawler.getLogs(limit);
      return createJsonResponse({ logs, count: logs.length, limit });
    } catch (error) {
      console.error('Error in /crawler/xkcd/logs:', error);
      return createErrorResponse('Failed to get crawler logs');
    }
  });

  router.get('/crawler/whatif/status', async (request, env, ctx, { db }) => {
    try {
      const crawler = new WhatIfCrawler(db);
      const status = await crawler.getStatus();
      return createJsonResponse(status);
    } catch (error) {
      console.error('Error in /crawler/whatif/status:', error);
      return createErrorResponse('Failed to get What If crawler status');
    }
  });

  router.post('/crawler/whatif/start', async (request, env, ctx, { db }) => {
    try {
      const crawler = new WhatIfCrawler(db);
      ctx.waitUntil(crawler.crawl());
      return createJsonResponse({ message: 'What If crawler started', timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Error in /crawler/whatif/start:', error);
      return createErrorResponse('Failed to start What If crawler');
    }
  });

  router.get('/crawler/whatif/logs', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const crawler = new WhatIfCrawler(db);
      const logs = await crawler.getLogs(limit);
      return createJsonResponse({ logs, count: logs.length, limit });
    } catch (error) {
      console.error('Error in /crawler/whatif/logs:', error);
      return createErrorResponse('Failed to get What If crawler logs');
    }
  });

  // Generic localized crawler starter
  const localizedCrawlers = {
    'zh-cn': {
      binding: 'ZH_CN_CRAWLER',
      name: 'zh-CN'
    },
    'fr': {
      binding: 'FR_CRAWLER', 
      name: 'fr'
    },
    'zh-tw': {
      binding: 'ZH_TW_CRAWLER',
      name: 'zh-TW'
    },
    'ru': {
      binding: 'RU_CRAWLER',
      name: 'ru'
    }
  };

  // POST /crawler/localized/:language/start
  router.post('/crawler/localized/:language/start', async (request, env, ctx, { db }) => {
    try {
      const language = request.params?.language;
      
      if (!language || !localizedCrawlers[language as keyof typeof localizedCrawlers]) {
        return createErrorResponse(`Invalid language. Supported: ${Object.keys(localizedCrawlers).join(', ')}`, 400);
      }

      const crawlerConfig = localizedCrawlers[language as keyof typeof localizedCrawlers];
      const workflowBinding = env[crawlerConfig.binding as keyof typeof env];
      
      if (workflowBinding) {
        const instance = await workflowBinding.create();
        return createJsonResponse({
          message: `Localized ${crawlerConfig.name} crawler workflow started`,
          workflowId: instance.id,
          language,
          timestamp: new Date().toISOString()
        });
      } else {
        return createErrorResponse(`${crawlerConfig.binding} Workflow binding not found`);
      }
    } catch (error) {
      console.error(`Error in /crawler/localized/${request.params?.language}/start:`, error);
      return createErrorResponse(`Failed to start ${request.params?.language} localized crawler`);
    }
  });

}


