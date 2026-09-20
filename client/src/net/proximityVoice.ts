export interface VoicePosition { x: number; z: number }
export interface IceServerConfig { urls: string | string[]; username?: string; credential?: string }

interface PeerEntry {
  connection: RTCPeerConnection;
  source?: MediaStreamAudioSourceNode;
  gain?: GainNode;
  analyser?: AnalyserNode;
  pendingCandidates: RTCIceCandidateInit[];
  speaking: boolean;
}

export interface ProximityVoiceOptions {
  selfId: () => string;
  positionFor: (id: string) => VoicePosition | undefined;
  send: (type: string, message: unknown) => void;
  onStatus: (status: string) => void;
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
      this.audioContext = new AudioContext();
      await this.audioContext.resume();
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localMeterGain = this.audioContext.createGain();
      this.localMeterGain.gain.value = 0;
      this.audioContext.createMediaStreamSource(stream).connect(this.localAnalyser).connect(this.localMeterGain).connect(this.audioContext.destination);
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => this.disable('Microphone permission was revoked'));
      });
      navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange);
      this.enabled = true;
      this.options.send('voice-ready', { enabled: true });
      this.options.onStatus('Voice on');
      for (const id of this.nearby) this.reconcile(id);
    } catch (error) {
      this.releaseLocalMedia();
      const detail = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone permission denied' : 'Microphone unavailable';
      this.options.onStatus(detail);
    }
  }

  disable(status = 'Voice off'): void {
    if (this.enabled) this.options.send('voice-ready', { enabled: false });
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
    if (!this.enabled || !this.nearby.has(from) || !isSignal(signal)) return;
    const peer = this.ensurePeer(from);
    try {
      if (signal.kind === 'candidate') {
        if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(signal.candidate);
        else peer.pendingCandidates.push(signal.candidate);
        return;
      }
      await peer.connection.setRemoteDescription(signal.description);
      for (const candidate of peer.pendingCandidates.splice(0)) await peer.connection.addIceCandidate(candidate);
      if (signal.kind === 'offer') {
        await peer.connection.setLocalDescription(await peer.connection.createAnswer());
        this.options.send('voice-signal', { to: from, signal: { kind: 'answer', description: peer.connection.localDescription } });
      }
    } catch {
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
    const entry: PeerEntry = { connection, pendingCandidates: [], speaking: false };
    this.peers.set(id, entry);
    for (const track of this.stream?.getTracks() ?? []) connection.addTrack(track, this.stream!);
    connection.addEventListener('icecandidate', (event) => {
      if (event.candidate) this.options.send('voice-signal', { to: id, signal: { kind: 'candidate', candidate: event.candidate.toJSON() } });
    });
    connection.addEventListener('track', (event) => this.attachRemoteAudio(id, entry, event.streams[0]));
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') this.closePeer(id);
    });
    return entry;
  }

  private async createOffer(id: string): Promise<void> {
    const peer = this.ensurePeer(id);
    try {
      await peer.connection.setLocalDescription(await peer.connection.createOffer());
      this.options.send('voice-signal', { to: id, signal: { kind: 'offer', description: peer.connection.localDescription } });
    } catch { this.closePeer(id); this.options.onStatus('Voice connection failed'); }
  }

  private attachRemoteAudio(id: string, peer: PeerEntry, stream: MediaStream | undefined): void {
    if (!stream || !this.audioContext) return;
    peer.source?.disconnect();
    peer.gain?.disconnect();
    peer.analyser?.disconnect();
    const source = this.audioContext.createMediaStreamSource(stream);
    const analyser = this.audioContext.createAnalyser();
    const gain = this.audioContext.createGain();
    analyser.fftSize = 256;
    source.connect(analyser).connect(gain).connect(this.audioContext.destination);
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
      peer.gain.gain.value = this.incomingEnabled && !this.mutedPeers.has(id) ? attenuation : 0;
    }
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.connection.close();
    peer.source?.disconnect();
    peer.gain?.disconnect();
    peer.analyser?.disconnect();
    if (peer.speaking) this.options.onSpeaking(id, false);
    this.peers.delete(id);
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
