/* Canonical deterministic placement for every purchasable base expansion on the start island. */
(function(root){
'use strict';
const DEFAULT_LAYOUT={
 beacons:'padL1',gantry:'padR1',service:'padL2',deluge:'padR2',
 fuel:'apronL1',rescue:'apronR1',logistics:'apronL2',
 weather:'perL1',radar:'perR1',control:'perL2',observation:'perR2',
 recovery:'remoteL1',energy:'remoteR1',factory:'remoteL2'
};
const ZONES={
 pad:{name:'Стартовое ядро',purpose:'старт, посадка и обслуживание ракеты'},
 apron:{name:'Техническая зона',purpose:'топливо, ремонт и логистика'},
 perimeter:{name:'Командный периметр',purpose:'погода, радар, управление и наблюдение'},
 remote:{name:'Дальний сектор',purpose:'возврат, энергетика и производство'}
};
let last='';
function apply(){let bi=root.BaseInfrastructure,g=root.Game;if(!bi||!g?.profile)return false;let st=bi.state?.();if(!st)return false;let sig=(st.owned||[]).slice().sort().join('|');if(sig===last)return false;last=sig;let changed=false;for(const id of st.owned||[]){let slot=DEFAULT_LAYOUT[id];if(slot&&st.layout[id]!==slot){st.layout[id]=slot;changed=true;}}if(changed)g.save?.();return changed;}
function validate(){let bi=root.BaseInfrastructure;if(!bi)return {ok:false,reason:'infrastructure not ready'};let ids=new Set(bi.definitions.map(d=>d.id)),slots=new Map(bi.slots.map(s=>[s.id,s])),used=new Set(),errors=[];for(const [id,sid] of Object.entries(DEFAULT_LAYOUT)){if(!ids.has(id))errors.push('unknown '+id);let s=slots.get(sid),d=bi.definitions.find(x=>x.id===id);if(!s)errors.push('missing slot '+sid);else if(d&&!d.zone.includes(s.zone))errors.push(id+' incompatible with '+sid);if(used.has(sid))errors.push('duplicate slot '+sid);used.add(sid);}for(const id of ids)if(!DEFAULT_LAYOUT[id])errors.push('unmapped '+id);return {ok:!errors.length,errors,count:Object.keys(DEFAULT_LAYOUT).length};}
function previewAll(){let bi=root.BaseInfrastructure,g=root.Game;if(!bi||!g?.profile)return false;let st=bi.state();st.owned=bi.definitions.map(d=>d.id);st.layout={...DEFAULT_LAYOUT};g.save?.();last='';return true;}
function loop(){apply();setTimeout(loop,350);}setTimeout(loop,0);
root.BaseIslandLayout={version:1,defaults:DEFAULT_LAYOUT,zones:ZONES,apply,validate,previewAll};
})(window);
