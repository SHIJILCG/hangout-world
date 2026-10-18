import layout from './vehicle-routes.json' with { type: 'json' };
export { layout as vehicleRoutes };
export function vehicleRouteDistance(x,z) {
  let best=Infinity;
  for(const points of layout.routes) for(let i=1;i<points.length;i++) {
    const [ax,az]=points[i-1],[bx,bz]=points[i],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    best=Math.min(best,Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  for(const [px,pz] of layout.turnarounds)best=Math.min(best,Math.hypot(x-px,z-pz)-2);
  return best;
}
export function bridgeSurface(v) {
  const b=layout.bridge;
  return b.deckHeight*Math.max(0,Math.min(1,(b.approachEnd-Math.abs(v))/(b.approachEnd-b.halfLength)));
}
