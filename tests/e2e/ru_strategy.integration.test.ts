/**
 * Test RU crawler strategy
 * npm run test:integration
 */

import { describe, test, expect } from 'vitest';
import { RuCrawlerStrategy } from '../../src/strategies/ru_strategy';

describe('RuCrawlerStrategy - Integration Tests', () => {
    const strategy = new RuCrawlerStrategy();

    const TIMEOUT = 10000;

    test('should fetch real comic #1473 from xkcd.ru', async () => {
        const result = await strategy.fetchComic(1473);
        
        expect(result).toBeDefined();
        expect(result).toHaveProperty('id', 1473);
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('imageUrl');
        expect(result).toHaveProperty('altText');
        expect(result).toHaveProperty('originalUrl');

        expect(result?.title).toBe('Сведения о местоположении');
        expect(result?.imageUrl).toContain('https://xkcd.ru/i/1473_v1.png');
        expect(result?.altText).toContain('В телефонах должны быть замечательные датчики углового момента, поскольку компасы там совершенно никудышные.');
        expect(result?.originalUrl).toBe('https://xkcd.ru/1473');

        console.log('\n📊 Real fetch result for comic #1473:');
        console.log(JSON.stringify(result, null, 2));
    }, TIMEOUT);

    test('should handle non-existent comic (99999)', async () => {
        const result = await strategy.fetchComic(99999);
        expect(result).toBeNull();
    });

    test('should get available comic ids', async () => {
        const ids = await strategy.fetchAvailableComicIds();
        expect(ids).toBeDefined();
        expect(ids).toContain(405);
        expect(ids).toContain(1646);
        // ids length is >= 710
        expect(ids.length).toBeGreaterThanOrEqual(710);
        expect(ids).toContain(1851);
    }, TIMEOUT);
});

