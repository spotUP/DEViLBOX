const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--disable-web-security',
      '--allow-file-access-from-files',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-features=SharedArrayBuffer',
    ]
  });
  const page = await browser.newPage();
  
  // Collect all console messages
  const allMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    allMessages.push(text);
    // Only log important messages
    if (text.includes('Gearmulator') || text.includes('gm_') || text.includes('render #') || 
        text.includes('ERROR') || text.includes('error') || text.includes('RuntimeError') ||
        text.includes('ESAI') || text.includes('peak=') || text.includes('SAB'))
      console.log('[B]', text);
  });
  page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

  console.log('Navigating...');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Find all buttons and their text
  const buttons = await page.evaluate(() => {
    return [...document.querySelectorAll('button')].map(b => ({
      text: b.textContent.trim().substring(0, 50),
      visible: b.offsetParent !== null
    }));
  });
  console.log('Available buttons:', JSON.stringify(buttons.filter(b => b.visible).slice(0, 20)));

  // Look for Gearmulator / Virus in the UI — might need to select it as an instrument
  const hasGearmulator = await page.evaluate(() => {
    const all = document.body.innerText;
    return {
      hasVirus: all.includes('Virus'),
      hasGearmulator: all.includes('Gearmulator') || all.includes('gearmulator'),
      hasInit: all.includes('Initialize'),
      textSample: all.substring(0, 500)
    };
  });
  console.log('Page state:', JSON.stringify(hasGearmulator));

  await browser.close();
})();
