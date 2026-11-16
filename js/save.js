// Progress and settings, stored on this device only (localStorage). No accounts, no network.
// Two swimmers share one iPad: "easy" (auto-swim) and "free" (joystick). Each has its own Fish Guide.
const KEY = 'reef-ranger-v1';
const PHOTO_KEY = p => `reef-ranger-v1-photos-${p}`;
export const PLAYERS = ['easy', 'free'];
const newPlayer = () => ({ found: ['pip'], stars: 0, best: {}, swims: 0 });
const DEFAULT_SETTINGS = () => ({ sound: true, voice: true, names: { easy: '', free: '' }, last: 'easy', lastPlace: 'reef' });

function fill(d) {
  d = d && typeof d === 'object' ? d : {};
  d.players = d.players || {};
  for (const p of PLAYERS) {
    const pl = Object.assign(newPlayer(), d.players[p]);
    if (!Array.isArray(pl.found)) pl.found = ['pip'];
    if (!pl.found.includes('pip')) pl.found.unshift('pip');
    pl.best = pl.best && typeof pl.best === 'object' ? pl.best : {};
    pl.stars = Number.isFinite(pl.stars) ? pl.stars : 0;
    d.players[p] = pl;
  }
  const s = Object.assign(DEFAULT_SETTINGS(), d.settings);
  s.names = Object.assign({ easy: '', free: '' }, s.names);
  if (!PLAYERS.includes(s.last)) s.last = 'easy';
  d.settings = s;
  return d;
}
export function load() {
  try { return fill(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return fill({}); }
}
export function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; }
}
// Photos are kept apart from the main save so a full photo album can never block saving fish and stars.
export function loadPhotos(p) {
  try { const o = JSON.parse(localStorage.getItem(PHOTO_KEY(p))); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
export function savePhotos(p, photos) {
  try { localStorage.setItem(PHOTO_KEY(p), JSON.stringify(photos)); return true; } catch (e) { return false; }
}
export function resetPlayer(d, p) {
  d.players[p] = newPlayer();
  try { localStorage.removeItem(PHOTO_KEY(p)); } catch (e) { /* ignore */ }
  save(d);
}
