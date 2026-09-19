import { Client, type Room } from 'colyseus.js';

// Index positions must stay stable — the server stores only the index.
export const AVATAR_COLORS = [0x4f8ef7, 0xf25f5c, 0x59cd90, 0xffe066, 0x9b5de5, 0xf58a4b];

export function serverUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:2567`;
}

export function joinWorld(name: string, colorIndex: number): Promise<Room> {
  const client = new Client(serverUrl());
  return client.joinOrCreate('world', { name, colorIndex });
}
