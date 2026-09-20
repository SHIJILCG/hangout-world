export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function urls(value: string | undefined): string[] {
  return value?.split(',').map((url) => url.trim()).filter(Boolean) ?? [];
}

/** TURN secrets remain server configuration; they are only delivered to joined peers. */
export function iceServersFromEnv(env: NodeJS.ProcessEnv = process.env, sessionId?: string): IceServerConfig[] {
  const stun = urls(env.WEBRTC_STUN_URLS);
  const turn = urls(env.WEBRTC_TURN_URLS);
  const servers: IceServerConfig[] = [{ urls: stun.length ? stun : ['stun:stun.l.google.com:19302'] }];
  if (turn.length && env.WEBRTC_TURN_SHARED_SECRET && sessionId) {
    // coturn's REST API format: expiry timestamp + opaque username, signed by
    // the shared secret. Browsers receive only this short-lived credential.
    const username = `${Math.floor(Date.now() / 1000) + 3600}:${sessionId}`;
    const credential = createHmac('sha1', env.WEBRTC_TURN_SHARED_SECRET).update(username).digest('base64');
    servers.push({ urls: turn, username, credential });
  } else if (turn.length && env.WEBRTC_TURN_USERNAME && env.WEBRTC_TURN_CREDENTIAL) {
    servers.push({ urls: turn, username: env.WEBRTC_TURN_USERNAME, credential: env.WEBRTC_TURN_CREDENTIAL });
  }
  return servers;
}
import { createHmac } from 'node:crypto';
