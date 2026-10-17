/* B01 Weather Complex causal rig controller.
 * ref2game: real subassemblies move; WORK is event-driven, never a decorative loop.
 */
'use strict';
(()=>{
const STATES=Object.freeze(['OFF','IDLE','NOTICE','WORK','FINISH','COOLDOWN']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt));
class WeatherComplexRigController{
 constructor(meta,era='e0_1978'){
  this.meta=meta;this.era=era;this.owned=true;this.state='IDLE';this.stateTime=0;
  this.sensorAngle=0;this.sensorFrom=0;this.vaneAngle=0;this.indicator='idle';this.selectedWindow=null;
 }
 setEra(era){if(!this.meta?.eras?.[era])throw new Error('Unknown B01 era '+era);this.era=era;this.sensorAngle=0;this.sensorFrom=0;this.vaneAngle=0;}
 setOwned(value){this.owned=!!value;this._enter(this.owned?'IDLE':'OFF');}
 _enter(state){if(!STATES.includes(state))throw new Error('Unknown B01 rig state '+state);this.sensorFrom=this.sensorAngle;this.state=state;this.stateTime=0;if(state==='OFF')this.indicator='off';else if(state==='IDLE')this.indicator='idle';else if(state==='NOTICE')this.indicator='notice';else if(state==='WORK')this.indicator='work';else if(state==='FINISH')this.indicator='confirm';else this.indicator='cooldown';}
 dispatch(event,payload={}){
  if(event==='power_off'){this.setOwned(false);return true;}
  if(event==='power_on'){this.setOwned(true);return true;}
  if(event==='era_changed'){this.setEra(payload.era);return true;}
  if(!this.owned)return false;
  if(event==='launch_prepare'&&(this.state==='IDLE'||this.state==='COOLDOWN')){this.selectedWindow=null;this._enter('NOTICE');return true;}
  if(event==='weather_window_selected'&&(this.state==='WORK'||this.state==='NOTICE')){this.selectedWindow=payload.index??0;this._enter('FINISH');return true;}
  if(event==='weather_preview_cancel'&&(this.state==='NOTICE'||this.state==='WORK')){this._enter('COOLDOWN');return true;}
  return false;
 }
 update(dt,env={}){
  dt=clamp(Number(dt)||0,0,.1);this.stateTime+=dt;
  const e=this.meta.eras[this.era],future=e.year>=2035,max=future?.08:.16;
  if(this.state==='OFF')this.sensorAngle=smooth(this.sensorAngle,0,12,dt);
  else if(this.state==='IDLE')this.sensorAngle=smooth(this.sensorAngle,0,10,dt);
  else if(this.state==='NOTICE'){
   const p=clamp(this.stateTime/.25,0,1);this.sensorAngle=this.sensorFrom+(-max-this.sensorFrom)*p;
   if(p>=1)this._enter('WORK');
  }else if(this.state==='WORK'){
   const p=clamp(this.stateTime/1.2,0,1);this.sensorAngle=-max+(max*2)*p;
  }else if(this.state==='FINISH'){
   const p=clamp(this.stateTime/.25,0,1);this.sensorAngle=this.sensorFrom*(1-p);
   if(p>=1)this._enter('COOLDOWN');
  }else if(this.state==='COOLDOWN'){
   this.sensorAngle=smooth(this.sensorAngle,0,10,dt);if(this.stateTime>=.6)this._enter('IDLE');
  }
  const hasVane=!!e.vane?.present;
  if(hasVane){const wind=clamp(Number(env.wind)||0,-1,1),target=wind*.22;this.vaneAngle=smooth(this.vaneAngle,target,7,dt);}else this.vaneAngle=0;
  return this.pose();
 }
 pose(){return{state:this.state,sensorAngle:this.sensorAngle,vaneAngle:this.vaneAngle,indicator:this.indicator,indicatorOn:this.indicator==='confirm'||this.indicator==='notice',selectedWindow:this.selectedWindow};}
}
window.WeatherComplexRigController=WeatherComplexRigController;
window.B01_RIG_STATES=STATES;
})();
