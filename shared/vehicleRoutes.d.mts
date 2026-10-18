export const vehicleRoutes: {
  halfWidth:number;clearance:number;routes:number[][][];turnarounds:number[][];
  bridge:{center:number;halfWidth:number;halfLength:number;approachEnd:number;deckHeight:number};
};
export function vehicleRouteDistance(x:number,z:number):number;
export function bridgeSurface(v:number):number;
