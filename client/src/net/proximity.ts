// Must match server/src/constants.ts. The server remains authoritative for
// membership; the client uses this only for spatial-audio attenuation.
export const PROXIMITY = {
  voiceRadius: 22,
} as const;
