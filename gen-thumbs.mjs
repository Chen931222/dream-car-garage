// Regenerate ALL lobby thumbnails via headless Chrome.
// KEY TRICK: puppeteer gives the page a REAL viewport, so model-viewer's viewport-intersection
// gate opens and WebGL actually renders (the Claude preview tool's 0-layout headless CANNOT do this
// and returns blank frames). Per-car `orbit` is tuned so every car shows a FRONT 3/4.
//
// Prereqs: a static server serving web-deploy on PORT below, and puppeteer-core installed.
//   python -m http.server 8223 --directory web-deploy   (then: node gen-thumbs.mjs)
import puppeteer from 'puppeteer-core';
import fs from 'fs';

const CHROME = 'C:/Users/USER/.cache/puppeteer/chrome/win64-148.0.7778.97/chrome-win64/chrome.exe';
const BASE = 'http://localhost:8223';
const OUT  = 'C:/Users/USER/Desktop/360汽車環景/web-deploy';

// idx, name, file, cameraOrbit(theta phi radius) — theta chosen per model so the FRONT faces camera
const CARS = [
  [0,'w202',   'w202.glb',   '-32deg 76deg 108%'],
  [1,'mx5',    'mx5.glb',    '-32deg 76deg 108%'],
  [2,'macan',  'macan.glb',  '-32deg 76deg 108%'],
  [3,'x5',     'x5.glb',      '148deg 76deg 108%'],
  [4,'q50',    'q50.glb',     '148deg 76deg 108%'],
  [5,'r350',   'r350.glb',   '-32deg 76deg 108%'],
  [6,'mazda3', 'mazda3.glb',  '148deg 76deg 108%'],
  [7,'mustang','mustang.glb', '148deg 76deg 108%'],
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
         '--ignore-gpu-blocklist','--no-sandbox','--disable-dev-shm-usage','--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });

for (const [idx, name, file, orbit] of CARS) {
  try {
    await page.goto(`${BASE}/index.html?car=${idx}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // wait until the TARGET car is fully loaded (src matches + materials present + loader gone)
    await page.waitForFunction((f) => {
      const mv = document.querySelector('model-viewer');
      if (!mv || !mv.src || mv.src.indexOf(f) < 0) return false;
      if (!(mv.model && mv.model.materials && mv.model.materials.length > 1)) return false;
      const l = document.querySelector('#loader');
      return !l || getComputedStyle(l).display === 'none' || parseFloat(getComputedStyle(l).opacity || '1') < 0.05;
    }, { timeout: 70000, polling: 300 }, file);

    const durl = await page.evaluate(async (orbit) => {
      const mv = document.querySelector('model-viewer');
      mv.autoRotate = false; mv.removeAttribute('auto-rotate');
      mv.cameraOrbit = orbit;
      if (mv.jumpCameraToGoal) mv.jumpCameraToGoal();
      await new Promise(r => { let n = 0; (function t(){ n++; if (n > 45) return r(); requestAnimationFrame(t); })(); });
      await new Promise(r => setTimeout(r, 900));
      return await mv.toDataURL('image/webp', 0.86);   // car on transparent bg + soft shadow
    }, orbit);

    const buf = Buffer.from(durl.split(',')[1], 'base64');
    fs.writeFileSync(`${OUT}/thumb-${name}.webp`, buf);
    console.log(`OK thumb-${name}.webp  ${Math.round(buf.length/1024)}KB  @ ${orbit}`);
  } catch (e) {
    console.log(`FAIL ${name}: ${String(e).slice(0,140)}`);
  }
}
await browser.close();
console.log('done — remember: cp dream-car.html web-deploy/index.html is NOT needed (thumbs only); run npx wrangler deploy to publish.');
