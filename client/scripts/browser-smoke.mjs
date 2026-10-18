// Requires a separate Edge/Chrome process on --remote-debugging-port=9222.
// Run against a local client/server only. Uses Node's built-in WebSocket.
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tabs=await fetch('http://127.0.0.1:9222/json').then(r=>r.json());
const tab=tabs.find(t=>t.type==='page' && !t.url.startsWith('edge:') && (!process.env.TARGET_ID||t.id===process.env.TARGET_ID));
if (!tab) throw new Error('No test browser tab');
const ws=new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve,reject)=> { ws.onopen=resolve; ws.onerror=reject; });
let next=0;
const pending=new Map();
const errors=[], failedRequests=[];
ws.onmessage=({data})=> {
  const message=JSON.parse(data);
  if (message.id) {
    const request=pending.get(message.id); pending.delete(message.id);
    if (message.error) request?.reject(message.error); else request?.resolve(message.result);
  }
  if (message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.method==='Network.responseReceived' && message.params.response.status>=400) failedRequests.push({url:message.params.response.url,status:message.params.response.status});
  if (message.method==='Network.loadingFailed' && !message.params.canceled) failedRequests.push(message.params);
};
const send=(method,params={})=>new Promise((resolve,reject)=> {
  const id=++next; pending.set(id,{resolve,reject}); ws.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=> {
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression,timeout=60000) {
  const end=Date.now()+timeout;
  while (Date.now()<end) { if (await evaluate(expression)) return; await pause(250); }
  throw new Error(`Timed out: ${expression}. Page: ${await evaluate('document.body.innerText')}`);
}
async function screenshot(label) {
  const {data}=await send('Page.captureScreenshot',{format:'png'});
  const path=join(tmpdir(),`hangout-${label}.png`); await writeFile(path,Buffer.from(data,'base64')); console.log('Screenshot:',path);
}
async function sample(label) {
  await pause(2200);
  const result=await evaluate(`({stats:document.querySelector('#world-hud details small')?.textContent, chunks:performance.getEntriesByType('resource').filter(r=>r.name.includes('/models/chunks/')&&r.name.endsWith('.glb')).length, regionalAssets:[...new Set(performance.getEntriesByType('resource').filter(r=>r.name.includes('/environment-expansion/')&&r.name.endsWith('.glb')).map(r=>new URL(r.name).pathname.split('/').pop()))].sort(), canvas:[document.querySelector('canvas')?.width,document.querySelector('canvas')?.height]})`);
  console.log(label,result);
  return result;
}
try {
  await send('Runtime.enable'); await send('Network.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:Number(process.env.TEST_DPR??1),mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5173'});
  await until("Boolean(document.querySelector('#join-name'))");
  await evaluate("document.querySelector('#join-name').value='PerfCheck'; document.querySelector('#join-btn').click()");
  await until("!document.querySelector('#join-screen') && Boolean(document.querySelector('#world-hud'))");
  await evaluate("document.querySelector('#world-hud details').open=true; const checkbox=document.querySelector('#world-hud input'); checkbox.checked=true; checkbox.dispatchEvent(new Event('change'));");
  const spawn=await sample('spawn');
  if(!spawn.regionalAssets.length)throw new Error('Playable game did not request regional prop GLBs at spawn');
  await screenshot('spawn');
  for (const preset of ['0','1','2','auto']) {
    await evaluate(`{ const select=document.querySelector('#world-hud select'); select.value='${preset}'; select.dispatchEvent(new Event('change')); select.blur(); }`);
    await sample('quality '+preset);
    if (preset!=='auto') {
      const expected=1280*Math.min(Number(process.env.TEST_DPR??1),[1,1.5,2][Number(preset)]);
      const actual=await evaluate("document.querySelector('canvas').width");
      if (actual!==expected) throw new Error(`Quality ${preset}: canvas width ${actual}, expected ${expected}`);
    }
  }
  // Real keyboard events exercise movement, collision and background section requests.
  for (const [key,code,virtualKey] of [['w','KeyW',87],['d','KeyD',68],['s','KeyS',83]]) {
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtualKey});
    await pause(6500);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtualKey});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16});
    await sample('movement '+key);
    await screenshot('movement-'+key);
  }
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await pause(180);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
  await sample('after jump'); await screenshot('travel');
  console.log(JSON.stringify({errors,failedRequests},null,2));
  if (errors.length || failedRequests.some(r=>!r.url?.endsWith('/favicon.ico'))) process.exitCode=1;
} finally {
  // Leave the room; don't retain a test player in the running local server.
  await send('Page.navigate',{url:'about:blank'}).catch(()=>{});
  ws.close();
}
