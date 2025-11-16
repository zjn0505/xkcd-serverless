/**
 * Image dimension detection utilities using probe-image-size
 * This library efficiently reads only the image headers without downloading the full image
 */

import probe from 'probe-image-size';

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Get image dimensions from URL
 * Only downloads the image header (first few KB), not the entire image
 * 
 * @param imageUrl - URL of the image to probe
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 * @returns Promise with width and height, or null if failed
 */
export async function getImageDimensions(
  imageUrl: string,
  timeoutMs: number = 10000
): Promise<ImageDimensions | null> {
  try {
    // probe-image-size automatically handles:
    // - Range requests (only downloads headers)
    // - Multiple image formats (PNG, JPEG, GIF, WebP, etc.)
    // - Proper error handling
    const result = await probe(imageUrl, { timeout: timeoutMs });
    
    return {
      width: result.width,
      height: result.height
    };
  } catch (error) {
    // Log error but don't throw - dimensions are optional
    console.warn(`Failed to get dimensions for ${imageUrl}:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Get image dimensions with retry logic
 * Useful for handling temporary network issues
 * 
 * @param imageUrl - URL of the image to probe
 * @param maxRetries - Maximum number of retry attempts (default: 2)
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 * @returns Promise with width and height, or null if all attempts failed
 */
export async function getImageDimensionsWithRetry(
  imageUrl: string,
  maxRetries: number = 2,
  timeoutMs: number = 10000
): Promise<ImageDimensions | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await probe(imageUrl, { timeout: timeoutMs });
      
      return {
        width: result.width,
        height: result.height
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors
      if (lastError.message.includes('404') || lastError.message.includes('403')) {
        break;
      }
      
      // Wait a bit before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  console.warn(`Failed to get dimensions for ${imageUrl} after ${maxRetries + 1} attempts:`, lastError?.message);
  return null;
}

/**
 * Batch get image dimensions for multiple URLs
 * Processes images concurrently with a concurrency limit
 * 
 * @param imageUrls - Array of image URLs to probe
 * @param concurrency - Number of concurrent requests (default: 5)
 * @param timeoutMs - Request timeout in milliseconds (default: 10000)
 * @returns Promise with array of dimensions (null for failed items)
 */
export async function batchGetImageDimensions(
  imageUrls: string[],
  concurrency: number = 5,
  timeoutMs: number = 10000
): Promise<(ImageDimensions | null)[]> {
  const results: (ImageDimensions | null)[] = [];
  const queue = [...imageUrls];
  
  // Process in batches
  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await Promise.all(
      batch.map(url => getImageDimensions(url, timeoutMs))
    );
    results.push(...batchResults);
  }
  
  return results;
}

