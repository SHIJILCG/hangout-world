/** Fixed shore positions shared by rendering and authoritative interactions. */
export const FISHING_SPOTS = [
  {id:'pond-south',x:26,z:-17,waterX:26,waterZ:-20},
  {id:'pond-east',x:34,z:-23,waterX:30,waterZ:-23},
  {id:'pond-north',x:27,z:-29,waterX:27,waterZ:-25},
] as const;
export const FISHING = {range:2.2,releaseRange:3,biteWindowMs:3000,minWaitMs:4000,maxWaitMs:8000} as const;
