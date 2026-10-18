import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base=process.env.BENCH_URL??'http://127.0.0.1:4173';
const sampleMs=Math.max(6000,Number(process.env.BENCH_SAMPLE_MS??6000));
const tabs=await fetch('http://127.0.0.1:9222/json').then(r=>r.json());
const tab=tabs.find(t=>t.type==='page'&&!t.url.startsWith('edge:'));
if(!tab)throw new Error('Launch an isolated Edge/Chrome on --remote-debugging-port=9222 first');
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const pending=new Map(),errors=[],failed=[],ignoredRequests=[],samples=[];
ws.onmessage=({data})=>{
  const m=JSON.parse(data);
  if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
  if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'&&!m.params.entry.url?.endsWith('/favicon.ico'))errors.push(m.params.entry);
  if(m.method==='Network.responseReceived'&&m.params.response.status>=400){
    const response={url:m.params.response.url,status:m.params.response.status};
    (response.url.endsWith('/favicon.ico')?ignoredRequests:failed).push(response);
  }
};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profiles=[
  {name:'High 720p',quality:2,width:1280,height:720},
  {name:'Medium 720p',quality:1,width:1280,height:720},
  {name:'Low 720p',quality:0,width:1280,height:720},
  {name:'High 1080p',quality:2,width:1920,height:1080},
];
const locations=['Village','North Woods','Pine Grove'];
let hardware,coldLoadMs;
async function settle(){
  const start=Date.now();let last='',stable=0;
  while(Date.now()-start<30000){
    const state=await evaluate(`(()=>{const m=window.environmentPreview.map;return {count:m.streaming.activeSections,pending:m.streaming.pendingSections,propsPending:[...m.regional.sections.values()].some(s=>!s.ready)};})()`);
    const key=JSON.stringify(state);stable=key===last?stable+1:0;last=key;
    if(Date.now()-start>7000&&stable>=4&&state.pending===0&&!state.propsPending)return Date.now()-start;
    await pause(250);
  }
  throw new Error('Streaming failed to settle');
}
async function measure(profile,place,cycle=0){
  await send('Emulation.setDeviceMetricsOverride',{width:profile.width,height:profile.height,deviceScaleFactor:1,mobile:false});
  await evaluate(`window.environmentPreview.configure(${profile.quality},1);window.environmentPreview.visit(${place.x},${place.z});`);
  const settleMs=await settle();
  const result=await evaluate(`new Promise(resolve=>{
    const frames=[],cpu=[];let first,previous;
    const tick=now=>{
      if(previous!==undefined){frames.push(now-previous);cpu.push(window.environmentPreview.frameWorkMs);}
      previous=now;first??=now;
      if(now-first<${sampleMs}){requestAnimationFrame(tick);return;}
      const sum=frames.reduce((a,b)=>a+b,0),sorted=[...frames].sort((a,b)=>a-b),p=n=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*n))];
      const {map,renderer}=window.environmentPreview;let forestTrees=0;
      map.regional.group.traverse(o=>{if(o.isInstancedMesh&&o.visible&&/^forest_(oak|pine|birch)$/.test(o.userData.detail?.asset))forestTrees+=o.count;});
      resolve({frames:frames.length,seconds:sum/1000,fps:frames.length*1000/sum,p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99),over33ms:frames.filter(ms=>ms>33.34).length/frames.length*100,cpuSubmissionMeanMs:cpu.reduce((a,b)=>a+b,0)/cpu.length,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,sections:map.streaming.activeSections,templates:map.regional.templateCount,instances:map.regional.instanceCount,forestTrees,canvas:[renderer.domElement.width,renderer.domElement.height]});
    };requestAnimationFrame(tick);
  })`);
  await send('HeapProfiler.collectGarbage');
  const metrics=await send('Performance.getMetrics');
  result.jsHeapMB=(metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value??0)/1048576;
  const sample={profile:profile.name,place:place.name,cycle,settleMs,...result};samples.push(sample);console.log(JSON.stringify(sample));
  if(result.sections>[64,96,128][profile.quality])throw new Error('Section residency budget exceeded');
  if(place.name!=='Village'&&result.forestTrees<25)throw new Error('Forest asset loading failure');
}
try{
  await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Performance.enable');
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  const started=Date.now();await send('Page.navigate',{url:base+'/environment-preview.html'});
  let ready=false;for(let i=0;i<240;i++){ready=await evaluate('Boolean(window.environmentPreview)');if(ready)break;await pause(250);}
  if(!ready)throw new Error('Preview did not initialize: '+JSON.stringify({errors,failed}));
  coldLoadMs=Date.now()-started;
  hardware=await evaluate(`(()=>{const gl=window.environmentPreview.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):'unavailable',hardwareConcurrency:navigator.hardwareConcurrency};})()`);
  console.log('Hardware:',JSON.stringify(hardware),'Cold ready ms:',coldLoadMs);
  await send('Network.setCacheDisabled',{cacheDisabled:false});
  const places=await evaluate('window.environmentPreview.places');
  for(const profile of profiles)for(const name of locations)await measure(profile,places.find(p=>p.name===name));
  // Compare like-for-like states after warm-up, not heaps from different regions/profiles.
  for(let cycle=1;cycle<=2;cycle++)for(const name of locations)await measure(profiles[0],places.find(p=>p.name===name),cycle);
}finally{
  const directory=new URL('../../docs/validation/',import.meta.url);await mkdir(directory,{recursive:true});
  const path=new URL('forest-performance.json',directory);
  await writeFile(path,JSON.stringify({date:new Date().toISOString(),base,method:`Headless Edge, production preview, static camera, ${sampleMs/1000}-second samples after streaming settles. CPU timing measures submission, not GPU completion.`,hardware,coldLoadMs,errors,failed,ignoredRequests,samples},null,2));
  console.log('Report:',fileURLToPath(path));
  await send('Page.navigate',{url:'about:blank'}).catch(()=>{});ws.close();
}
if(errors.length||failed.length)process.exitCode=1;
