const { chromium } = require('playwright');

(async () => {
  console.log("Connecting to local development server on port 3000...");
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  page.on('response', response => {
    if (!response.ok()) {
      console.log('FAILED REQUEST:', response.url(), response.status());
    }
  });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'load' });
    await page.waitForTimeout(5000);
    
    const title = await page.title();
    console.log("PAGE TITLE:", title);
    
    const bodyHTML = await page.evaluate(() => document.getElementById('root')?.innerHTML || 'No root innerHTML');
    console.log("ROOT CONTENT PREVIEW (first 200 chars):", bodyHTML.substring(0, 200));
  } catch (e) {
    console.error("Test failed:", e);
  } finally {
    await browser.close();
  }
})();
