/**
 * Cache utilities for Cloudflare Workers
 */

interface CacheOptions {
  /**
   * Cache TTL in seconds (default: 3600 = 1 hour)
   */
  ttl?: number;
  
  /**
   * Browser cache TTL in seconds (default: 300 = 5 minutes)
   */
  browserTtl?: number;
  
  /**
   * Cache 404 responses TTL in seconds (default: 300 = 5 minutes)
   */
  notFoundTtl?: number;
  
  /**
   * Cache key prefix
   */
  keyPrefix?: string;
}

/**
 * Wrap a handler with Cache API caching
 * 
 * Example:
 *   const handler = withCache(async (request) => {
 *     const data = await db.query(...);
 *     return createJsonResponse(data);
 *   }, { ttl: 3600 });
 */
export function withCache<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  options: CacheOptions = {}
): T {
  const {
    ttl = 3600,           // 1 hour edge cache
    browserTtl = 300,     // 5 minutes browser cache
    notFoundTtl = 300,    // 5 minutes for 404
    keyPrefix = 'api'
  } = options;

  return (async (...args: any[]) => {
    const [request] = args;
    
    // Only cache GET requests
    if (request.method !== 'GET') {
      return handler(...args);
    }

    // Create cache key from URL
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    // Try to get from cache
    let response = await cache.match(cacheKey);
    
    if (response) {
      // Cache hit - add header to indicate
      response = new Response(response.body, response);
      response.headers.set('X-Cache', 'HIT');
      return response;
    }

    // Cache miss - execute handler
    response = await handler(...args);
    
    // Cache successful responses (200)
    if (response.status === 200) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('Cache-Control', `public, max-age=${browserTtl}, s-maxage=${ttl}`);
      headers.set('CDN-Cache-Control', `max-age=${ttl}`);
      headers.set('X-Cache', 'MISS');
      
      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      
      args[2]?.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
      return cachedResponse;
    }
    
    // Cache 404 responses (not found) for shorter time
    if (response.status === 404) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('Cache-Control', `public, max-age=${notFoundTtl}`);
      headers.set('CDN-Cache-Control', `max-age=${notFoundTtl}`);
      headers.set('X-Cache', 'MISS');
      headers.set('X-Cache-Status', 'NOT_FOUND');
      
      const cachedResponse = new Response(responseToCache.body, {
        status: 404,
        statusText: responseToCache.statusText,
        headers
      });
      
      args[2]?.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
      return cachedResponse;
    }

    // Don't cache other errors (5xx, etc)
    return response;
  }) as T;
}

/**
 * Manually purge cache for a specific URL pattern
 */
export async function purgeCache(urlPattern: string | RegExp): Promise<void> {
  const cache = caches.default;
  // Note: Cache API doesn't support pattern-based deletion
  // This is a placeholder for future implementation with KV-based tracking
  console.log(`Cache purge requested for: ${urlPattern}`);
}

/**
 * Wrap a handler with dynamic Cache API caching based on request parameters or response
 * 
 * Example:
 *   const handler = withDynamicCache(async (request) => {
 *     return createJsonResponse(data);
 *   }, (request) => {
 *     // Cache options based on request
 *     return { ttl: 3600, browserTtl: 300 };
 *   }, (request, response) => {
 *     // Optional: Cache options based on response (overrides request-based options)
 *     const hasMore = response.headers.get('X-Pagination-HasMore') === '1';
 *     return !hasMore ? { ttl: 300, browserTtl: 60 } : { ttl: 86400, browserTtl: 3600 };
 *   });
 */
export function withDynamicCache<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  getCacheOptions: (request: Request) => { ttl: number; browserTtl?: number; notFoundTtl?: number },
  getCacheOptionsFromResponse?: (request: Request, response: Response) => Promise<{ ttl: number; browserTtl?: number; notFoundTtl?: number } | null> | { ttl: number; browserTtl?: number; notFoundTtl?: number } | null
): T {
  return (async (...args: any[]) => {
    const [request] = args;
    
    // Only cache GET requests
    if (request.method !== 'GET') {
      return handler(...args);
    }

    // Create cache key from URL
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    // Try to get from cache
    let response = await cache.match(cacheKey);
    
    if (response) {
      // Cache hit - add header to indicate
      response = new Response(response.body, response);
      response.headers.set('X-Cache', 'HIT');
      return response;
    }

    // Cache miss - execute handler
    response = await handler(...args);
    
    // Get cache options - prefer response-based options if available
    let cacheOptions = getCacheOptions(request);
    if (getCacheOptionsFromResponse) {
      const responseBasedOptions = await Promise.resolve(getCacheOptionsFromResponse(request, response));
      if (responseBasedOptions) {
        cacheOptions = responseBasedOptions;
      }
    }
    
    const {
      ttl,
      browserTtl = Math.min(300, ttl / 10),  // Default browser cache is 10% of edge cache, max 5 minutes
      notFoundTtl = 300
    } = cacheOptions;
    
    // Cache successful responses (200)
    if (response.status === 200) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('Cache-Control', `public, max-age=${browserTtl}, s-maxage=${ttl}`);
      headers.set('CDN-Cache-Control', `max-age=${ttl}`);
      headers.set('X-Cache', 'MISS');
      
      const cachedResponse = new Response(responseToCache.body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      
      args[2]?.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
      return cachedResponse;
    }
    
    // Cache 404 responses (not found) for shorter time
    if (response.status === 404) {
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('Cache-Control', `public, max-age=${notFoundTtl}`);
      headers.set('CDN-Cache-Control', `max-age=${notFoundTtl}`);
      headers.set('X-Cache', 'MISS');
      headers.set('X-Cache-Status', 'NOT_FOUND');
      
      const cachedResponse = new Response(responseToCache.body, {
        status: 404,
        statusText: responseToCache.statusText,
        headers
      });
      
      args[2]?.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
      return cachedResponse;
    }

    // Don't cache other errors (5xx, etc)
    return response;
  }) as T;
}

/**
 * Create cache-friendly response with appropriate headers
 */
export function createCachedResponse(
  data: any,
  options: {
    ttl?: number;
    browserTtl?: number;
    status?: number;
  } = {}
): Response {
  const {
    ttl = 3600,
    browserTtl = 300,
    status = 200
  } = options;

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${browserTtl}, s-maxage=${ttl}`,
      'CDN-Cache-Control': `max-age=${ttl}`,
    }
  });
}

