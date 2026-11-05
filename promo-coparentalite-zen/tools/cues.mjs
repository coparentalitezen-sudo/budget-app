// Print the caption cues the page draws (window.SRT) as JSON: node tools/cues.mjs <project>  (run from $LIB)
import path from 'path';
const LIB = process.env.LIB; const { openDemo, closeServer } = await import(path.join(LIB, 'core/render/page.mjs'));
const { browser, page } = await openDemo(process.argv[2], { w: 1080, h: 1920 });
console.log(JSON.stringify(await page.evaluate(() => window.SRT)));
await browser.close(); closeServer();
