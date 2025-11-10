/**
 * Test ZH-CN crawler strategy
 * npm run test:integration
 * npx vitest run tests/e2e/zh_cn_strategy.integration.test.ts
 */

import { describe, test, expect } from 'vitest';
import { ZhCnCrawlerStrategy } from '../../src/strategies/zh_cn_strategy';

describe('ZhCnCrawlerStrategy - Integration Tests', () => {
    const strategy = new ZhCnCrawlerStrategy();

    const TIMEOUT = 10000;

    test('should fetch real comic #852 from xkcd.lapin.org', async () => {
        const result = await strategy.fetchComic(3142);

        expect(result).toBeDefined();
        expect(result).toHaveProperty('id', 3142);
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('imageUrl');
        expect(result).toHaveProperty('altText');
        expect(result).toHaveProperty('originalUrl');

        expect(result?.title).toBe('（城市）风味披萨');
        expect(result?.imageUrl).toContain('https://xkcd.in/resources/compiled_cn/043093fd6af3d5d365a3c8a1e7a39c81.png');
        expect(result?.altText).toContain('如果你想看看真正的开创性食物，搜搜Altoona-style pizza。');
        expect(result?.originalUrl).toBe('https://xkcd.in/comic?lg=cn&id=3142');

        console.log('\n📊 Real fetch result for comic #3142:');
        console.log(JSON.stringify(result, null, 2));
    }, TIMEOUT);

    test('should handle non-existent comic (99999)', async () => {
        const result = await strategy.fetchComic(99999);
        expect(result).toBeNull();
    });

    test('should fetch multiple real comics', async () => {
        const comicIds = [13, 1111, 3097];
        const results = await Promise.all(
            comicIds.map(id => strategy.fetchComic(id))
        );

        results.forEach((result, index) => {
            console.log(result);
            expect(result).toBeDefined();
            expect(result?.id).toBe(comicIds[index]);
            expect(result?.imageUrl).toContain('compiled_cn/');
        });

        console.log(`\n✅ Successfully fetched ${results.length} real comics`);
    }, TIMEOUT * 3);

    test('should get available comic ids', async () => {
        const ids = await strategy.fetchAvailableComicIds();
        expect(ids).toBeDefined();
        // ids length is >= 1526
        expect(ids.length).toBeGreaterThanOrEqual(1526);
        expect(ids).toContain(3146);
    }, TIMEOUT * 3);
});

