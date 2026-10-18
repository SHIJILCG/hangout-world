import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tabs=await fetch('http://127.0.0.1:9222/json').then(r=>r.json());
const tab=tabs.find(t=>t.type==='page'&&!t.url.startsWith('edge:'));
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[],failed=[];
ws.onmessage=({data})=>{
  const m=JSON.parse(data);
  if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
  if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry);
  if(m.method==='Network.loadingFailed')failed.push(m.params);
  if(m.method==='Network.responseReceived'&&m.params.response.status>=400)failed.push(m.params.response.url);
};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const cycles=Number(process.env.ROUTE_CYCLES??1),samples=[];
try{
  await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5173/environment-preview.html'});
  let ready=false;
  for(let attempt=0;attempt<240;attempt++){ready=await evaluate('Boolean(window.environmentPreview)');if(ready)break;await pause(250);}
  if(!ready)throw new Error('Preview failed to load: '+JSON.stringify({errors,failed,body:await evaluate('document.body.innerText')}));
  const places=await evaluate('window.environmentPreview.places');
  for(let cycle=0;cycle<cycles;cycle++)for(const place of places){
    await evaluate(`window.environmentPreview.visit(${place.x},${place.z})`);
    await pause(11000);
    const sample=await evaluate(`new Promise(resolve=>{
      const times=[];let previous=performance.now();
      const tick=now=>{times.push(now-previous);previous=now;if(times.length<90){requestAnimationFrame(tick);return;}
        const {map,renderer}=window.environmentPreview;times.sort((a,b)=>a-b);
        let forestTrees=0;map.regional.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&/^forest_(oak|pine|birch)$/.test(o.userData.detail?.asset))forestTrees+=o.count;});
        resolve({sections:map.streaming.activeSections,pending:map.streaming.pendingSections,templates:map.regional.templateCount,instances:map.regional.instanceCount,forestTrees,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometry:renderer.info.memory.geometries,p95:times[Math.floor(times.length*.95)]});};requestAnimationFrame(tick);
    })`);
    samples.push({cycle,place:place.name,...sample});console.log(samples.at(-1));
    if(sample.sections>128)throw new Error('Resident section limit exceeded');
    if(['North Woods','Pine Grove','Birch Copse'].includes(place.name)&&sample.forestTrees<25)throw new Error(`Forest models missing at ${place.name}`);
    if(cycle===cycles-1){const {data}=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(tmpdir(),`hangout-expansion-${place.name.replaceAll(' ','-')}.png`),Buffer.from(data,'base64'));}
  }
  console.log(JSON.stringify({errors,failed,samples},null,2));
  await writeFile(join(tmpdir(),'hangout-expansion-report.json'),JSON.stringify({errors,failed,samples},null,2));
  if(errors.length||failed.length)throw new Error('Browser errors or failed requests');
}finally{await send('Page.navigate',{url:'about:blank'}).catch(()=>{});ws.close();}
