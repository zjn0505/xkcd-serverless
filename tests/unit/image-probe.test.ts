import { describe, it, expect } from 'vitest';
import { getImageDimensions, getImageDimensionsWithRetry, batchGetImageDimensions } from '../../src/utils/image-probe';

describe('Image Probe Utils', () => {
  describe('getImageDimensions', () => {
    it('should get dimensions for a valid xkcd image', async () => {
      // Use a known xkcd image
      const imageUrl = 'https://imgs.xkcd.com/comics/python.png';
      
      const dimensions = await getImageDimensions(imageUrl);
      
      expect(dimensions).not.toBeNull();
      expect(dimensions?.width).toBeGreaterThan(0);
      expect(dimensions?.height).toBeGreaterThan(0);
      
      console.log('Got dimensions:', dimensions);
    }, 15000); // Increase timeout for network request

    it('should return null for invalid URL', async () => {
      const imageUrl = 'https://imgs.xkcd.com/comics/nonexistent_image_12345.png';
      
      const dimensions = await getImageDimensions(imageUrl, 5000);
      
      expect(dimensions).toBeNull();
    }, 10000);

    it('should return null for non-image URL', async () => {
      const imageUrl = 'https://xkcd.com/info.0.json';
      
      const dimensions = await getImageDimensions(imageUrl, 5000);
      
      expect(dimensions).toBeNull();
    }, 10000);
  });

  describe('getImageDimensionsWithRetry', () => {
    it('should get dimensions with retry for a valid image', async () => {
      const imageUrl = 'https://imgs.xkcd.com/comics/python.png';
      
      const dimensions = await getImageDimensionsWithRetry(imageUrl, 2, 10000);
      
      expect(dimensions).not.toBeNull();
      expect(dimensions?.width).toBeGreaterThan(0);
      expect(dimensions?.height).toBeGreaterThan(0);
    }, 20000);

    it('should return null after all retries fail', async () => {
      const imageUrl = 'https://imgs.xkcd.com/comics/nonexistent.png';
      
      const dimensions = await getImageDimensionsWithRetry(imageUrl, 1, 3000);
      
      expect(dimensions).toBeNull();
    }, 15000);
  });

  describe('batchGetImageDimensions', () => {
    it('should get dimensions for multiple images', async () => {
      const imageUrls = [
        'https://imgs.xkcd.com/comics/python.png',
        'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg',
        'https://imgs.xkcd.com/comics/kerning.png'
      ];
      
      const results = await batchGetImageDimensions(imageUrls, 3, 10000);
      
      expect(results).toHaveLength(3);
      
      // At least the first one should succeed
      const successfulResults = results.filter(r => r !== null);
      expect(successfulResults.length).toBeGreaterThan(0);
      
      successfulResults.forEach(dimensions => {
        expect(dimensions?.width).toBeGreaterThan(0);
        expect(dimensions?.height).toBeGreaterThan(0);
      });
      
      console.log('Batch results:', results);
    }, 30000);

    it('should handle mixed valid and invalid URLs', async () => {
      const imageUrls = [
        'https://imgs.xkcd.com/comics/python.png',
        'https://imgs.xkcd.com/comics/nonexistent.png',
        'https://imgs.xkcd.com/comics/kerning.png'
      ];
      
      const results = await batchGetImageDimensions(imageUrls, 2, 5000);
      
      expect(results).toHaveLength(3);
      
      // Should have some successes and some failures
      const successCount = results.filter(r => r !== null).length;
      const failureCount = results.filter(r => r === null).length;
      
      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
      
      console.log(`Success: ${successCount}, Failures: ${failureCount}`);
    }, 30000);
  });

  describe('Various image formats', () => {
    it('should handle PNG images', async () => {
      const imageUrl = 'https://imgs.xkcd.com/comics/python.png';
      const dimensions = await getImageDimensions(imageUrl);
      
      expect(dimensions).not.toBeNull();
      console.log('PNG dimensions:', dimensions);
    }, 15000);

    it('should handle JPEG images', async () => {
      const imageUrl = 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg';
      const dimensions = await getImageDimensions(imageUrl);
      
      expect(dimensions).not.toBeNull();
      console.log('JPEG dimensions:', dimensions);
    }, 15000);
  });
});

