/* Полный прогон регрессий игры одной командой: node verify.cjs */
const {spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
for(let file of ['build.cjs','qa-base-layout.cjs','qa-infrastructure.cjs','qa-b01-rig.cjs','qa-b01-runtime.cjs','qa-b01-runtime-browser.cjs','qa-route-engine.cjs','qa-flight-reference.cjs','qa-map.cjs','qa-stage.cjs','qa-feedback.cjs','qa-mobile-ui.cjs','qa-world-streaming.cjs','qa-pad-ui.cjs','qa-audio.cjs','qa-journey.cjs','qa.cjs','qa-world.cjs','qa-world-motion.cjs','qa-aircraft.cjs','qa-atmosphere.cjs','qa-base.cjs']){
 process.stdout.write('\nПроверка: '+file+'\n');
 let r=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:root,stdio:'inherit',env:{...process.env,GAME_FILE:path.resolve(__dirname,'../Выше неба.html'),SKIP_BROWSER:''}});
 if(r.error)throw r.error;if(r.signal)throw new Error(file+' terminated by '+r.signal);if(r.status!==0)process.exit(r.status||1);
}
console.log('\nСборка и все проверки завершены успешно.');
