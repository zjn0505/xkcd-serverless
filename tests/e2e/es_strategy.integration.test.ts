/**
 * Test ES crawler strategy
 * npm run test:integration
 * npx vitest run tests/e2e/es_strategy.integration.test.ts
 */

import { describe, test, expect } from 'vitest';
import { EsCrawlerStrategy } from '../../src/strategies/es_strategy';
import { ComicData } from '../../src/strategies/base_strategy';

describe('EsCrawlerStrategy - Integration Tests', () => {
    const strategy = new EsCrawlerStrategy();

    const TIMEOUT = 10000;

    test('should fetch archive from es.xkcd.com', async () => {
        const archive = await strategy.fetchArchive();

        expect(archive).toBeDefined();
        expect(Array.isArray(archive)).toBe(true);
        expect(archive.length).toBeGreaterThan(0);

        // Check first item structure
        if (archive.length > 0) {
            const firstItem = archive[0];
            expect(firstItem).toHaveProperty('url');
            expect(firstItem).toHaveProperty('title');
            expect(firstItem.url).toContain('es.xkcd.com');
            expect(typeof firstItem.title).toBe('string');
        }

        console.log(`\n📊 Archive contains ${archive.length} comics`);
        console.log('First 3 items:', archive.slice(0, 3));
    }, TIMEOUT);

    test('should fetch comic from URL', async () => {
        // First get archive to get a real URL
        const archive = await strategy.fetchArchive();
        expect(archive.length).toBeGreaterThan(0);

        const testItem = archive[0];
        console.log(`\n🔍 Testing with URL: ${testItem.url}`);

        const result = await strategy.fetchComicFromUrl(testItem.url);

        expect(result).toBeDefined();
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('imageUrl');
        expect(result).toHaveProperty('altText');
        expect(result).toHaveProperty('originalUrl');

        expect(typeof result?.id).toBe('number');
        expect(result?.id).toBeGreaterThan(1000);
        expect(result?.imageUrl).toContain('http');
        expect(result?.originalUrl).toBe(testItem.url);
        expect(result?.altText).toBe("Una ganancia de eficiencia del 5% a costa de una pérdida de eficiencia del 99%");
        expect(result?.title).toBe('Rebufo');

        console.log('\n📊 Real fetch result:');
        console.log(JSON.stringify(result, null, 2));
    }, TIMEOUT);

    test('should fetch comic from URL with illegal HTML', async () => {
        const result = await strategy.fetchComicFromUrl("https://es.xkcd.com/strips/mil-trescientos/");

        expect(result).toBeDefined();
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('imageUrl');
        expect(result).toHaveProperty('altText');
        expect(result).toHaveProperty('originalUrl');

        expect(typeof result?.id).toBe('number');
        expect(result?.id).toBeGreaterThanOrEqual(1053);
        expect(result?.imageUrl).toContain('http');
        expect(result?.originalUrl).toBe("https://es.xkcd.com/strips/mil-trescientos/");
        expect(result?.altText).toBe('Decir "¿Qué imbécil no conoce el supervolcán de Yellowstone?" es muchísimo más aburrido que contarle a alguien qué es el supervolcán de Yellowstone.');
        expect(result?.title).toBe('Mil trescientos');

        console.log('\n📊 Real fetch result:');
        console.log(JSON.stringify(result, null, 2));
    }, TIMEOUT);

    test('should fetch comic from URL with illegal HTML 2', async () => {
        const result = await strategy.fetchComicFromUrl("https://es.xkcd.com/strips/la-sabiduria-de-los-antiguos/");

        expect(result).toBeDefined();
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('imageUrl');
        expect(result).toHaveProperty('altText');
        expect(result).toHaveProperty('originalUrl');

        expect(typeof result?.id).toBe('number');
        expect(result?.id).toBeGreaterThanOrEqual(979);
        expect(result?.imageUrl).toContain('http');
        expect(result?.originalUrl).toBe("https://es.xkcd.com/strips/la-sabiduria-de-los-antiguos/");
        expect(result?.altText).toBe('Todos los hilos de ayuda largos deberían tener arriba un post "sticky", editable globalmente, que diga: «QUERIDOS HABITANTES DEL FUTURO: Esto es lo que hemos descubierto hasta ahora...»');
        expect(result?.title).toBe('La sabiduría de los antiguos');

        console.log('\n📊 Real fetch result:');
        console.log(JSON.stringify(result, null, 2));
    }, TIMEOUT);

    test('should fetch multiple comics from URLs', async () => {
        const archive = await strategy.fetchArchive();
        const testItems = archive.slice(1, 4);

        const results = await Promise.all(
            testItems.map(item => strategy.fetchComicFromUrl(item.url))
    );

        results.forEach((result, index) => {
            expect(result).toBeDefined();
            expect(result?.id).toBeGreaterThan(1000);
            expect(result?.imageUrl).toContain('http');
            console.log(`✅ Comic ${index + 1}: ID ${result?.id} - ${result?.title}`);
        });

        console.log(`\n✅ Successfully fetched ${results.length} real comics`);
    }, TIMEOUT * 3);

    test('should handle invalid URL gracefully', async () => {
        const result = await strategy.fetchComicFromUrl('https://es.xkcd.com/invalid-url/');
        // Should return null or handle error
        expect(result === null || result === undefined).toBe(true);
    });

    test('should extract ID from comic URL', async () => {
        const archive = await strategy.fetchArchive();
        const testItem = archive[9];

        const id = await strategy.extractIdFromUrl(testItem.url);

        expect(id).toBeDefined();
        expect(typeof id).toBe('number');
        expect(id).toBeGreaterThan(1000);

        console.log(`\n✅ Extracted ID ${id} from ${testItem.url}`);
    }, TIMEOUT);

    test('fetchComic and fetchAvailableComicIds should throw errors', async () => {
        // These methods are not supported for ES
        await expect(strategy.fetchComic(1)).rejects.toThrow();
        await expect(strategy.fetchAvailableComicIds()).rejects.toThrow();
    });

    test('should get all comics from 1 to the latest id', async () => {
        const archive = await strategy.fetchArchive();
        const urls = archive.map(item => item.url);
        // accumulated results
        const results: ComicData[] = [];
        const failedUrls: string[] = [];
        for (let url of urls) {
            const result = await strategy.fetchComicFromUrl(url);
            if (result && result?.id && result?.title && result?.imageUrl && result?.originalUrl) {
                // Check if result.id is already in results
                if (results.some(r => r.id === result.id)) {
                    console.log(`❌ Skipping comic #${result.id}: already exists`);
                    failedUrls.push(url);
                    continue;
                }
                results.push(result as ComicData)
                console.log(`✅ Fetched comic #${result?.id}: ${result?.title}, ${result?.altText}, ${result?.imageUrl}`);
            } else if (result === null) {
                console.log(`❌ Failed to fetch comic #${url}`);
                failedUrls.push(url);
            } else {
                console.log(`❌ Failed to fetch comic #${url}: ${JSON.stringify(result, null, 2)}`);
                failedUrls.push(url);
            }
        }
        console.log(`\n✅ Successfully fetched ${results.length} real comics`);
        console.log(`\n❌ Failed to fetch ${failedUrls.length} comics: ${failedUrls.join(', ')}`);

        expect(failedUrls.length).toBe(0);
        expect(results.length).toBe(urls.length);
        // Unique ids to be urls.length
        const uniqueIds = new Set(results.map(result => result.id));
        expect(uniqueIds.size).toBe(urls.length);
    }, TIMEOUT * 250);
});
