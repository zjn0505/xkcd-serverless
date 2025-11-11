/**
 * Test DE crawler strategy
 * npm run test:integration
 * npx vitest run tests/e2e/de_strategy.integration.test.ts
 */

import { describe, test, expect } from 'vitest';
import { DeCrawlerStrategy } from '../../src/strategies/de_strategy';
import { ComicData } from '../../src/strategies/base_strategy';

describe('DeCrawlerStrategy - Integration Tests', () => {
    const strategy = new DeCrawlerStrategy();

    const TIMEOUT = 10000;

    test('should fetch real comic #1159 from xkcde.dapete.net', async () => {
        const result = await strategy.fetchComic(1159);

        expect(result).toBeDefined();
        expect(result).toHaveProperty('id', 1159);
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('imageUrl');
        expect(result).toHaveProperty('altText');
        expect(result).toHaveProperty('originalUrl');

        expect(result?.title).toBe('Countdown');
        expect(result?.imageUrl).toContain('https://xkcde.dapete.net/comics/countdown.png');
        expect(result?.altText).toContain('Soviel wir wissen stehen die Chancen zu unseren Gunsten.');
        expect(result?.originalUrl).toBe('https://xkcde.dapete.net/1159/');

        console.log('\n📊 Real fetch result for comic #1159:');
        console.log(JSON.stringify(result, null, 2));
    }, TIMEOUT);

    test('should fetch multiple real comics', async () => {
        const comicIds = [45, 1000, 1145];
        const results = await Promise.all(
            comicIds.map(id => strategy.fetchComic(id))
        );

        results.forEach((result, index) => {
            console.log(result);
            expect(result).toBeDefined();
            expect(result?.id).toBe(comicIds[index]);
            expect(result?.imageUrl).toContain('https://xkcde.dapete.net/comics');
        });

        console.log(`\n✅ Successfully fetched ${results.length} real comics`);
    }, TIMEOUT * 3);

    test('should handle non-existent comic (99999)', async () => {
        const result = await strategy.fetchComic(99999);
        expect(result).toBeNull();
    });

    test('should get available comic ids', async () => {
        const ids = await strategy.fetchAvailableComicIds();
        expect(ids).toBeDefined();
        // ids length is >= 1162
        expect(ids.length).toBeGreaterThanOrEqual(1162);
        expect(ids).toContain(1162);
    }, TIMEOUT);

    test('should pass DE special skip logic', async () => {
        const result = await strategy.fetchComicOrClosest(99999);
        expect(result).toBeDefined();
        expect(result.id).toBeGreaterThanOrEqual(1);
        expect(result.id).toBeLessThanOrEqual(5000);
        console.log(`\n✅ Successfully passed DE special skip logic: ${result}`);
    }, TIMEOUT);

    // Get RSS comic ids
    test('should get RSS comic ids', async () => {
        const ids = await strategy.fetchAvailableComicIdsFromRSS();
        expect(ids).toBeDefined();
        expect(ids.length).toBe(20);
        // expect exists id is greater than 943
        expect(ids.some(id => id >= 943)).toBe(true);
        console.log(`\n✅ Successfully fetched RSS comic ids: ${ids}`);
    }, TIMEOUT);

    // Get all comics from 1 to the latest id
    test('should get all comics from 1 to the latest id', async () => {
        const ids = await strategy.fetchAvailableComicIds();
        // accumulated results
        const results: ComicData[] = [];
        let skipToId = 0;
        for (let id of ids) {
            if (skipToId > 0 && id < skipToId) {
                continue;
            }
            const result = await strategy.fetchComicOrClosest(id);
            if (result && typeof result !== 'number' && result?.id && result?.title && result?.imageUrl && result?.altText && result?.originalUrl && result?.id === id) {
                results.push(result as ComicData)
                console.log(`✅ Fetched comic #${id}: ${result?.title}`);
            } else if (typeof result === 'number' && result > id) {
                // skip for loop to hoop to result
                skipToId = result;
            } else {
                console.log(`❌ Failed to fetch comic #${id}`, result);
            }
        }
        // print results in pretty format
        // should be greater than 193
        console.log(`\n✅ Successfully fetched ${results.length} real comics`);
        // console.log(JSON.stringify(results, null, 2));
    }, TIMEOUT * 100);
});

