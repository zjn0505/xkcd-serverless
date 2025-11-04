/**
 * Test FR crawler strategy
 * npm run test:integration
 */

import { describe, test, expect } from 'vitest';
import { FrCrawlerStrategy } from '../../src/strategies/fr_strategy';

describe('FrCrawlerStrategy - Integration Tests', () => {
    const strategy = new FrCrawlerStrategy();

    const TIMEOUT = 10000;

    test('should fetch real comic #852 from xkcd.lapin.org', async () => {
        const result = await strategy.fetchComic(852);

        expect(result).toBeDefined();
        expect(result).toHaveProperty('id', 852);
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('imageUrl');
        expect(result).toHaveProperty('altText');
        expect(result).toHaveProperty('originalUrl');

        expect(result?.title).toBe('G locale');
        expect(result?.imageUrl).toContain('strips/852G-locale.png');
        expect(result?.altText).toContain('Rio de Janeiro');
        expect(result?.originalUrl).toBe('https://xkcd.lapin.org/index.php?number=852');

        console.log('\n📊 Real fetch result for comic #852:');
        console.log(JSON.stringify(result, null, 2));
    }, TIMEOUT);

    test('should handle non-existent comic (99999)', async () => {
        await expect(strategy.fetchComic(99999)).rejects.toThrow();
    }, TIMEOUT);

    test('should fetch multiple real comics', async () => {
        const comicIds = [1, 100, 853];
        const results = await Promise.all(
            comicIds.map(id => strategy.fetchComic(id))
        );

        results.forEach((result, index) => {
            console.log(result);
            expect(result).toBeDefined();
            expect(result?.id).toBe(comicIds[index]);
            expect(result?.imageUrl).toContain('strips/');
        });

        console.log(`\n✅ Successfully fetched ${results.length} real comics`);
    }, TIMEOUT * 3);

    test('should handle French special characters correctly', async () => {
        const result = await strategy.fetchComic(852);
        
        expect(result?.altText).toContain('À');
        expect(result?.altText).toContain('è');
        
        expect(result?.altText).toContain('>1cm');
    }, TIMEOUT);

    test('should get available comic ids', async () => {
        const ids = await strategy.fetchAvailableComicIds();
        expect(ids).toBeDefined();
        expect(ids).toContain(852);
        // ids length is >= 981
        expect(ids.length).toBeGreaterThanOrEqual(981);
        expect(ids).toContain(981);
    }, TIMEOUT);
});

