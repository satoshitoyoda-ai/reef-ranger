// Tiny Web Audio synth (no audio files) + the device voice for Ranger Ray.
// Sound effects and voice are switched separately in the grown-ups menu. `silent` mutes everything (test URLs use ?mute).
let ac = null, master = null, amb = null, muted = false, silent = false, voiceOn = true, warmed = false;
export const isMuted = () => muted || silent;
export function setSilent(s) { silent = s; if (s) stopAll(); }
export function setMuted(m) { muted = m; if (m && amb && ac) amb.g.gain.setTargetAtTime(0, ac.currentTime, 0.1); }
export function setVoice(on) { voiceOn = on; if (!on && 'speechSynthesis' in window) speechSynthesis.cancel(); }
function stopAll() { if (amb && ac) amb.g.gain.setTargetAtTime(0, ac.currentTime, 0.1); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
const sfxOff = () => muted || silent;
function ctx() {
  if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination); }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
function tone(type, f0, f1, dur, vol = 0.25, delay = 0) {
  if (sfxOff() || !ac) return;
  const a = ctx(), t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, fc, delay = 0, q = 1) {
  if (sfxOff() || !ac) return;
  const a = ctx(), t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.value = fc; f.Q.value = q; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
export const sfx = {
  bloop() { tone('sine', 240, 760, 0.16, 0.22); tone('sine', 520, 1100, 0.1, 0.08, 0.05); },
  pop() { tone('sine', 900, 1600, 0.07, 0.22); noise(0.05, 0.12, 3200, 0, 2); },
  chime() { [880, 1108, 1320, 1760].forEach((f, i) => tone('triangle', f, f, 0.4, 0.1, i * 0.08)); },
  snap() { noise(0.05, 0.35, 5200, 0, 0.8); tone('square', 1800, 1300, 0.03, 0.04, 0.06); },
  yawn() { tone('sine', 560, 210, 1.0, 0.14); tone('sine', 280, 120, 1.0, 0.06, 0.05); },
  boing() { tone('sine', 300, 640, 0.22, 0.2); tone('sine', 640, 230, 0.32, 0.14, 0.2); },
  zoom() { noise(0.55, 0.12, 700, 0, 0.7); tone('sine', 180, 520, 0.45, 0.08); },
  bump() { tone('sine', 150, 70, 0.28, 0.28); },
  star() { tone('triangle', 1320, 1980, 0.12, 0.08); },
};
export function ambience(on = true) {
  if (!ac) return;
  const a = ctx();
  if (!on || sfxOff()) { if (amb) amb.g.gain.setTargetAtTime(0, a.currentTime, 0.3); return; }
  if (amb) { amb.g.gain.setTargetAtTime(0.16, a.currentTime, 0.5); return; }
  const n = a.sampleRate * 4, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0); let last = 0;
  for (let i = 0; i < n; i++) { last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02; d[i] = last * 3.5; }
  const s = a.createBufferSource(); s.buffer = b; s.loop = true;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
  const g = a.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start();
  const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
  g.gain.setTargetAtTime(0.16, a.currentTime, 1.0); amb = { g };
}
// Call from a tap: iPad Safari only allows audio and speech that start from a user gesture.
export function unlock() {
  if (silent) return;
  if (!muted) { try { ctx(); } catch (e) { /* no audio */ } }
  if (!warmed && voiceOn && 'speechSynthesis' in window) {
    warmed = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) { /* ignore */ }
  }
}

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); if (!vs.length) return null;
  const pref = [/Ava|Zoe|Samantha|Evan|Nathan/i, /Aria|Jenny|Guy/i, /Google US English/i, /en-US/i];
  for (const r of pref) { const v = vs.find(v => r.test(v.name) || r.test(v.lang)); if (v) return v; }
  return vs[0];
}
export function say(text) {
  if (silent || !voiceOn || !('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); voice = voice || pickVoice(); const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice; u.rate = 1.0; u.pitch = 1.12; speechSynthesis.speak(u); } catch (e) { /* ignore */ }
}
