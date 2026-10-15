/* Физика и экономика не зависят от отрисовки. */
(function(root){
const UPGRADES=[
 ['fuel','Топливный бак','Больше времени под тягой',120,1.18,20],
 ['engine','Двигатель','Сильнее тяга, выше скорость',180,1.19,20],
 ['legs','Посадочные опоры','Выдерживают жёсткую посадку',100,1.18,12],
 ['reserve','Топливная система','Экономичнее тяга всех ступеней',140,1.18,20],
 ['hull','Обшивка','Защита от обломков',110,1.18,15],
 ['magnet','Магнит','Собирает монеты издалека',140,1.18,15],
 ['fins','Стабилизаторы','Быстрее поворот, меньше снос',120,1.18,18],
 ['parachute','Парашют','X: снижает скорость падения на Земле',200,1.2,12],
 ['booster','Разгонный блок','Навесная стартовая ступень с отдельным топливом',360,1.26,8]
];
const MODES=[{name:'Свободный полёт',desc:'Твоя ракета. Твоя траектория.',gravity:52,wind:2,reward:1},{name:'Воздушный слалом',desc:'Больше колец · награды ×1,25',gravity:52,wind:2,reward:1.25},{name:'Лунная экспедиция',desc:'Низкая гравитация · награды ×1,2',gravity:7,wind:0,reward:1.2},{name:'Грузовой рейс',desc:'Тяжёлый груз · награды ×1,35',gravity:52,wind:2,reward:1.35},{name:'Марсианская экспедиция',desc:'Тонкая атмосфера · красная планета',gravity:20,wind:.6,reward:1.5}];
const ERAS=[{year:1978,name:'Гаражная мечта',cost:650,flights:5,desc:'Ручная сборка. Сарай, бетон и мечта.'},{year:1986,name:'Своя мастерская',cost:1800,flights:12,desc:'Подъёмник, бак и первые станки.'},{year:1998,name:'Испытательный центр',cost:4800,flights:24,desc:'Кран, радар и кирпичные цехи.'},{year:2015,name:'Космический порт',cost:11000,flights:42,desc:'Центр управления и солнечные поля.'},{year:2035,name:'Орбитальная эра',cost:24000,flights:70,desc:'Роботы, конвейеры и станции.'},{year:2060,name:'Горизонт будущего',cost:0,flights:0,desc:'Мегаполисы и космопорт будущего.'}];
function fresh(){return {v:2,location:'earth',equipment:{booster:true},coins:180,base:0,upgrades:Object.fromEntries(UPGRADES.map(u=>[u[0],0])),inventory:{chute:0,repair:0,boost:0,magnet:0},skins:['classic'],skin:'classic',settings:{muted:false,shake:true},stats:{flights:0,landings:0,crashes:0,best:0,distance:0,earned:0,rings:0,pickups:0,perfect:0,streak:0,bestStreak:0,alt:0,airtime:0,near:0,modes:0,parachutes:0,saved:0,moon:0,storm:0,cargo:0},achievements:[],missions:[],skippedMissions:[],mode:0};}
function price(p,id){let u=UPGRADES.find(u=>u[0]===id);return Math.round(u[3]*u[4]**p.upgrades[id]);}
function upgradeLimit(p,id){if(id==='booster'&&p.base<1)return 0;let u=UPGRADES.find(u=>u[0]===id);return Math.min(u[5],[3,6,9,12,16,20][p.base],8+Math.floor(p.stats.flights/3));}
function purchase(p,id){let u=UPGRADES.find(u=>u[0]===id),cost=price(p,id);if(p.upgrades[id]>=upgradeLimit(p,id)||p.coins<cost)return false;p.coins-=cost;p.upgrades[id]++;return true;}
function upgradeBase(p){let era=ERAS[p.base];if(p.base>=ERAS.length-1||p.coins<era.cost||p.stats.flights<era.flights)return false;p.coins-=era.cost;p.base++;return true;}
const SPACE_HEIGHT=10000; // В игре это 100 км на шкале высоты. В космосе — аркадная невесомость.
const ROUTE_BODIES=[{id:'earth',name:'Земля',y:0,gravity:52,radius:10000},{id:'moon',name:'Луна',y:18000,gravity:9,radius:3000},{id:'mars',name:'Марс',y:40000,gravity:16,radius:4500}];
function marsUnlocked(p){return !!p&&p.stats.moon>0&&p.base>=3&&p.upgrades.engine>=9;}
function routeTarget(p){return ROUTE_BODIES[marsUnlocked(p)?2:1];}
function surfaceAt(y,p){let bodies=ROUTE_BODIES.filter(b=>b.id!=='mars'||marsUnlocked(p)),body=bodies.reduce((a,b)=>Math.abs(y-b.y)<Math.abs(y-a.y)?b:a);return {...body,distance:Math.abs(y-body.y),normal:y<body.y?-1:1,unlocked:true};}
function bodyGravity(y,body){let d=Math.abs(y-body.y);if(d>=body.radius)return 0;let t=d/body.radius,fade=Math.max(0,Math.min(1,(t-.45)/.55));return body.gravity*(1-.15*t)*(1-fade*fade*(3-2*fade))*(y<body.y?-1:1);}
function gravityAt(y,mode=0,p){if(mode===2||mode===4)return (mode===2?7:20)/(1+Math.max(0,y)/20000)**2;let g=bodyGravity(Math.max(0,y),ROUTE_BODIES[0])+bodyGravity(y,ROUTE_BODIES[1]);if(marsUnlocked(p))g+=bodyGravity(y,ROUTE_BODIES[2]);return g;}
function surfaceCrossing(previousY,y,p){for(let body of ROUTE_BODIES){if(body.id==='mars'&&!marsUnlocked(p))continue;if((previousY<body.y&&y>=body.y)||(previousY>body.y&&y<=body.y))return {...body,normal:previousY<body.y?-1:1};}return null;}
function thrustPower(p,r){let base=72+p.upgrades.engine*6,id=r?.stageId;return id==='booster'?base*1.45:id==='capsule'?Math.max(60,base*.85):base;}
function turnRate(p,r,mode=0){let space=atmosphereAt(r.y,mode)===0;return Math.min(3.5,(1.1+p.upgrades.fins*.13)*(space?2:1));}
function airDrag(r,p,mode){let density=atmosphereAt(r.y,mode),speed=Math.hypot(r.vx,r.vy);if(!density||speed<.001)return 0;let ascent=.5+.5*r.vy/speed;return density*(.065+.155*ascent)/(1+p.upgrades.fins*.07);}
function collisionDamage(r,p,o={}){let speed=Math.hypot(r.vx-(o.vx||0),r.vy-(o.vy||0));return Math.round(Math.max(3,Math.min(100,6+speed*.48-p.upgrades.hull*.8)));}
function gateImpulse(r,p){let speed=Math.hypot(r.vx,r.vy),dx=speed>.5?r.vx/speed:Math.sin(r.angle),dy=speed>.5?r.vy/speed:Math.cos(r.angle);r.vx+=dx*11;r.vy+=dy*11;r.gateBoost=3;}
function contractFuelBonus(p){return Math.min(15,Math.floor(Math.max(0,(p.missions?.length||0)-(p.skippedMissions?.length||0))/2));}
function speedLimit(p){return Math.min(190,68+p.upgrades.engine*5.5+p.base*2);}
function descentLimit(p){return Math.min(125,88+p.upgrades.legs*2+p.base*2);}
function flightReward(r,p){return Math.min(1800,Math.floor((12+Math.sqrt(Math.max(0,r.distance))*1.7+Math.min(10000,r.maxAlt)/120)*MODES[r.mode].reward*(1+p.base*.1)));}
function atmosphereAt(y,mode=0){return mode===2?0:(mode===4?.16:1)*Math.max(0,1-Math.max(0,y)/SPACE_HEIGHT)**2;}
function fuelRate(p,r){return 9/(1+p.upgrades.reserve*.12)*(r?.stageId==='capsule'?.35:r?.stageId==='booster'?1.3:1);}
function activateStage(r,index){let s=r.stages[index];r.stageIndex=index;r.stageId=s.id;r.stageName=s.name;r.fuel=s.fuel;r.maxFuel=s.maxFuel;}
function syncStage(r){if(r.stages?.[r.stageIndex]){let s=r.stages[r.stageIndex];s.fuel=Math.max(0,Number(r.fuel)||0);s.maxFuel=r.maxFuel;}}
function advanceStage(r){syncStage(r);while(r.fuel<=0&&r.stageIndex<r.stages.length-1){let previous=r.stages[r.stageIndex];r.detachCount++;activateStage(r,r.stageIndex+1);r.stageEvent={id:previous.id,name:previous.name,nextId:r.stageId,nextName:r.stageName,index:r.stageIndex,detachCount:r.detachCount};}return r.fuel>0;}
function totalFuel(r){return Math.max(0,r.fuel)+r.stages.slice(r.stageIndex+1).reduce((sum,s)=>sum+s.fuel,0);}
function fuelReserve(r){return r.stages.slice(r.stageIndex+1).reduce((sum,s)=>sum+s.fuel,0);}
function consumeFuel(r,amount){let left=amount;advanceStage(r);while(left>0&&r.fuel>0){let burn=Math.min(left,r.fuel);r.fuel=Math.max(0,r.fuel-burn);left-=burn;advanceStage(r);}return amount>0?(amount-left)/amount:1;}
function rocket(p){let u=p.upgrades,bonus=p.base*8+contractFuelBonus(p),core=175+u.fuel*28+bonus,stages=[];if((u.booster||0)>0&&p.equipment?.booster!==false)stages.push({id:'booster',name:'Разгонный блок',fuel:60+u.booster*30,maxFuel:60+u.booster*30});stages.push({id:'core',name:'Маршевая ступень',fuel:core,maxFuel:core},{id:'capsule',name:'Капсула',fuel:45+u.fuel*5,maxFuel:45+u.fuel*5});let r={x:0,y:0,vx:0,vy:0,angle:0,stages,stageIndex:0,detachCount:0,stageEvent:null,maneuver:0,boostHeat:0,boostLocked:false,boosting:false,gateBoost:0,shock:0,hp:100+u.hull*35,maxHp:100+u.hull*35,time:0,distance:0,maxAlt:0,rings:0,coins:0,near:0,parachute:false,usedChute:false,hit:0,thrust:false,launched:false,liftedOff:false,done:false};activateStage(r,0);return r;}
function step(r,p,input,dt,mode){if(r.done)return;if(r.y>1)r.liftedOff=true;let u=p.upgrades,m=MODES[mode],g=gravityAt(r.y,mode,p),air=atmosphereAt(r.y,mode);r.launched=r.launched||r.y>0||!!input.thrust;if(r.launched)r.time+=dt;r.hit=Math.max(0,r.hit-dt);advanceStage(r);r.maneuver=0;let rate=turnRate(p,r,mode),turn=0;if(Number.isFinite(input.targetAngle)){let delta=input.targetAngle-r.angle,d=Math.atan2(Math.sin(delta),Math.cos(delta));turn=Math.max(-rate*dt,Math.min(rate*dt,d));}else{turn=(Number(!!input.right)-Number(!!input.left))*rate*dt;if(input.center)turn-=Math.sign(r.angle+turn)*Math.min(Math.abs(r.angle+turn),rate*dt);}if(!r.parachute&&Math.abs(turn)>1e-10&&r.fuel>0){let fraction=consumeFuel(r,1.8*Math.abs(turn)/rate);r.angle+=turn*fraction;r.maneuver=Math.sign(turn);}r.angle=Math.atan2(Math.sin(r.angle),Math.cos(r.angle));if(input.chute&&(u.parachute>0||r.hasChute)&&air>.02&&r.vy<0&&!r.parachute){r.parachute=true;r.usedChute=true;}r.shock=Math.max(0,(r.shock||0)-dt);r.gateBoost=Math.max(0,(r.gateBoost||0)-dt);r.thrust=!!input.thrust&&r.fuel>0&&!r.parachute&&r.shock===0;r.boostHeat??=0;if(r.boostLocked&&r.boostHeat<.3)r.boostLocked=false;r.boosting=!!input.boost&&r.thrust&&!r.boostLocked;r.boostHeat=Math.max(0,Math.min(1,r.boostHeat+(r.boosting?.24:-.18)*dt));if(r.boostHeat>=1)r.boostLocked=true;
if(!r.launched){syncStage(r);return;}
let accel=0;if(r.thrust){let power=thrustPower(p,r)*(r.boosting?1.32:1),burn=fuelRate(p,r)*(r.boosting?1.7:1)*dt,fraction=consumeFuel(r,burn);accel=power*fraction;}
r.vx+=(Math.sin(r.angle)*accel+Math.sin(r.time*.57)*m.wind*air/(1+u.fins*.25)+(input.wind||0)*air)*dt;r.vy+=(Math.cos(r.angle)*accel-g)*dt;let drag=Math.exp(-airDrag(r,p,mode)*dt);r.vx*=drag;r.vy*=drag;
if(r.parachute&&r.vy<0&&air>.02){let terminal=Math.max(3.5,12-u.parachute*.65);r.vy=Math.max(r.vy,-terminal);r.vx*=Math.exp(-.6*dt);r.angle*=Math.exp(-2*dt);}
let speed=Math.hypot(r.vx,r.vy),limit=(r.vy*g<0?descentLimit(p):speedLimit(p))*(1+.12*Math.min(1,r.gateBoost||0))*(r.boosting?1.15:1);if(speed>limit){r.vx*=limit/speed;r.vy*=limit/speed;}r.gravity=g;r.speedLimit=limit;if(r.fuel<=0){r.thrust=false;r.maneuver=0;r.boosting=false;}syncStage(r);
if(!r.liftedOff&&r.y<=0&&r.vy<=0){r.vx=0;r.vy=0;r.angle=0;}r.x+=r.vx*dt;r.y+=r.vy*dt;if(r.y>1)r.liftedOff=true;r.distance+=Math.hypot(r.vx,r.vy)*dt;r.maxAlt=Math.max(r.maxAlt,r.y);if(r.y<0)r.y=0;
}
function landing(r,p,pad,surface){let speed=Math.abs(r.vy),limit=13+p.upgrades.legs*3,target=surface?.normal<0?Math.PI:0,angle=Math.abs(Math.atan2(Math.sin(r.angle-target),Math.cos(r.angle-target)));return {safe:r.hp>0&&speed<=limit&&Math.abs(r.vx)<18+p.upgrades.legs*2&&angle<.32+p.upgrades.legs*.035,perfect:speed<6&&Math.abs(r.vx)<6&&angle<.14,pad};}
function rebuildCost(p){return Math.round(Math.min(250,45+Object.values(p.upgrades).reduce((a,b)=>a+b,0)*8)*(1-p.base*.1));}
const api={turnRate,airDrag,collisionDamage,gateImpulse,contractFuelBonus,UPGRADES,MODES,ERAS,SPACE_HEIGHT,ROUTE_BODIES,marsUnlocked,routeTarget,surfaceAt,surfaceCrossing,bodyGravity,thrustPower,totalFuel,fuelReserve,gravityAt,speedLimit,descentLimit,flightReward,upgradeLimit,atmosphereAt,fuelRate,fresh,price,purchase,upgradeBase,rocket,step,landing,rebuildCost};if(typeof module!=='undefined')module.exports=api;else root.RocketEngine=api;
})(typeof window!=='undefined'?window:globalThis);

