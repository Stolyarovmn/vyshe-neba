'use strict';
/* Оригинальная процедурная партитура и звуковая среда. Никаких внешних файлов. */
(()=>{
let ctx=null,master,musicBus,effectBus,engineBus,engineFilter,engineGain,rumbleGain,jetGain,jetPan,musicFilter;
let muted=false,unlocked=false,timer=null,nextBeat=0,beat=0,state={thrust:false,maneuver:0,stage:0,screen:'home'},noiseBuffer=null;
const continuous=[];
const notes=[48,53,45,55,48,53,50,55]; // Восемь тактов до возвращения гармонии.
const chords=[[0,4,7,14],[0,4,7,11],[0,3,7,10],[0,4,7,12],[0,4,7,11],[0,4,7,14],[0,3,7,10],[0,5,7,14]];
const hz=n=>440*Math.pow(2,(n-69)/12);
function gain(value,destination){let n=ctx.createGain();n.gain.value=value;n.connect(destination);return n;}
function smooth(param,value,seconds=.15){param.setTargetAtTime(value,ctx.currentTime,seconds);}
function filter(type,frequency,destination,q=.6){let n=ctx.createBiquadFilter();n.type=type;n.frequency.value=frequency;n.Q.value=q;n.connect(destination);return n;}
function oscillator(type,frequency,destination){let n=ctx.createOscillator();n.type=type;n.frequency.value=frequency;n.connect(destination);n.start();continuous.push(n);return n;}
function noise(destination){let n=ctx.createBufferSource();n.buffer=noiseBuffer;n.loop=true;n.connect(destination);n.start();continuous.push(n);return n;}
function init(){
 const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;ctx=new AC();
 master=ctx.createGain();master.gain.value=muted?0:.62;
 const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=10;limiter.ratio.value=12;limiter.attack.value=.004;limiter.release.value=.22;master.connect(limiter);limiter.connect(ctx.destination);
 const n=Math.ceil(ctx.sampleRate*4);noiseBuffer=ctx.createBuffer(1,n,ctx.sampleRate);let data=noiseBuffer.getChannelData(0),seed=37821,previous=0;
 for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;let white=(seed>>>0)/2147483648-1;previous=white*.82+previous*.18;data[i]=previous;}
 musicFilter=filter('lowpass',1600,master);musicBus=gain(.52,musicFilter);effectBus=gain(.48,master);engineBus=gain(.65,master);
 engineGain=gain(0,engineBus);engineFilter=filter('lowpass',750,engineGain,.45);noise(filter('highpass',38,engineFilter,.4));
 rumbleGain=gain(0,engineBus);oscillator('sine',43,rumbleGain);oscillator('sine',67,gain(.38,rumbleGain));
 jetGain=gain(0,engineBus);jetPan=ctx.createStereoPanner?ctx.createStereoPanner():gain(1,jetGain);if(jetPan.pan)jetPan.connect(jetGain);noise(filter('bandpass',2100,jetPan,.75));
 nextBeat=ctx.currentTime+.1;beat=0;return true;
}
function voice(note,start,duration,volume,bus=musicBus,attack=.2){
 if(!ctx||ctx.state==='closed')return;
 // Тёплый составной тембр: фундаментальная и две тихие обертоны, без резких волн.
 let envelope=ctx.createGain();envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(volume,start+attack);envelope.gain.exponentialRampToValueAtTime(Math.max(.0001,volume*.42),start+Math.max(attack+.01,duration*.55));envelope.gain.exponentialRampToValueAtTime(.0001,start+duration);envelope.connect(bus);
 let remaining=3;for(let [mult,level]of [[1,1],[2,.16],[3,.045]]){let o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=hz(note)*mult;g.gain.value=level;o.connect(g);g.connect(envelope);o.start(start);o.stop(start+duration+.05);o.onended=()=>{o.disconnect();g.disconnect();if(--remaining===0)envelope.disconnect();};}
}
function schedule(horizon=ctx?.currentTime+.4){if(!ctx||ctx.state!=='running'||muted)return;let now=ctx.currentTime;if(nextBeat<now-.5)nextBeat=now+.05;
 while(nextBeat<horizon){let bar=Math.floor(beat/8)%8,step=beat%8,root=notes[bar],chord=chords[bar];
 if(step===0){chord.forEach((interval,i)=>voice(root+interval,nextBeat+i*.035,5.1,.19,musicBus,.9));voice(root-12,nextBeat,2.8,.22,musicBus,.18);}
 if(step===4)voice(root-12,nextBeat,2.1,.16,musicBus,.12);
 if(step===2||step===6){let degree=chord[(Math.floor(beat/8)+step)%chord.length];voice(root+degree+12,nextBeat,2.6,.105,musicBus,.055);}
 // Пульс через мягкое щипковое созвучие, а не ударные щелчки.
 if(state.screen==='flight'&&step%2===0)voice(root+7,nextBeat,1.2,.065,musicBus,.025);
 nextBeat+=.625;beat++;}
}
function unlock(){try{if(!ctx&&!init())return Promise.resolve(false);unlocked=true;const p=ctx.resume();if(!timer)timer=setInterval(schedule,160);return Promise.resolve(p).then(()=>{schedule();return true;}).catch(()=>false);}catch{return Promise.resolve(false);}}
function setMuted(value){value=!!value;if(value===muted)return;muted=value;if(ctx){smooth(master.gain,muted?0:.62,.08);if(!muted)nextBeat=ctx.currentTime+.1;}}
function update(s={}){state={...state,...s};if(!ctx)return;const thrust=state.thrust?1:0,m=Math.min(1,Math.abs(Number(state.maneuver)||0)),flight=state.screen==='flight';
 smooth(engineGain.gain,flight?thrust*.75:0,.09);smooth(rumbleGain.gain,flight?thrust*.2:0,.15);smooth(engineFilter.frequency,540+Math.min(5,Number(state.stage)||0)*100,.3);
 smooth(jetGain.gain,flight?m*.55:0,.045);if(jetPan.pan)smooth(jetPan.pan,Math.max(-.75,Math.min(.75,Number(state.maneuver)||0)),.06);
 smooth(musicBus.gain,state.music===false?0:flight?.43:.52,.45);smooth(musicFilter.frequency,flight?1250:2100,.9);
}
function burst(duration,volume,frequency=350,delay=0){let t=ctx.currentTime+delay,n=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();n.buffer=noiseBuffer;f.type='lowpass';f.frequency.setValueAtTime(frequency,t);f.frequency.exponentialRampToValueAtTime(70,t+duration);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);n.connect(f);f.connect(g);g.connect(effectBus);n.start(t);n.stop(t+duration+.03);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};}
function playEffect(name,volume=1){if(!ctx||!unlocked||muted||ctx.state!=='running')return;let t=ctx.currentTime,v=Math.min(1,Math.max(0,volume));
 if(name==='crash'){burst(.15,.95*v,6400);burst(1.8,.8*v,1600);burst(.25,.28*v,4200,.18);burst(.4,.18*v,2800,.45);voice(28,t,.95,.35*v,effectBus,.012);voice(35,t+.04,.7,.12*v,effectBus,.025);}
 else if(name==='detach'){burst(.22,.22*v,1450);voice(48,t,.3,.09*v,effectBus,.008);voice(55,t+.04,.4,.065*v,effectBus,.015);}
 else if(name==='upgrade'){[60,64,67,74].forEach((n,i)=>voice(n,t+i*.105,1.25,.105*v,effectBus,.025));}
 else if(name==='coin'){voice(84,t,.5,.1*v,effectBus,.008);voice(91,t+.045,.58,.045*v,effectBus,.01);}
 else {voice(65,t,.55,.07*v,effectBus,.025);voice(72,t+.065,.6,.03*v,effectBus,.04);}}
function play(frequency=500,duration=.08,type='sine',vol=.025){if(typeof frequency==='string')return playEffect(frequency,typeof duration==='number'?duration:1);if(frequency<130)return playEffect('crash',Math.min(1,vol*13));if(type==='triangle'&&duration>.15)return playEffect('upgrade',.65);if(frequency>780)return playEffect('coin',.6);if(type==='sawtooth')return playEffect('detach',.7);playEffect('soft',.5);}
function suspend(){if(ctx)return ctx.suspend().catch(()=>{});}
function resume(){if(ctx&&unlocked&&!muted){nextBeat=ctx.currentTime+.1;return ctx.resume().catch(()=>{});}}
function dispose(){clearInterval(timer);timer=null;continuous.forEach(n=>{try{n.stop();n.disconnect();}catch{}});continuous.length=0;if(ctx)ctx.close().catch(()=>{});ctx=null;unlocked=false;}
if(window.__ROCKET_AUDIO_TEST__)window.__rocketAudioTest={schedule};
window.RocketAudio={unlock,setMuted,update,play,playEffect,suspend,resume,dispose,get debug(){return {initialized:!!ctx,unlocked,muted,contextState:ctx?.state||'none',beat,masterGain:master?.gain.value||0,continuousSources:continuous.length};}};
})();
