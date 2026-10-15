/* Deterministic Canvas smoke check and contact sheets, independent of a browser. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createCanvas,Image}=require('@napi-rs/canvas');
const root=path.join(__dirname,'dist'),out=path.resolve(__dirname,'../../work/world');fs.mkdirSync(out,{recursive:true});
class LocalImage extends Image{set src(v){this.loaded=new Promise((resolve,reject)=>{this.onload=resolve;this.onerror=reject;});super.src=fs.readFileSync(path.join(root,v));}get naturalWidth(){return this.width;}get naturalHeight(){return this.height;}async decode(){await this.loaded;if(!this.width)throw Error('Empty image');}}
const env={Image:LocalImage,console,fetch:async p=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))})};env.window=env;vm.createContext(env);vm.runInContext(fs.readFileSync(path.join(root,'world-sprites.js'),'utf8'),env);
(async()=>{await env.WorldSprites.ready;const A=env.WorldSprites;assert(A.state.ready,JSON.stringify(A.state));assert(Object.keys(A.manifest.sprites).length>=110);
 for(const [name,m] of Object.entries(A.manifest.sprites)){assert(m.width>4&&m.height>4,name);assert(m.anchor.every(n=>n>=0&&n<=1),name);}
 for(const time of [0,.28,.56,.84]){
  const canvas=createCanvas(1440,1000),c=canvas.getContext('2d');c.fillStyle='#17374e';c.fillRect(0,0,1440,1000);
  for(let era=0;era<6;era++){const x=120+era*240;c.fillStyle='#dfe7df';c.font='18px sans-serif';c.fillText(String(A.years[era]),x-25,25);
   c.save();c.translate(x,245);c.scale(2,2);A.body(c,{era,stageId:'booster',time,thrust:true});c.restore();
   c.save();c.translate(x,325);A.parachute(c,era,time);A.body(c,{era,stageId:'capsule',time});c.restore();
   ['coin','ring','fuel','repair','magnet'].forEach((kind,i)=>A.item(c,kind,x,370+i*65,1,era,time));
   for(const [i,kind] of ['balloon','satellite','rock'].entries()){c.save();c.translate(x,755+i*90);A.hazard(c,{kind,variant:era,phase:0},era,time,1);c.restore();}
  }fs.writeFileSync(path.join(out,'contact-'+time+'.png'),canvas.toBuffer('image/png'));
 }
 console.log('World sprite manifest, anchors and four deterministic Canvas renders passed:',A.qa());
})().catch(e=>{console.error(e);process.exitCode=1;});
