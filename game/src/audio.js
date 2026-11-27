// Kestrel Ridge Run — sound, synthesized live with WebAudio.
// No audio files: the engine is two detuned oscillators through a low-pass
// filter, the wind is filtered noise, and the chimes are plain sine notes.
// Everything starts on the first user gesture, as browsers require.

export function createAudio() {
  const api = {
    enabled: true, ready: false,
    start, setEngine, setWind, chime, thud, alarm, click, toggleMute,
  };
  let ctx = null;
  let engineOsc1 = null, engineOsc2 = null, engineGain = null, engineFilter = null;
  let windSrc = null, windGain = null, windFilter = null;
  let master = null;

  function start() {
    if (api.ready) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return; // no audio on this machine: the game plays silent
    }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Engine: a sawtooth pair, one an octave up, through a low-pass.
    engineOsc1 = ctx.createOscillator();
    engineOsc1.type = 'sawtooth';
    engineOsc1.frequency.value = 55;
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineOsc2.frequency.value = 110;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc1.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc1.start();
    engineOsc2.start();

    // Wind: looped noise through a band-pass that opens with speed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();

    api.ready = true;
  }

  function setEngine(throttle, speed01) {
    if (!api.ready || !api.enabled) return;
    const t = ctx.currentTime;
    const rpm = 52 + throttle * 95 + speed01 * 18;
    engineOsc1.frequency.setTargetAtTime(rpm, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(rpm * 2.02, t, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(0.05 + throttle * 0.11, t, 0.1);
  }

  function setWind(speed01) {
    if (!api.ready || !api.enabled) return;
    const t = ctx.currentTime;
    windGain.gain.setTargetAtTime(speed01 * speed01 * 0.16, t, 0.15);
    windFilter.frequency.setTargetAtTime(350 + speed01 * 900, t, 0.15);
  }

  function tone(freq, at, dur, vol, type = 'sine') {
    if (!api.ready || !api.enabled) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + at);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
    o.connect(g);
    g.connect(master);
    o.start(ctx.currentTime + at);
    o.stop(ctx.currentTime + at + dur + 0.05);
  }

  function chime() {
    tone(660, 0, 0.35, 0.22);
    tone(880, 0.09, 0.35, 0.22);
    tone(1320, 0.18, 0.5, 0.18);
  }

  function thud() {
    tone(70, 0, 0.4, 0.5, 'triangle');
    tone(45, 0.05, 0.5, 0.4, 'sine');
  }

  function alarm() {
    tone(520, 0, 0.16, 0.16, 'square');
    tone(520, 0.22, 0.16, 0.16, 'square');
  }

  function click() {
    tone(1200, 0, 0.06, 0.12, 'sine');
  }

  function toggleMute() {
    api.enabled = !api.enabled;
    if (master) master.gain.value = api.enabled ? 0.5 : 0;
    return api.enabled;
  }

  return api;
}
