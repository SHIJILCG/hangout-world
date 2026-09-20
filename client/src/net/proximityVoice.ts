export interface VoicePosition { x: number; z: number }
export interface IceServerConfig { urls: string | string[]; username?: string; credential?: string }

interface PeerEntry {
  connection: RTCPeerConnection;
  source?: MediaStreamAudioSourceNode;
  gain?: GainNode;
  analyser?: AnalyserNode;
  audio?: HTMLAudioElement;
  remoteTrack?: MediaStreamTrack;
  candidateTypes: Set<string>;
  pendingCandidates: RTCIceCandidateInit[];
  speaking: boolean;
}

export interface ProximityVoiceOptions {
  selfId: () => string;
  positionFor: (id: string) => VoicePosition | undefined;
  send: (type: string, message: unknown) => void;
  onStatus: (status: string) => void;
  onPeerStatus: (id: string, status: string) => void;
  onSpeaking: (id: string, speaking: boolean) => void;
  onSelfSpeaking: (speaking: boolean) => void;
}

export class ProximityVoice {
  private iceServers: IceServerConfig[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private stream?: MediaStream;
  private audioContext?: AudioContext;
  private peers = new Map<string, PeerEntry>();
  private nearby = new Set<string>();
  private mutedPeers = new Set<string>();
  private enabled = false;
  private muted = false;
  private incomingEnabled = true;
  private localAnalyser?: AnalyserNode;
  private localMeterGain?: GainNode;
  private selfSpeaking = false;
  private readonly handleDeviceChange = () => {
    if (this.enabled) this.options.onStatus('Microphone devices changed');
  };

  constructor(private options: ProximityVoiceOptions, private radius: number) {}

  setIceServers(iceServers: IceServerConfig[]): void {
    if (iceServers.length) this.iceServers = iceServers;
  }

  get isEnabled(): boolean { return this.enabled; }
  get isMuted(): boolean { return this.muted; }
  get isIncomingEnabled(): boolean { return this.incomingEnabled; }

  async enable(): Promise<void> {
    if (this.enabled) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection || !window.AudioContext) {
      this.options.onStatus('Voice unavailable in this browser');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.stream = stream;
      this.log('local', 'getUserMedia success', { tracks: stream.getAudioTracks().map(trackInfo) });
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localMeterGain = this.audioContext.createGain();
      this.localMeterGain.gain.value = 0;
      this.audioContext.createMediaStreamSource(stream).connect(this.localAnalyser).connect(this.localMeterGain).connect(this.audioContext.destination);
      stream.getAudioTracks().forEach((track) => {
        this.log('local', 'local audio track', trackInfo(track));
        track.addEventListener('ended', () => this.disable('Microphone permission was revoked'));
      });
      navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
      this.enabled = true;
      this.send('voice-ready', { enabled: true });
      this.options.onStatus('Voice on');
      for (const id of this.nearby) this.reconcile(id);
    } catch (error) {
      this.log('local', 'getUserMedia failure', error);
      this.releaseLocalMedia();
      const detail = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone permission denied' : 'Microphone unavailable';
      this.options.onStatus(detail);
    }
  }

  disable(status = 'Voice off'): void {
    if (this.enabled) this.send('voice-ready', { enabled: false });
    this.enabled = false;
    this.nearby.clear();
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.releaseLocalMedia();
    if (this.selfSpeaking) this.options.onSelfSpeaking(false);
    this.selfSpeaking = false;
    this.options.onStatus(status);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    this.options.onStatus(muted ? 'Muted' : 'Voice on');
  }

  setIncomingEnabled(enabled: boolean): void {
    this.incomingEnabled = enabled;
    this.updateAudio();
  }

  setPeerMuted(id: string, muted: boolean): void {
    if (muted) this.mutedPeers.add(id); else this.mutedPeers.delete(id);
    this.updateAudio();
  }

  setNearby(id: string, nearby: boolean): void {
    if (nearby) this.nearby.add(id); else this.nearby.delete(id);
    this.reconcile(id);
  }

  /** Keeps the granted microphone stream while dropping stale room peers. */
  resetConnections(): void {
    this.nearby.clear();
    for (const id of [...this.peers.keys()]) this.closePeer(id);
  }

  removePlayer(id: string): void {
    this.nearby.delete(id);
    this.mutedPeers.delete(id);
    this.closePeer(id);
  }

  async handleSignal(from: string, signal: unknown): Promise<void> {
    this.log(from, 'Colyseus signaling message received', { signal });
    if (!this.enabled || !this.nearby.has(from) || !isSignal(signal)) {
      this.log(from, 'signaling message ignored', {
        enabled: this.enabled, nearby: this.nearby.has(from), valid: isSignal(signal),
      });
      return;
    }
    const peer = this.ensurePeer(from);
    try {
      if (signal.kind === 'candidate') {
        peer.candidateTypes.add(candidateType(signal.candidate));
        this.log(from, 'remote ICE candidate discovered', { type: candidateType(signal.candidate), candidate: signal.candidate });
        if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(signal.candidate);
        else peer.pendingCandidates.push(signal.candidate);
        return;
      }
      this.log(from, `remote SDP ${signal.kind} received`, signal.description);
      await peer.connection.setRemoteDescription(signal.description);
      for (const candidate of peer.pendingCandidates.splice(0)) await peer.connection.addIceCandidate(candidate);
      if (signal.kind === 'offer') {
        const answer = await peer.connection.createAnswer();
        this.log(from, 'SDP answer created', answer);
        await peer.connection.setLocalDescription(answer);
        this.send('voice-signal', { to: from, signal: { kind: 'answer', description: peer.connection.localDescription } });
      }
    } catch (error) {
      this.log(from, 'signaling error', error);
      this.closePeer(from);
      this.options.onStatus('Voice connection failed');
    }
  }

  /** Called from the render loop only to meter audio and adjust gain, never to discover peers. */
  tick(): void {
    this.updateAudio();
    if (this.localAnalyser) {
      const samples = new Uint8Array(this.localAnalyser.fftSize);
      this.localAnalyser.getByteTimeDomainData(samples);
      const speaking = !this.muted && samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / samples.length > 3;
      if (speaking !== this.selfSpeaking) {
        this.selfSpeaking = speaking;
        this.options.onSelfSpeaking(speaking);
      }
    }
    for (const [id, peer] of this.peers) {
      if (!peer.analyser) continue;
      const samples = new Uint8Array(peer.analyser.fftSize);
      peer.analyser.getByteTimeDomainData(samples);
      const level = samples.reduce((sum, sample) => sum + Math.abs(sample - 128), 0) / samples.length;
      const speaking = level > 3;
      if (speaking !== peer.speaking) {
        peer.speaking = speaking;
        this.options.onSpeaking(id, speaking);
      }
    }
  }

  dispose(): void { this.disable(); }

  private reconcile(id: string): void {
    if (!this.enabled || !this.nearby.has(id)) { this.closePeer(id); return; }
    // One deterministic offerer prevents duplicate peer connections.
    if (this.options.selfId() < id && !this.peers.has(id)) void this.createOffer(id);
  }

  private ensurePeer(id: string): PeerEntry {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const connection = new RTCPeerConnection({ iceServers: this.iceServers });
    const entry: PeerEntry = { connection, candidateTypes: new Set(), pendingCandidates: [], speaking: false };
    this.peers.set(id, entry);
    this.log(id, 'peer connection created', { iceServers: this.iceServers });
    for (const track of this.stream?.getTracks() ?? []) connection.addTrack(track, this.stream!);
    connection.addEventListener('icecandidate', (event) => {
      if (!event.candidate) {
        this.log(id, 'ICE gathering complete', { types: [...entry.candidateTypes] });
        return;
      }
      const candidate = event.candidate.toJSON();
      const type = candidateType(candidate);
      entry.candidateTypes.add(type);
      this.log(id, 'local ICE candidate discovered', { type, candidate });
      this.send('voice-signal', { to: id, signal: { kind: 'candidate', candidate } });
    });
    connection.addEventListener('track', (event) => this.attachRemoteAudio(id, entry, event.streams[0], event.track));
    connection.addEventListener('signalingstatechange', () => this.log(id, 'signalingState changed', connection.signalingState));
    connection.addEventListener('iceconnectionstatechange', () => this.log(id, 'iceConnectionState changed', {
      state: connection.iceConnectionState, types: [...entry.candidateTypes],
    }));
    connection.addEventListener('icegatheringstatechange', () => this.log(id, 'iceGatheringState changed', connection.iceGatheringState));
    connection.addEventListener('connectionstatechange', () => {
      const state = connection.connectionState;
      this.log(id, `peer connection ${state}`, {
        state, signalingState: connection.signalingState,
        iceConnectionState: connection.iceConnectionState,
        iceGatheringState: connection.iceGatheringState,
        candidateTypes: [...entry.candidateTypes],
      });
      if (state === 'connected' || state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.options.onPeerStatus(id, `${state}; ICE ${connection.iceConnectionState}; candidates ${[...entry.candidateTypes].join(',') || 'none'}`);
      }
      if (state === 'failed' || state === 'closed') this.closePeer(id);
    });
    return entry;
  }

  private async createOffer(id: string): Promise<void> {
    const peer = this.ensurePeer(id);
    try {
      const offer = await peer.connection.createOffer();
      this.log(id, 'SDP offer created', offer);
      await peer.connection.setLocalDescription(offer);
      this.log(id, 'local SDP offer set', peer.connection.localDescription);
      this.send('voice-signal', { to: id, signal: { kind: 'offer', description: peer.connection.localDescription } });
    } catch (error) {
      this.log(id, 'offer creation/exchange failed', error);
      this.closePeer(id);
      this.options.onStatus('Voice connection failed');
    }
  }

  private attachRemoteAudio(id: string, peer: PeerEntry, stream: MediaStream | undefined, track?: MediaStreamTrack): void {
    const remoteStream = stream ?? (track ? new MediaStream([track]) : undefined);
    if (!remoteStream || !this.audioContext) {
      this.log(id, 'remote audio unavailable', { hasStream: Boolean(remoteStream), hasAudioContext: Boolean(this.audioContext) });
      return;
    }
    peer.remoteTrack = remoteStream.getAudioTracks()[0];
    if (peer.remoteTrack) {
      this.log(id, 'remote audio track received', trackInfo(peer.remoteTrack));
      for (const event of ['mute', 'unmute', 'ended']) {
        peer.remoteTrack.addEventListener(event, () => this.log(id, `remote audio track ${event}`, trackInfo(peer.remoteTrack!)));
      }
    }
    peer.audio?.remove();
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.srcObject = remoteStream;
    peer.audio = audio;
    document.body.append(audio);
    this.log(id, 'remote audio element created and srcObject assigned');
    void audio.play().then(() => this.log(id, 'remote audio play success')).catch((error: unknown) => {
      this.log(id, 'remote audio play failure', error);
      this.options.onPeerStatus(id, `audio play failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    peer.source?.disconnect();
    peer.gain?.disconnect();
    peer.analyser?.disconnect();
    const source = this.audioContext.createMediaStreamSource(remoteStream);
    const analyser = this.audioContext.createAnalyser();
    const gain = this.audioContext.createGain();
    analyser.fftSize = 256;
    source.connect(analyser);
    peer.gain = gain;
    peer.analyser = analyser;
    peer.source = source;
    this.updateAudio();
  }

  private updateAudio(): void {
    const me = this.options.positionFor(this.options.selfId());
    for (const [id, peer] of this.peers) {
      if (!peer.gain) continue;
      const other = this.options.positionFor(id);
      const distance = me && other ? Math.hypot(me.x - other.x, me.z - other.z) : this.radius;
      const attenuation = Math.max(0, 1 - distance / this.radius) ** 1.35;
      peer.gain.gain.value = 1;
      if (peer.audio) peer.audio.volume = this.incomingEnabled && !this.mutedPeers.has(id) ? attenuation : 0;
    }
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.audio?.remove();
    peer.connection.close();
    peer.source?.disconnect();
    peer.gain?.disconnect();
    peer.analyser?.disconnect();
    if (peer.speaking) this.options.onSpeaking(id, false);
  }

  private send(type: string, message: unknown): void {
    this.log('room', 'Colyseus signaling message sent', { type, message });
    this.options.send(type, message);
  }

  private log(id: string, event: string, detail?: unknown): void {
    const method = event.includes('failed') || event.includes('error') ? console.warn : console.info;
    method(`[voice][${this.options.selfId()}][peer=${id}] ${event}`, detail ?? '');
    if (id !== 'local' && id !== 'room') this.options.onPeerStatus(id, event);
  }

  private releaseLocalMedia(): void {
    navigator.mediaDevices?.removeEventListener('devicechange', this.handleDeviceChange);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.localAnalyser?.disconnect();
    this.localMeterGain?.disconnect();
    this.localAnalyser = undefined;
    this.localMeterGain = undefined;
    void this.audioContext?.close();
    this.audioContext = undefined;
  }
}

type Signal =
  | { kind: 'offer' | 'answer'; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; candidate: RTCIceCandidateInit };
function isSignal(value: unknown): value is Signal {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
  const signal = value as Record<string, unknown>;
  return (signal.kind === 'offer' || signal.kind === 'answer')
    ? typeof signal.description === 'object' && signal.description !== null
    : signal.kind === 'candidate' && typeof signal.candidate === 'object' && signal.candidate !== null;
}

function trackInfo(track: MediaStreamTrack): Record<string, unknown> {
  return { id: track.id, kind: track.kind, exists: true, enabled: track.enabled, readyState: track.readyState };
}

function candidateType(candidate: RTCIceCandidateInit | RTCIceCandidate): string {
  const raw = 'candidate' in candidate ? candidate.candidate : undefined;
  return raw?.match(/\btyp\s+(host|srflx|relay)\b/)?.[1] ?? 'unknown';
}
