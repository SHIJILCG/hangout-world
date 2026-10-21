// Run with the dev client on 5173, server on 2567 and isolated Chrome CDP on 9234.
import {writeFile} from 'node:fs/promises';
const tab=(await fetch('http://127.0.0.1:9234/json').then(r=>r.json())).find(t=>t.type==='page');
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let serial=0;const pending=new Map(),errors=[];
ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.delete(id))reject(Error(method+' timeout'));},60000).unref();});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(expression,timeout=15000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(expression))return;await pause(100);}throw Error('Timed out: '+expression);}
const assert=(condition,message)=>{if(!condition)throw Error(message);};
let result;
try{
  await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:5173/environment-preview.html'});await until('!!window.environmentPreview',45000);
  await evaluate(`(async()=>{
    const {joinWorld}=await import('/src/net/connection.ts'),{Fishing}=await import('/src/player/fishing.ts'),{RemotePlayers}=await import('/src/net/remotePlayers.ts');
    const p=window.environmentPreview,rooms=[await joinWorld('FishingCheckA',0),await joinWorld('FishingCheckB',1)],messages=[];
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(const room of rooms){room.onMessage('fishing-result',m=>messages.push({id:room.sessionId,...m}));while(!room.state.players?.get(room.sessionId))await wait(20);}
    const hud=document.createElement('aside');hud.id='world-hud';hud.style.cssText='position:fixed;bottom:20px;left:20px;background:#203d35;color:white;padding:16px;z-index:10';document.body.append(hud);
    const abort=new AbortController(),fishing=new Fishing(p.map.collision,()=>rooms[0],()=>true,hud,abort.signal);fishing.bind(rooms[0]);p.map.group.add(fishing.group);
    const avatars=new RemotePlayers();p.map.group.add(avatars.group);for(const room of rooms)avatars.add(room.sessionId,room.state.players.get(room.sessionId));
    await Promise.all(rooms.map(room=>avatars.getRoot(room.sessionId).userData.avatarLoad));
    let last=performance.now(),stopped=false,showProps=true;
    const tick=now=>{if(stopped)return;const dt=Math.min(.1,(now-last)/1000);last=now;const me=rooms[0].state.players.get(rooms[0].sessionId);fishing.render(me,true,now);fishing.group.visible&&=showProps;
      for(const room of rooms){const player=rooms[0].state.players.get(room.sessionId);if(player)avatars.updateTarget(room.sessionId,player);}avatars.tick(dt,me.x,me.z);requestAnimationFrame(tick);};requestAnimationFrame(tick);
    async function walk(room,x,z){const start=room.state.players.get(room.sessionId),sx=start.x,sz=start.z,n=Math.ceil(Math.hypot(x-sx,z-sz)/.25);for(let i=1;i<=n;i++){const px=sx+(x-sx)*i/n,pz=sz+(z-sz)*i/n;room.send('move',{x:px,z:pz,y:p.map.collision.groundAt(px,pz),heading:Math.PI});await wait(70);}await wait(300);}
    window.fishCheck={rooms,fishing,messages,walk,setVisible:v=>showProps=v,close:async()=>{stopped=true;abort.abort();fishing.dispose();avatars.clear();await Promise.all(rooms.map(r=>r.leave()));}};
    await Promise.all(rooms.map((r,i)=>walk(r,26+i*.7,-17)));p.visit(26,-17);p.configure(2,1);
  })()`);
  await pause(5000);
  assert(await evaluate(`!document.querySelector('#fishing-controls').hidden`),'Fishing controls absent at shore');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'f',code:'KeyF',windowsVirtualKeyCode:70});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'f',code:'KeyF',windowsVirtualKeyCode:70});
  await until(`fishCheck.rooms.every(r=>r.state.fishing.get('pond-south').occupant===fishCheck.rooms[0].sessionId)`);
  await evaluate(`fishCheck.rooms[1].send('fishing-action',{action:'cast',spotId:'pond-south'})`);
  await until(`fishCheck.messages.some(m=>m.text.includes('occupied'))`);
  await until(`fishCheck.rooms.every(r=>r.state.fishing.get('pond-south').phase==='bite')`);
  assert(await evaluate(`document.querySelector('#fishing-controls').textContent.includes('Reel in!')`),'Bite UI absent');
  const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(new URL('../../docs/validation/fishing-bite.png',import.meta.url),Buffer.from(shot.data,'base64'));
  await evaluate(`document.querySelector('#fishing-controls button').click()`);
  await until(`fishCheck.rooms.every(r=>r.state.players.get(fishCheck.rooms[0].sessionId).fishCaught===1)`);
  await pause(550);await evaluate(`document.querySelector('#fishing-controls button').click()`);
  await until(`fishCheck.rooms[0].state.fishing.get('pond-south').phase==='waiting'`);
  await evaluate(`document.querySelectorAll('#fishing-controls button')[1].click()`);await pause(550);
  // Pending debounce protects a just-sent action, so retry after its acknowledgement.
  await evaluate(`document.querySelectorAll('#fishing-controls button')[1].click()`);
  await until(`fishCheck.rooms.every(r=>r.state.fishing.get('pond-south').occupant==='')`);
  await pause(550);await evaluate(`document.querySelector('#fishing-controls button').click()`);
  await until(`fishCheck.rooms[0].state.fishing.get('pond-south').phase==='waiting'`);
  await evaluate(`fishCheck.walk(fishCheck.rooms[0],30,-16)`);await until(`fishCheck.rooms.every(r=>r.state.fishing.get('pond-south').occupant==='')`);
  const sample=async visible=>{await evaluate(`fishCheck.setVisible(${visible})`);await pause(500);return evaluate(`new Promise(resolve=>{const frames=[];let last,start;const tick=now=>{if(last!==undefined)frames.push(now-last);last=now;start??=now;if(now-start<5000){requestAnimationFrame(tick);return;}const p=environmentPreview;resolve({fps:1000*frames.length/frames.reduce((a,b)=>a+b,0),meanMs:frames.reduce((a,b)=>a+b,0)/frames.length,draws:p.renderer.info.render.calls,triangles:p.renderer.info.render.triangles});};requestAnimationFrame(tick);})`);};
  const hidden=await sample(false),visible=await sample(true);
  result=await evaluate(`({players:fishCheck.rooms[0].state.players.size,catches:fishCheck.rooms[0].state.players.get(fishCheck.rooms[0].sessionId).fishCaught,messages:fishCheck.messages})`);
  Object.assign(result,{hidden,visible,checks:['F casts','exclusive shared occupancy','bite replicated to both peers','bite UI','click reels and catch replicates','cancel frees spot','walking away frees spot'],method:'Dev environment preview using production Fishing component, two real clients with rate-limited scripted movement. Five-second hidden/visible samples are a rendering smoke check, not a full performance benchmark.',errors});
  assert(errors.length===0,'Browser exceptions');console.log(JSON.stringify(result,null,2));
  await writeFile(new URL('../../docs/validation/fishing-browser.json',import.meta.url),JSON.stringify(result,null,2));
}finally{await evaluate('window.fishCheck?.close()').catch(()=>{});await send('Page.navigate',{url:'about:blank'}).catch(()=>{});ws.close();}
