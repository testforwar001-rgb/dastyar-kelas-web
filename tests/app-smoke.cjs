const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const root = process.cwd();
const htmlSource = fs.readFileSync(path.join(root,'index.html'),'utf8');
let scriptPos=0, scriptNo=0;
while((scriptPos=htmlSource.indexOf('<script',scriptPos))>=0){const scriptStart=htmlSource.indexOf('>',scriptPos)+1;const scriptEnd=htmlSource.indexOf('</script>',scriptStart);if(scriptStart<1||scriptEnd<0)throw new Error('Malformed inline script tag');new vm.Script(htmlSource.slice(scriptStart,scriptEnd),{filename:'index-inline-'+scriptNo+'.js'});scriptNo++;scriptPos=scriptEnd+9;}
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
const server = http.createServer((req,res)=>{
  const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const file = path.join(root, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Tehran'});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')pageErrors.push('console: '+m.text());});
  try{
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
    await page.waitForSelector('#tabbar [data-tab="timetable"]');
    if(await page.locator('#app .hero').count()!==1) throw new Error('Dashboard did not render. appHTML='+String(await page.locator('#app').innerHTML()).slice(0,1200)+' pageErrors='+pageErrors.join(' | '));
    await page.locator('#tabbar [data-tab="timetable"]').click();
    await page.waitForSelector('#tt_sat_0');
    await page.locator('#tt_sat_0').fill('علوم آزمایشی');
    await page.locator('#tt_count').selectOption('6');
    await page.locator('#tt_sat_5').fill('مهارت آزمایشی');
    await page.getByRole('button',{name:/ذخیره برنامه هفتگی/}).click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dk_db_v1')));
    if(saved.timetable.days.find(d=>d.key==='sat').lessons[0]!=='علوم آزمایشی') throw new Error('Timetable did not persist locally');
    if(saved.timetable.days.find(d=>d.key==='sat').lessons[5]!=='مهارت آزمایشی') throw new Error('Sixth period did not persist');
    await page.locator('#tabbar [data-tab="dash"]').click();
    await page.waitForTimeout(200);
    if(!(await page.locator('#app').innerText()).includes('یادآوری این هفته')) throw new Error('Weekly reminder missing from dashboard');
    await page.evaluate(async()=>{ if('serviceWorker' in navigator) await navigator.serviceWorker.ready; });
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('#tabbar [data-tab="timetable"]',{timeout:10000});
    await page.locator('#tabbar [data-tab="timetable"]').click();
    await page.waitForSelector('#tt_sun_0');
    await page.locator('#tt_sun_0').fill('ذخیره در حالت آفلاین');
    await page.getByRole('button',{name:/ذخیره برنامه هفتگی/}).click();
    const offlineSaved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dk_db_v1')));
    if(offlineSaved.timetable.days.find(d=>d.key==='sun').lessons[0]!=='ذخیره در حالت آفلاین') throw new Error('Offline local save failed');
    if(pageErrors.length) throw new Error('Browser errors: '+pageErrors.join(' | '));
    console.log('PASS: mobile dashboard, timetable editing, local persistence, weekly reminder and offline reload/save');
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exit(1);});
