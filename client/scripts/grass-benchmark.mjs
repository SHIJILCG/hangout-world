// Local production previews; isolated browser on CDP port 9234.
import { mkdir,writeFile } from 'node:fs/promises';
const before=process.env.BENCH_BEFORE_URL??'http://127.0.0.1:4175';
const after=process.env.BENCH_AFTER_URL;
const cycles=Number(process.env.BENCH_CYCLES??3),sampleMs=Number(process.env.BENCH_SAMPLE_MS??20000);
const quality=Number(process.env.BENCH_QUALITY??2);
const shotPrefix=process.env.BENCH_SHOT_PREFIX??'grass';
const places=process.env.BENCH_PLACES_JSON?JSON.parse(process.env.BENCH_PLACES_JSON):[{name:'Open meadow',x:-48,z:-55,yaw:0},{name:'Village',x:-10,z:17,yaw:.4},{name:'Riverbank',x:18,z:35,yaw:-.8},{name:'North Woods',x:-30,z:-160,yaw:.1}];
const tabs=await fetch('http://127.0.0.1:9234/json').then(r=>r.json());
const tab=tabs.find(t=>t.type==='page');if(!tab)throw Error('No benchmark browser');
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial=0;const requests=new Map(),samples=[],errors=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=requests.get(m.id);requests.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Network.responseReceived'&&m.params.response.status>=400&&!m.params.response.url.endsWith('/favicon.ico'))errors.push(m.params.response);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(requests.delete(id))reject(Error(method+' timeout'));},90000).unref();});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let hardware;
async function load(url){
  await send('Page.navigate',{url:url+'/environment-preview.html?grass-benchmark'});
  for(let i=0;i<240;i++){if(await evaluate('Boolean(window.environmentPreview?.benchmark)'))return;await pause(250);}
  throw Error('Benchmark scene failed to load');
}
async function measure(version,place,cycle){
  await evaluate(`window.environmentPreview.configure(${quality},1);window.environmentPreview.benchmark.visit(${place.x},${place.z},${place.yaw});`);
  let stable=0,last='',settled=false;const start=Date.now();
  while(Date.now()-start<45000){
    const state=await evaluate(`(()=>{const m=window.environmentPreview.map;return {sections:m.streaming.activeSections,pending:m.streaming.pendingSections,propsPending:[...m.regional.sections.values()].some(s=>!s.ready)};})()`);
    const key=JSON.stringify(state);stable=last===key?stable+1:0;last=key;
    if(Date.now()-start>7000&&stable>=4&&!state.pending&&!state.propsPending){settled=true;break;}await pause(250);
  }
  if(!settled)throw Error('Streaming did not settle');
  await send('HeapProfiler.collectGarbage');await pause(1000);
  const result=await evaluate(`new Promise(resolve=>{const frames=[],cpu=[],draws=[],triangles=[];let first,last;const tick=now=>{const p=window.environmentPreview;if(last!==undefined){frames.push(now-last);cpu.push(p.frameWorkMs);draws.push(p.renderer.info.render.calls);triangles.push(p.renderer.info.render.triangles);}first??=now;last=now;if(now-first<${sampleMs}){requestAnimationFrame(tick);return;}const total=frames.reduce((a,b)=>a+b,0),sorted=[...frames].sort((a,b)=>a-b),percentile=n=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*n))],mean=a=>a.reduce((s,v)=>s+v,0)/a.length;let grassInstances=0,grassDraws=0;const visit=(o,parentVisible)=>{const visible=parentVisible&&o.visible;if(o.isInstancedMesh&&visible&&(o.userData.detail?.asset==='grass'||o.name.includes('grass patches'))){grassInstances+=o.count;grassDraws++;}for(const child of o.children)visit(child,visible);};visit(p.map.group,true);resolve({fps:frames.length*1000/total,meanMs:mean(frames),p50Ms:percentile(.5),p95Ms:percentile(.95),p99Ms:percentile(.99),over33ms:frames.filter(v=>v>33.34).length/frames.length*100,cpuSubmissionMs:mean(cpu),draws:mean(draws),triangles:mean(triangles),geometries:p.renderer.info.memory.geometries,textures:p.renderer.info.memory.textures,sections:p.map.streaming.activeSections,regionalInstances:p.map.regional.instanceCount,grassInstances,grassDraws,network:p.benchmark.networkState(),frames:frames.length});};requestAnimationFrame(tick);})`);
  await send('HeapProfiler.collectGarbage');const metrics=await send('Performance.getMetrics');
  result.jsHeapMB=metrics.metrics.find(m=>m.name==='JSHeapUsedSize').value/1048576;
  const sample={version,place:place.name,cycle,quality,...result};samples.push(sample);console.log(JSON.stringify(sample));
  if(cycle===0){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(new URL(`../../docs/validation/${shotPrefix}-${version}-${place.name.replaceAll(' ','-').toLowerCase()}.png`,import.meta.url),Buffer.from(shot.data,'base64'));}
}
try{
  await mkdir(new URL('../../docs/validation/',import.meta.url),{recursive:true});
  await send('Runtime.enable');await send('Network.enable');await send('Performance.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  for(let cycle=0;cycle<cycles;cycle++){
    const versions=after?[['before',before],['after',after]]:[['before',before]];
    if(cycle%2)versions.reverse();
    for(const [version,url] of versions){
      await load(url);
      hardware??=await evaluate(`(()=>{const gl=window.environmentPreview.renderer.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return {userAgent:navigator.userAgent,gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown',threads:navigator.hardwareConcurrency};})()`);
      console.log('Run',version,cycle,JSON.stringify(hardware));
      for(const place of places)await measure(version,place,cycle);
      await send('Page.navigate',{url:'about:blank'});await pause(1000);
    }
  }
}finally{
  await writeFile(new URL('../../docs/validation/'+(process.env.BENCH_REPORT??'grass-performance.json'),import.meta.url),JSON.stringify({date:new Date().toISOString(),hardware,before,after,cycles,sampleMs,quality,places,method:'Headless Chrome; production environment preview; fixed player-height camera; three real Colyseus clients, their avatars rebased into each view; voice/chat and ride rendering excluded. Interleaved version order; same streaming warm-up. CPU submission excludes GPU completion. Geometry/texture counts are allocation proxies, not VRAM bytes.',errors,samples},null,2));
  await send('Page.navigate',{url:'about:blank'}).catch(()=>{});ws.close();
}
if(errors.length)process.exitCode=1;
