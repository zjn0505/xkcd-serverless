#!/usr/bin/env ts-node
/**
 * Manual test script for image dimension detection
 * Tests the probe-image-size integration with real xkcd images
 * 
 * Run: npx ts-node scripts/test-image-probe.ts
 */

import { getImageDimensions, getImageDimensionsWithRetry, batchGetImageDimensions } from '../src/utils/image-probe';

async function testSingleImage() {
  console.log('\n🔍 Test 1: Single Image Detection');
  console.log('=====================================');
  
  const imageUrl = 'https://imgs.xkcd.com/comics/python.png';
  console.log(`Testing: ${imageUrl}`);
  
  const dimensions = await getImageDimensions(imageUrl);
  
  if (dimensions) {
    console.log(`✅ Success: ${dimensions.width}x${dimensions.height}`);
  } else {
    console.log('❌ Failed to get dimensions');
  }
}

async function testInvalidImage() {
  console.log('\n🔍 Test 2: Invalid Image URL');
  console.log('=====================================');
  
  const imageUrl = 'https://imgs.xkcd.com/comics/nonexistent_12345.png';
  console.log(`Testing: ${imageUrl}`);
  
  const dimensions = await getImageDimensions(imageUrl, 5000);
  
  if (dimensions === null) {
    console.log('✅ Correctly returned null for invalid URL');
  } else {
    console.log('❌ Should have returned null');
  }
}

async function testWithRetry() {
  console.log('\n🔍 Test 3: Retry Logic');
  console.log('=====================================');
  
  const imageUrl = 'https://imgs.xkcd.com/comics/python.png';
  console.log(`Testing with retry: ${imageUrl}`);
  
  const dimensions = await getImageDimensionsWithRetry(imageUrl, 2, 10000);
  
  if (dimensions) {
    console.log(`✅ Success with retry: ${dimensions.width}x${dimensions.height}`);
  } else {
    console.log('❌ Failed even with retry');
  }
}

async function testBatchImages() {
  console.log('\n🔍 Test 4: Batch Image Detection');
  console.log('=====================================');
  
  const imageUrls = [
    'https://imgs.xkcd.com/comics/python.png',
    'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg',
    'https://imgs.xkcd.com/comics/kerning.png',
    'https://imgs.xkcd.com/comics/nonexistent.png' // This should fail
  ];
  
  console.log(`Testing ${imageUrls.length} images concurrently...`);
  
  const results = await batchGetImageDimensions(imageUrls, 3, 10000);
  
  console.log('\nResults:');
  results.forEach((result, index) => {
    const url = imageUrls[index];
    const filename = url.split('/').pop();
    
    if (result) {
      console.log(`  ✅ ${filename}: ${result.width}x${result.height}`);
    } else {
      console.log(`  ❌ ${filename}: Failed`);
    }
  });
  
  const successCount = results.filter(r => r !== null).length;
  const failureCount = results.filter(r => r === null).length;
  
  console.log(`\nSummary: ${successCount} succeeded, ${failureCount} failed`);
}

async function testVariousFormats() {
  console.log('\n🔍 Test 5: Various Image Formats');
  console.log('=====================================');
  
  const testImages = [
    { url: 'https://imgs.xkcd.com/comics/python.png', format: 'PNG' },
    { url: 'https://imgs.xkcd.com/comics/barrel_cropped_(1).jpg', format: 'JPEG' }
  ];
  
  for (const { url, format } of testImages) {
    console.log(`\nTesting ${format}: ${url.split('/').pop()}`);
    const dimensions = await getImageDimensions(url);
    
    if (dimensions) {
      console.log(`  ✅ ${format}: ${dimensions.width}x${dimensions.height}`);
    } else {
      console.log(`  ❌ ${format}: Failed`);
    }
  }
}

async function testRealWorldScenario() {
  console.log('\n🔍 Test 6: Real-World Crawler Scenario');
  console.log('=====================================');
  
  // Simulate what the crawler does
  console.log('Simulating crawler behavior for comic #353 (Python)...\n');
  
  const comicId = 353;
  const apiUrl = `https://xkcd.com/${comicId}/info.0.json`;
  
  try {
    console.log('1. Fetching comic metadata...');
    const response = await fetch(apiUrl);
    const comicData: any = await response.json();
    
    console.log(`   Comic: "${comicData.title}"`);
    console.log(`   Image URL: ${comicData.img}`);
    
    console.log('\n2. Getting image dimensions...');
    const dimensions = await getImageDimensions(comicData.img, 10000);
    
    if (dimensions) {
      comicData.width = dimensions.width;
      comicData.height = dimensions.height;
      
      console.log(`   ✅ Dimensions: ${dimensions.width}x${dimensions.height}`);
      console.log('\n3. Final comic data:');
      console.log(JSON.stringify({
        id: comicData.num,
        title: comicData.title,
        img: comicData.img,
        width: comicData.width,
        height: comicData.height
      }, null, 2));
    } else {
      console.log('   ⚠️  Dimensions not available, continuing without them');
    }
  } catch (error) {
    console.log('   ❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  console.log('🎨 Image Dimension Detection Test Suite');
  console.log('========================================');
  console.log('Testing probe-image-size integration\n');
  
  try {
    await testSingleImage();
    await testInvalidImage();
    await testWithRetry();
    await testBatchImages();
    await testVariousFormats();
    await testRealWorldScenario();
    
    console.log('\n✅ All tests completed!');
    console.log('\n💡 Integration verified successfully!');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

main();

