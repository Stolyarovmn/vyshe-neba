/* Собирает полностью автономную игру. Нужен только Node.js, без пакетов. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'dist'),out=path.resolve(__dirname,'..','Выше неба.html');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(root,'style.css'),'utf8')+'</style>');
const assets={};for(let f of fs.readdirSync(path.join(root,'assets'))){if(f.endsWith('.png'))assets[f]='data:image/png;base64,'+fs.readFileSync(path.join(root,'assets',f)).toString('base64');}
html=html.replace('<script src="engine.js"></script>',()=>'<script>window.__GAME_ASSETS__='+JSON.stringify(assets)+';</script><script src="engine.js"></script>');
for(let f of ['engine.js','journey.js','world-art.js','content.js','audio.js','vehicle-art.js','game.js']){let js=fs.readFileSync(path.join(root,f),'utf8');new vm.Script(js,{filename:f});html=html.replace('<script src="'+f+'"></script>',()=>'<script>'+js.replace(/<\/script/gi,'<\\/script')+'</script>');}
fs.writeFileSync(out,html);process.stdout.write('Автономная игра собрана: '+out+'\n');
