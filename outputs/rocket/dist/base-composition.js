/* Canonical starter-island composition for a fully upgraded Earth base.
 * Objects stay independent runtime placeables; nothing is baked into the island art.
 */
'use strict';
(()=>{
const VERSION=2;
const G=()=>window.Game,B=()=>window.BaseInfrastructure;

/* Home-screen anchors, measured around the launch-pad center at (480,468).
 * The island itself is registered so its measured HD pad center maps to that point.
 */
const SLOT_POSITIONS={
 padL1:[410,456], padR1:[550,456], padL2:[392,412], padR2:[568,412],
 apronL1:[306,444], apronR1:[654,444], apronL2:[322,366], apronR2:[676,366],
 perL1:[266,408], perR1:[762,414], perL2:[356,302], perR2:[734,306],
 remoteL1:[296,336], remoteR1:[838,380], remoteL2:[470,258], remoteR2:[820,278]
};

/* Functional composition:
 * - launch support hugs the pad without covering the rocket;
 * - rescue/recovery use the left service road;
 * - fuel/logistics/factory form an industrial sector on the right;
 * - weather/control/radar sit farther back;
 * - observation gets the high central sightline;
 * - energy sits remotely next to the industrial/information cluster.
 */
const PREFERRED_LAYOUT={
 beacons:'padL1', gantry:'padL2', deluge:'padR1', service:'padR2',
 rescue:'apronL1', recovery:'apronL2', fuel:'apronR1', logistics:'apronR2',
 weather:'perL2', radar:'perR1', control:'perR2', observation:'remoteL2',
 factory:'remoteR1', energy:'remoteR2'
};

let initialized=false,knownOwned=new Set();

function applySlotGeometry(){
 const b=B();if(!b?.slots)return false;
 for(const slot of b.slots){const p=SLOT_POSITIONS[slot.id];if(p){slot.x=p[0];slot.y=p[1];}}
 return true;
}
function preferredSlotFree(st,id,slotId){
 return !Object.entries(st.layout||{}).some(([other,sid])=>other!==id&&sid===slotId);
}
function migrate(){
 const b=B(),g=G();if(!b||!g)return false;
 applySlotGeometry();
 const st=b.state?.();if(!st)return false;
 let changed=false;
 if((Number(st.layoutVersion)||0)<VERSION){
  const next={...st.layout};
  const used=new Set(Object.entries(next).filter(([id])=>!PREFERRED_LAYOUT[id]).map(([,sid])=>sid));
  for(const id of st.owned||[]){
   const sid=PREFERRED_LAYOUT[id];
   if(sid&&!used.has(sid)){next[id]=sid;used.add(sid);}
  }
  st.layout=next;st.layoutVersion=VERSION;changed=true;
 }
 if(!initialized){knownOwned=new Set(st.owned||[]);initialized=true;}
 else{
  for(const id of st.owned||[]){
   if(knownOwned.has(id))continue;
   const sid=PREFERRED_LAYOUT[id];
   if(sid&&preferredSlotFree(st,id,sid)){st.layout[id]=sid;changed=true;}
  }
  knownOwned=new Set(st.owned||[]);
 }
 if(changed)g.save?.();
 return changed;
}
function tick(){migrate();requestAnimationFrame(tick);}

applySlotGeometry();migrate();requestAnimationFrame(tick);
window.BaseComposition={version:VERSION,slotPositions:SLOT_POSITIONS,preferredLayout:PREFERRED_LAYOUT,migrate};
})();