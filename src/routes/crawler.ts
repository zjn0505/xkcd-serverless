import { Router, RouterType } from 'itty-router';
import { createJsonResponse, createErrorResponse } from '../http/response';
import { XkcdCrawler } from '../crawlers/xkcd';
import { WhatIfCrawler } from '../crawlers/whatif';
import { LocalizedZhCnCrawler } from '../crawlers/localized_zh_cn';

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

  router.get('/crawler/localized/zh-cn/status', async (request, env, ctx, { db }) => {
    try {
      const crawler = new LocalizedZhCnCrawler(db, env.CRAWLER_STATE);
      const status = await crawler.getStatus();
      return createJsonResponse(status);
    } catch (error) {
      console.error('Error in /crawler/localized/zh-cn/status:', error);
      return createErrorResponse('Failed to get localized crawler status');
    }
  });

  router.post('/crawler/localized/zh-cn/start', async (request, env, ctx, { db }) => {
    try {
      // Use traditional crawler with KV state management for incremental processing
      const crawler = new LocalizedZhCnCrawler(db, env.CRAWLER_STATE);
      ctx.waitUntil(crawler.crawl());
      return createJsonResponse({ 
        message: 'Localized zh-CN crawler started (incremental mode with KV state)', 
        timestamp: new Date().toISOString() 
      });
    } catch (error) {
      console.error('Error in /crawler/localized/zh-cn/start:', error);
      return createErrorResponse('Failed to start localized crawler');
    }
  });

  router.get('/crawler/localized/zh-cn/logs', async (request, env, ctx, { db }) => {
    try {
      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const crawler = new LocalizedZhCnCrawler(db, env.CRAWLER_STATE);
      const logs = await crawler.getLogs(limit);
      return createJsonResponse({ logs, count: logs.length, limit });
    } catch (error) {
      console.error('Error in /crawler/localized/zh-cn/logs:', error);
      return createErrorResponse('Failed to get localized crawler logs');
    }
  });
}


