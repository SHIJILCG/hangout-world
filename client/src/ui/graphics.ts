import type * as THREE from 'three';
import type { WorldMap } from '../world/map';

/** Quality controls and opt-in measurements; no telemetry is sent anywhere. */
export function createGraphics(renderer: THREE.WebGLRenderer, map: WorldMap, parent: HTMLElement) {
  const panel=document.createElement('details');
  panel.innerHTML='<summary>Graphics</summary><label>Quality <select aria-label="Graphics quality"><option value="auto">Auto</option><option value="0">Low</option><option value="1">Medium</option><option value="2">High</option></select></label><label style="display:block"><input type="checkbox"> Show performance</label><small hidden></small>';
  parent.append(panel);
  const select=panel.querySelector('select')!;
  const checkbox=panel.querySelector('input')!;
  const stats=panel.querySelector('small')!;
  let quality=1;
  let ratio=Math.min(window.devicePixelRatio,1.5);
  let frames: number[]=[];
  let lastReport=performance.now();
  let lastAdjustment=lastReport;
  let slowWindows=0, fastWindows=0;
  try { select.value=localStorage.getItem('meadow-quality')??'auto'; } catch { /* Storage may be disabled. */ }
  if (!['auto','0','1','2'].includes(select.value)) select.value='auto';
  function apply() {
    if (select.value!=='auto') {
      quality=Number(select.value);
      ratio=Math.min(window.devicePixelRatio,[1,1.5,2][quality]);
    }
    renderer.setPixelRatio(ratio);
    const size=quality===0?1024:2048;
    if (map.sun.shadow.mapSize.x!==size) {
      map.sun.shadow.map?.dispose(); map.sun.shadow.map=null;
      map.sun.shadow.mapSize.set(size,size);
    }
  }
  select.addEventListener('change',()=> {
    try { localStorage.setItem('meadow-quality',select.value); } catch { /* Optional preference. */ }
    if (select.value==='auto') {
      quality=1;
      ratio=Math.min(window.devicePixelRatio,1.5);
    }
    slowWindows=fastWindows=0; lastAdjustment=performance.now(); apply();
  });
  checkbox.addEventListener('change',()=> { stats.hidden=!checkbox.checked; });
  apply();
  return {
    get quality() { return quality; },
    resize() { ratio=Math.min(ratio,window.devicePixelRatio); apply(); },
    record(frameMs: number, now: number) {
      if (document.hidden || frameMs>250) { frames=[]; lastReport=now; return; }
      frames.push(frameMs);
      if (now-lastReport<1000) return;
      const sorted=[...frames].sort((a,b)=>a-b);
      const average=frames.reduce((sum,n)=>sum+n,0)/frames.length;
      const p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*0.95))];
      if (checkbox.checked) stats.textContent=`${Math.round(1000/average)} FPS · ${p95.toFixed(1)} ms p95 · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} triangles · DPR ${ratio.toFixed(2)} · sections ${map.streaming.activeSections} (+${map.streaming.pendingSections})`;
      if (select.value==='auto' && now-lastAdjustment>4000) {
        slowWindows=average>22?slowWindows+1:0;
        fastWindows=average<17?fastWindows+1:0;
        if (slowWindows>=2 || fastWindows>=6) {
          const direction=slowWindows>=2?-1:1;
          ratio=Math.max(0.75,Math.min(window.devicePixelRatio,1.75,ratio+direction*0.25));
          quality=ratio<=1?0:ratio<=1.5?1:2;
          apply(); lastAdjustment=now; slowWindows=fastWindows=0;
        }
      }
      frames=[]; lastReport=now;
    },
    dispose() { panel.remove(); },
  };
}
