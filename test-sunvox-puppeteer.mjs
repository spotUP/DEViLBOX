import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();

// Collect console logs
page.on('console', msg => {
  console.log(`[Browser ${msg.type()}]:`, msg.text());
});

console.log('Navigating to test page...');
await page.goto('http://localhost:5173/test-sunvox.html');

console.log('Clicking Load & Play...');
await page.click('#load');

// Wait for things to happen
console.log('Waiting 5 seconds...');
await new Promise(r => setTimeout(r, 5000));

// Get currentTime to see if audio is running
const currentTime = await page.evaluate(() => {
  return window.audioContext?.currentTime || 0;
});
console.log('AudioContext currentTime:', currentTime);

console.log('Done. Keeping browser open for inspection...');
// Keep browser open
await new Promise(r => setTimeout(r, 60000));

await browser.close();
