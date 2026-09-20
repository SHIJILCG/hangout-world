import { describe, expect, it } from 'vitest';
import { distanceBetween, isNearby, nearbyPlayerIds } from '../src/proximity';
import { PROXIMITY } from '../src/constants';
import { iceServersFromEnv } from '../src/voiceConfig';

describe('proximity', () => {
  it('uses horizontal world distance and includes only players in radius', () => {
    const players = new Map([
      ['a', { x: 0, z: 0 }], ['b', { x: 10, z: 0 }], ['c', { x: 25, z: 0 }],
    ]);
    expect(distanceBetween(players.get('a')!, players.get('b')!)).toBe(10);
    expect(isNearby(players.get('a')!, players.get('b')!, PROXIMITY.chatRadius)).toBe(true);
    expect(nearbyPlayerIds(players.entries(), 'a', PROXIMITY.chatRadius)).toEqual(['b']);
  });
});

describe('WebRTC ICE configuration', () => {
  it('uses STUN alone when TURN is absent', () => {
    expect(iceServersFromEnv({ WEBRTC_STUN_URLS: 'stun:local.test:3478' })).toEqual([{ urls: ['stun:local.test:3478'] }]);
  });

  it('adds TURN after STUN only with complete credentials', () => {
    expect(iceServersFromEnv({
      WEBRTC_STUN_URLS: 'stun:local.test:3478', WEBRTC_TURN_URLS: 'turn:relay.test:3478',
      WEBRTC_TURN_USERNAME: 'user', WEBRTC_TURN_CREDENTIAL: 'secret',
    })).toEqual([
      { urls: ['stun:local.test:3478'] },
      { urls: ['turn:relay.test:3478'], username: 'user', credential: 'secret' },
    ]);
  });

  it('mints a short-lived coturn REST credential when a shared secret is configured', () => {
    const servers = iceServersFromEnv({ WEBRTC_TURN_URLS: 'turn:relay.test:3478', WEBRTC_TURN_SHARED_SECRET: 'secret' }, 'session-a');
    expect(servers[1]).toMatchObject({ urls: ['turn:relay.test:3478'] });
    expect(servers[1].username).toMatch(/^\d+:session-a$/);
    expect(servers[1].credential).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
