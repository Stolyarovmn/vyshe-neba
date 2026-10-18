const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'../..');
const gameFile=process.env.GAME_FILE||path.resolve(__dirname,'../Выше неба.html');
const out=path.join(root,'work','mobile-ui');
fs.mkdirSync(out,{recursive:true});
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

(async()=>{
  const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH||undefined;
  const args=process.env.CHROMIUM_ARGS?JSON.parse(process.env.CHROMIUM_ARGS):[];
  const browser=await chromium.launch({headless:true,executablePath,args});
  try{
    const mobile=await browser.newContext({
      viewport:{width:844,height:390},
      screen:{width:844,height:390},
      hasTouch:true,
      isMobile:true,
      deviceScaleFactor:2
    });
    const page=await mobile.newPage();
    await page.goto(pathToFileURL(gameFile).href);
    await page.waitForFunction(()=>window.MobileUX?.installed===true);

    const mobileResult=await page.evaluate(()=>{
      const metrics=window.MobileUX.metrics();
      const gameCtx=document.getElementById('canvas').getContext('2d');
      gameCtx.save();
      gameCtx.font='600 14px Arial';
      const gameWidth=gameCtx.measureText('МОБИЛЬНЫЙ ТЕКСТ').width;
      gameCtx.restore();
      const probe=document.createElement('canvas').getContext('2d');
      probe.font='600 14px Arial';
      const baseWidth=probe.measureText('МОБИЛЬНЫЙ ТЕКСТ').width;
      return {metrics,textRatio:gameWidth/baseWidth,maxTouchPoints:navigator.maxTouchPoints};
    });
    assert(mobileResult.metrics.mobile===true,`phone viewport was not classified as mobile: ${JSON.stringify(mobileResult)}`);
    assert(mobileResult.metrics.fontScale>=1.20,`mobile font scale too small: ${mobileResult.metrics.fontScale}`);
    assert(mobileResult.textRatio>=1.18,`game-canvas text was not enlarged enough: ${mobileResult.textRatio}`);
    assert(mobileResult.metrics.coinScale>=1.30,`mobile coin scale too small: ${mobileResult.metrics.coinScale}`);
    assert(mobileResult.metrics.rocketScale>=1.08,`rocket visual scale too small: ${mobileResult.metrics.rocketScale}`);
    await page.screenshot({path:path.join(out,'mobile-home.png'),fullPage:true});
    await mobile.close();

    const desktop=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
    const desktopPage=await desktop.newPage();
    await desktopPage.goto(pathToFileURL(gameFile).href);
    await desktopPage.waitForFunction(()=>window.MobileUX?.installed===true);
    const desktopResult=await desktopPage.evaluate(()=>window.MobileUX.metrics());
    assert(desktopResult.mobile===false,`desktop viewport was incorrectly classified as mobile: ${JSON.stringify(desktopResult)}`);
    assert(desktopResult.fontScale===1,`desktop font must retain original scale: ${desktopResult.fontScale}`);
    assert(desktopResult.rocketScale>=1.08,`desktop rocket visual boost missing: ${desktopResult.rocketScale}`);
    await desktop.close();

    console.log('mobile UI QA PASS',JSON.stringify({mobile:mobileResult,desktop:desktopResult}));
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
