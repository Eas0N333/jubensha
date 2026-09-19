/**
 * 实时语音：WebRTC 全网状（mesh），Socket.IO 只做信令转发。
 *
 * 连接规则（避免 glare 双向 offer 冲突）：
 *   - 后来开麦的人收到已有成员列表，由他主动向每个人发起 offer；
 *   - 已有成员只应答，不主动发起。
 * 说话检测：对本地与远端流各挂一个 AnalyserNode，用音量驱动 UI 高亮。
 */

/** 默认值只是兜底，真实配置从 /api/rtc-config 拉（服务端可以配 TURN） */
let rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

async function loadRtcConfig() {
  try {
    const res = await fetch('/api/rtc-config');
    const data = await res.json();
    if (Array.isArray(data.iceServers) && data.iceServers.length) {
      rtcConfig = { iceServers: data.iceServers };
      console.info('[voice] ICE 服务器：', data.iceServers.map((s) => s.urls).join(', '));
    }
  } catch (err) {
    console.warn('[voice] 拉取 ICE 配置失败，用默认 STUN', err);
  }
}

/* 音量：总音量 / 总静音 / 每人音量，都只影响「我听别人」。
   存 localStorage，刷新页面不用重新调。 */
const VOL_KEY = 'jubensha.voice.volume';
const MUTE_KEY = 'jubensha.voice.muted';

const clamp01 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
};
const readStored = (key, dflt) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? dflt : raw;
  } catch { return dflt; }   // 无痕模式下 localStorage 可能直接抛
};
const writeStored = (key, val) => {
  try { localStorage.setItem(key, String(val)); } catch { /* 存不下就算了 */ }
};

export class Voice {
  constructor(socket) {
    this.socket = socket;
    this.enabled = false;
    this.localStream = null;
    this.peers = new Map(); // playerId -> { pc, audio, analyser, speaking }
    this.level = 0;
    this.onChange = () => {};
    this._audioCtx = null;
    this._raf = 0;
    // 音量设置
    this.volume = clamp01(readStored(VOL_KEY, 1));
    this.muted = readStored(MUTE_KEY, '0') === '1';
    this.peerVolume = new Map(); // playerId -> 0~1
    this.peerMuted = new Set(); // playerId
    this._bind();
  }

  get supported() {
    return !!(navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection);
  }

  _bind() {
    this.socket.on('voice:peers', ({ peers }) => {
      // 我后来，我主动发起
      for (const id of peers || []) this._callPeer(id);
    });
    this.socket.on('voice:peer-join', ({ id }) => {
      // 对方会来 offer，这里只占位
      this._ensurePeer(id);
    });
    this.socket.on('voice:signal', ({ from, data }) => this._onSignal(from, data));
    this.socket.on('voice:peer-left', ({ id }) => this._dropPeer(id));
  }

  /* ── 开麦 / 关麦 ─────────────────────────────── */
  async enable() {
    if (this.enabled) return true;
    if (!this.supported) throw new Error('这个浏览器不支持网页语音，用 Chrome / Edge 试试');
    await loadRtcConfig();
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    this.enabled = true;
    this._ensureAudioCtx();
    this._watch(this.localStream, { local: true });
    this.socket.emit('voice:ready', { on: true });
    this.onChange();
    return true;
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    for (const id of [...this.peers.keys()]) this._dropPeer(id);
    this.socket.emit('voice:leave');
    this.level = 0;
    this.onChange();
  }

  async toggle() {
    if (this.enabled) { this.disable(); return false; }
    await this.enable();
    return true;
  }

  /**
   * 换了房间：丢掉旧房间的 peer，并把「我在麦上」重新登记一次。
   * 否则麦克风还开着，但服务端和新同伴都不知道。
   */
  reannounce() {
    if (!this.enabled) return;
    for (const id of [...this.peers.keys()]) this._dropPeer(id);
    this.socket.emit('voice:ready', { on: true });
  }

  /* ── 音量 ─────────────────────────────────────
     全部只作用于远端 <audio> 的音量：调的是「我这里听到多大」，
     不动别人麦克风的采集，也不影响别人听到的声音。 */
  setVolume(v) {
    this.volume = clamp01(v);
    writeStored(VOL_KEY, this.volume);
    this._applyAll();
    this.onChange();
    return this.volume;
  }

  setMuted(on) {
    this.muted = !!on;
    writeStored(MUTE_KEY, this.muted ? '1' : '0');
    this._applyAll();
    this.onChange();
    return this.muted;
  }

  toggleMuted() { return this.setMuted(!this.muted); }

  setPeerVolume(id, v) {
    this.peerVolume.set(id, clamp01(v));
    this._applyPeer(id);
    this.onChange();
  }

  peerVolumeOf(id) { return this.peerVolume.get(id) ?? 1; }
  isPeerMuted(id) { return this.peerMuted.has(id); }

  setPeerMuted(id, on) {
    if (on) this.peerMuted.add(id); else this.peerMuted.delete(id);
    this._applyPeer(id);
    this.onChange();
  }

  togglePeerMuted(id) {
    this.setPeerMuted(id, !this.peerMuted.has(id));
    return this.peerMuted.has(id);
  }

  /** 这个人现在实际该放多大声（0 表示完全不放） */
  gainFor(id) {
    if (this.muted || this.peerMuted.has(id)) return 0;
    return clamp01(this.volume * this.peerVolumeOf(id));
  }

  _applyPeer(id) {
    const p = this.peers.get(id);
    if (!p?.audio) return;
    const g = this.gainFor(id);
    p.audio.volume = g;
    p.audio.muted = g <= 0.001;
  }

  _applyAll() {
    for (const id of this.peers.keys()) this._applyPeer(id);
  }

  /* ── 内部 ───────────────────────────────────── */
  _ensureAudioCtx() {
    if (!this._audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this._audioCtx = new Ctx();
    }
    if (this._audioCtx.state === 'suspended') this._audioCtx.resume();
  }

  _ensurePeer(id) {
    let p = this.peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection(rtcConfig);
    p = { pc, audio: null, analyser: null, speaking: false };
    this.peers.set(id, p);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.socket.emit('voice:signal', { to: id, data: { candidate: e.candidate } });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      if (!p.audio) {
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.style.display = 'none';
        document.body.append(audio);
        p.audio = audio;
      }
      p.audio.srcObject = stream;
      this._applyPeer(id);   // 新来的 peer 也要套用当前音量设置
      p.audio.play().catch(() => {});
      this._watch(stream, { peerId: id });
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        if (pc.connectionState !== 'disconnected') this._dropPeer(id);
      }
    };
    return p;
  }

  _addLocalTracks(pc) {
    if (!this.localStream) return;
    for (const track of this.localStream.getTracks()) {
      if (!pc.getSenders().some((s) => s.track === track)) pc.addTrack(track, this.localStream);
    }
  }

  async _callPeer(id) {
    const p = this._ensurePeer(id);
    this._ensureAudioCtx();
    try {
      this._addLocalTracks(p.pc);
      const offer = await p.pc.createOffer({ offerToReceiveAudio: true });
      await p.pc.setLocalDescription(offer);
      this.socket.emit('voice:signal', { to: id, data: { sdp: p.pc.localDescription } });
    } catch (err) {
      console.warn('[voice] offer 失败', id, err);
    }
  }

  async _onSignal(from, data) {
    if (!this.enabled) return;
    const p = this._ensurePeer(from);
    this._ensureAudioCtx();
    try {
      if (data.sdp) {
        await p.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          this._addLocalTracks(p.pc);
          const answer = await p.pc.createAnswer();
          await p.pc.setLocalDescription(answer);
          this.socket.emit('voice:signal', { to: from, data: { sdp: p.pc.localDescription } });
        }
      } else if (data.candidate) {
        await p.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.warn('[voice] 信令处理失败', from, err);
    }
  }

  _dropPeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch { /* ignore */ }
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    this.peers.delete(id);
    this.onChange();
  }

  /** 音量检测：把「谁在说话」喂给 UI */
  _watch(stream, { local = false, peerId = null } = {}) {
    if (!this._audioCtx) return;
    try {
      const src = this._audioCtx.createMediaStreamSource(stream);
      const analyser = this._audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
        const rms = Math.sqrt(sum / buf.length);
        const on = rms > 0.045;
        if (local) {
          this.level = rms;
          const changed = Math.abs((this._lastLocal ?? 0) - rms) > 0.02;
          this._lastLocal = rms;
          if (on) this.onChange();
          else if (changed) this.onChange();
        } else {
          const p = this.peers.get(peerId);
          if (p && p.speaking !== on) { p.speaking = on; this.onChange(); }
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.warn('[voice] 音量检测不可用', err);
    }
  }

  isSpeaking(id) { return !!this.peers.get(id)?.speaking; }
  peerCount() { return this.peers.size; }
}
