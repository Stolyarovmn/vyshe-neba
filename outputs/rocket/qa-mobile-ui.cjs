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

    const portrait=await browser.newContext({
      viewport:{width:390,height:844},
      screen:{width:390,height:844},
      hasTouch:true,
      isMobile:true,
      deviceScaleFactor:2
    });
    const portraitPage=await portrait.newPage();
    await portraitPage.goto(pathToFileURL(gameFile).href);
    await portraitPage.waitForFunction(()=>window.PortraitUX?.installed===true&&window.Game);
    const homePortrait=await portraitPage.evaluate(()=>{
      const game=document.getElementById('game');
      return {transform:game.style.transform,portrait:PortraitUX.isPortrait(),flight:PortraitUX.isFlightPortrait()};
    });
    assert(homePortrait.portrait===true,`portrait phone not detected: ${JSON.stringify(homePortrait)}`);
    assert(!homePortrait.transform.includes('rotate('),`portrait menu was still rotated sideways: ${homePortrait.transform}`);
    await portraitPage.evaluate(()=>Game.start());
    await portraitPage.waitForFunction(()=>PortraitUX.isFlightPortrait()===true);
    await portraitPage.waitForTimeout(150);
    const flightPortrait=await portraitPage.evaluate(()=>{
      const game=document.getElementById('game'),canvas=document.getElementById('canvas'),hud=document.getElementById('portraitHud'),pad=document.getElementById('portraitFlightPad');
      const gs=getComputedStyle(game),cs=getComputedStyle(canvas),hs=getComputedStyle(hud),ps=getComputedStyle(pad);
      return {
        game:[parseFloat(gs.width),parseFloat(gs.height)],
        transform:game.style.transform,
        objectFit:cs.objectFit,
        hudDisplay:hs.display,
        padDisplay:ps.display,
        screen:Game.screen
      };
    });
    assert(flightPortrait.screen==='flight',`portrait QA did not enter flight: ${JSON.stringify(flightPortrait)}`);
    assert(flightPortrait.game[1]>flightPortrait.game[0]*1.7,`portrait flight did not fill a vertical stage: ${JSON.stringify(flightPortrait)}`);
    assert(flightPortrait.objectFit==='cover',`portrait flight world must preserve aspect ratio and crop, not stretch: ${JSON.stringify(flightPortrait)}`);
    assert(flightPortrait.hudDisplay!=='none'&&flightPortrait.padDisplay!=='none',`portrait HUD/touch pad missing: ${JSON.stringify(flightPortrait)}`);
    assert(!flightPortrait.transform.includes('rotate('),`portrait flight still rotated sideways: ${flightPortrait.transform}`);
    await portraitPage.screenshot({path:path.join(out,'portrait-flight.png'),fullPage:true});
    await portrait.close();

    const desktop=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
    const desktopPage=await desktop.newPage();
    await desktopPage.goto(pathToFileURL(gameFile).href);
    await desktopPage.waitForFunction(()=>window.MobileUX?.installed===true);
    const desktopResult=await desktopPage.evaluate(()=>window.MobileUX.metrics());
    assert(desktopResult.mobile===false,`desktop viewport was incorrectly classified as mobile: ${JSON.stringify(desktopResult)}`);
    assert(desktopResult.fontScale===1,`desktop font must retain original scale: ${desktopResult.fontScale}`);
    assert(desktopResult.rocketScale>=1.08,`desktop rocket visual boost missing: ${desktopResult.rocketScale}`);
    await desktop.close();

    console.log('mobile UI QA PASS',JSON.stringify({mobile:mobileResult,portrait:{home:homePortrait,flight:flightPortrait},desktop:desktopResult}));
  }finally{
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1);});
