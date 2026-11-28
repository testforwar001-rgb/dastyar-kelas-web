const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('playwright');
const root = process.cwd();
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
let pos=0, n=0;
while((pos=html.indexOf('<script',pos))>=0){
  const start=html.indexOf('>',pos)+1, end=html.indexOf('</script>',start);
  if(start<1||end<0) throw new Error('Malformed inline script');
  new vm.Script(html.slice(start,end),{filename:'inline-'+n+'.js'});
  n++; pos=end+9;
}
const server=http.createServer((req,res)=>{
  const p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const f=path.join(root,p==='/'?'index.html':p.slice(1));
  if(!f.startsWith(root)||!fs.existsSync(f)){res.writeHead(404);return res.end('Not found');}
  res.setHeader('Content-Type',path.extname(f)==='.html'?'text/html; charset=utf-8':'application/octet-stream');
  fs.createReadStream(f).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(4174,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4174/',{waitUntil:'networkidle'});
    const icons=await page.locator('#tabbar svg').count();
    if(icons!==9) throw new Error('Expected 9 vector navigation icons, got '+icons);
    const short=await page.evaluate(async()=>{
      let printed=0,warnings=[];
      window.print=()=>printed++;
      window.alert=m=>warnings.push(String(m));
      document.getElementById('printArea').innerHTML='<div class="print-page compact" style="height:200mm"><p>گزارش آزمایشی</p></div>';
      printAfterPreflight();
      await new Promise(r=>setTimeout(r,450));
      return {printed,warnings,measureClass:document.body.classList.contains('print-measure')};
    });
    if(short.printed!==1||short.warnings.length||short.measureClass) throw new Error('Short A4 page preflight failed: '+JSON.stringify(short));
    const long=await page.evaluate(async()=>{
      let printed=0,warnings=[];
      window.print=()=>printed++;
      window.alert=m=>warnings.push(String(m));
      document.getElementById('printArea').innerHTML='<div class="print-page compact" style="height:280mm"><p>گزارش طولانی آزمایشی</p></div>';
      printAfterPreflight();
      await new Promise(r=>setTimeout(r,450));
      return {printed,warnings,measureClass:document.body.classList.contains('print-measure')};
    });
    if(long.printed!==0||long.warnings.length!==1||long.measureClass) throw new Error('Overflow warning preflight failed: '+JSON.stringify(long));
    await page.emulateMedia({media:'print'});
    await page.evaluate(()=>{
      document.getElementById('printArea').innerHTML=
        '<div class="print-page" style="height:250mm;box-sizing:border-box">صفحه اول</div>'+
        '<div class="print-page" style="height:250mm;box-sizing:border-box">صفحه دوم</div>';
    });
    const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
    const pageCount=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
    if(pageCount!==2) throw new Error('Expected exactly 2 A4 sheets for 2 print-page wrappers, got '+pageCount);
    if(errors.length) throw new Error('Browser errors: '+errors.join(' | '));
    console.log('PASS: 9 vector icons, one-page preflight, oversized-content warning without clipping, and two-wrapper A4 PDF pagination');
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exit(1);});
