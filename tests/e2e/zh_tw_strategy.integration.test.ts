/**
 * Test ZH-TW crawler strategy
 * npm run test:integration
 */

import { describe, test, expect } from 'vitest';
import { ZhTwCrawlerStrategy } from '../../src/strategies/zh_tw_strategy';

describe('ZhTwCrawlerStrategy - Integration Tests', () => {
    const strategy = new ZhTwCrawlerStrategy();

    const TIMEOUT = 10000;

    test('should fetch real comic #353 from xkcd.tw', async () => {
        const result = await strategy.fetchComic(353);
        
        expect(result).toBeDefined();
        expect(result).toHaveProperty('id', 353);
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('imageUrl');
        expect(result).toHaveProperty('altText');
        expect(result).toHaveProperty('originalUrl');

        expect(result?.title).toBe('Python');
        expect(result?.imageUrl).toContain('https://xkcd.tw/strip/353.jpg');
        expect(result?.altText).toContain('我昨晚寫了 20 支 Python 小程式，這玩意兒太棒了。再見了 Perl。');
        expect(result?.originalUrl).toBe('https://xkcd.tw/353');

        console.log('\n📊 Real fetch result for comic #353:');
        console.log(JSON.stringify(result, null, 2));
    }, TIMEOUT);

    test('should handle non-existent comic (99999)', async () => {
        const result = await strategy.fetchComic(99999);
        expect(result).toBeNull();
    });

    test('should get available comic ids', async () => {
        const ids = await strategy.fetchAvailableComicIds();
        expect(ids).toBeDefined();
        expect(ids).toContain(1815);
        expect(ids).toContain(1430);
        // ids length is >= 676
        expect(ids.length).toBeGreaterThanOrEqual(676);
        expect(ids).toContain(2978);
    }, TIMEOUT);
});

