import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildMap } from './world/map';
import { createAtmosphere } from './world/atmosphere';
import world from '../../shared/world.json';

const map=await buildMap();
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0xd4e8da);scene.fog=new THREE.Fog(0xd4e8da,130,650);
scene.add(map.group,createAtmosphere());
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.1,1400);
const controls=new OrbitControls(camera,renderer.domElement);controls.maxPolarAngle=Math.PI/2-0.04;controls.maxDistance=100;
let x=0,z=8,quality=2,frameWorkMs=0;
const frameHooks=new Set<(now:number)=>void>();
function configure(nextQuality:number,pixelRatio=1){
  quality=Math.max(0,Math.min(2,Math.round(nextQuality)));renderer.setPixelRatio(pixelRatio);
  const shadowSize=quality===0?1024:2048;
  if(map.sun.shadow.mapSize.x!==shadowSize){map.sun.shadow.map?.dispose();map.sun.shadow.map=null;map.sun.shadow.mapSize.set(shadowSize,shadowSize);}
}
function visit(nx:number,nz:number){x=nx;z=nz;const y=map.collision.groundAt(x,z);controls.target.set(x,y+1,z);camera.position.set(x+18,y+16,z+24);controls.update();}
const layout=await fetch('/models/regions.json').then(r=>r.json());
const places=[{name:'Village',x:0,z:8},...layout.places];
for(const place of places){const b=document.createElement('button');b.textContent=place.name;b.onclick=()=>visit(place.x,place.z);document.querySelector('#places')!.append(b);}
visit(0,8);
let reportAt=0;
renderer.setAnimationLoop(()=>{
  const now=performance.now();map.update(x,map.collision.groundAt(x,z),z,now,quality);controls.update();for(const hook of frameHooks)hook(now);renderer.render(scene,camera);
  frameWorkMs=performance.now()-now; // CPU submission time; GPU work is asynchronous.
  if(now>reportAt){reportAt=now+500;document.querySelector('#status')!.textContent=`${world.half*2}m map · ${map.streaming.activeSections} sections · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles.toLocaleString()} triangles · ${map.regional.templateCount} regional assets`;}
});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);controls.dispose();map.dispose();renderer.dispose();},{once:true});
// The standalone preview supports automated travel without changing multiplayer movement.
Object.assign(window,{environmentPreview:{visit,places,map,renderer,configure,get frameWorkMs(){return frameWorkMs;}}});
// Opt-in validation harness, excluded from the playable game's entry point.
if(new URLSearchParams(location.search).has('grass-benchmark')) {
  const {attachGrassBenchmark}=await import('./benchmark/grassScene');
  const benchmark=await attachGrassBenchmark({scene,camera,controls,map,visit,frameHooks});
  Object.assign((window as unknown as {environmentPreview:object}).environmentPreview,{benchmark});
}
