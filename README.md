# Reef Ranger: Pip's Ocean Patrol — v1.0.1

An original underwater "flight" game for young children. **Pip**, a baby blacktip reef shark (an original character), swims through the ocean like a little plane. Pip blows bubbles to clean up the sea, puts grumpy fish to sleep, and takes photos for Ranger Ray, a friendly manta ray. Every animal Pip meets goes into the **Fish Guide**, with a real fact read aloud.

All art and sound are made in code. There are no downloaded models, images or sound files.

## How it plays
- **Pick a swimmer** on the title screen.
  - **Easy swim** (about age 4): Pip swims the route alone and leans toward a finger. Tap anywhere to blow a bubble; bubbles home in on anything within 120 px. Hold to keep blowing.
  - **Free swim** (older kids): the left thumb steers like a plane joystick (turn, dive, climb). The big **Bubble!** button aims at the crosshair, with a smaller 55 px helper.
  - Each swimmer has their own Fish Guide, stars and photos.
- **Three places:** Coral Reef, Kelp Forest and Deep Sea (about 90 seconds each). Open Ocean shows as "coming soon".
- **One game with three parts:**
  - **Clean-up (the core):** trash floats up in a bubble and pops. Ghost nets break after a few bubbles and a trapped animal swims free. Gunk Bots dump trash until bubbled away.
  - **Sleepy bubbles:** grumpy barracudas (anglerfish in the deep) cross ahead and moray eels peek out of rocks. A few bubbles and they yawn and nap on the sand. A boss waits at the end: the Big Barracuda, or a giant squid in the deep. If the boss isn't asleep after 45 seconds it gets tired and naps anyway.
  - **Photo requests (optional):** Ray asks for a photo of a fish ("snap a parrotfish"). Tap **📷 Snap**; photos earn 1–3 stars by size. The best photo of each animal is kept in the Fish Guide.
- **No fail state.** Bumps only wobble Pip.
- **Easy to see (v1.0.1, after the first iPad test):** bubble shots are big and glowing with a trail, a ring flashes where the finger taps and a yellow ring where a bubble pops. Trash is solid and brightly coloured, with a pulsing yellow ring when it is within about 38 m.
- **Learning:** friendly fish near Pip are scanned automatically and a card pops up (name, a "FISH" or "NOT A FISH · mammal/reptile/mollusk/jelly" badge, a one-line fact read aloud).
- **Pause** (top-left), **Zoom!** (speed burst).

## Put it on the iPad (offline, full screen)
1. Publish once to GitHub Pages: `bash deploy.sh "v1"`. Do this **only with the owner's OK** (it creates a public URL). It needs an empty public repo `reef-ranger` cloned to `C:\Users\satos\dev\reef-ranger`, with Pages turned on. Run `python make_icons.py .` first if the icons are missing.
2. On the iPad, open `https://satoshitoyoda-ai.github.io/reef-ranger/` in **Safari** → Share → **Add to Home Screen**.
3. Open it once from the Home Screen while online. The service worker caches the whole game; after that it works offline.
4. Progress lives in the Home Screen app's own storage. Play from the Home Screen icon, not a Safari tab, or progress won't carry over.

**Test on the PC:** run `python -m http.server 8773` in this folder and open `http://localhost:8773/`. Mouse = finger; Space = bubble, Shift = Zoom, C = snap, arrows/WASD steer, P = pause.

## Grown-ups menu (hold ⚙︎ on the title screen for 2 s)
Sound effects on/off, Ranger Ray's voice on/off, a name for each swimmer button (stays on this device only), "Start over" per swimmer, and the version/frame rate.

## What's inside
| Path | What |
|---|---|
| `index.html` | Screens, HUD, styles, import map |
| `js/game.js` | Game flow, Pip's swimming and camera, targets, bubbles, photos, Fish Guide, map, grown-ups menu |
| `js/ocean.js` | The three places: terrain, light, kelp, coral, deep-sea vents, floating particles |
| `js/critters.js` | Pip and every animal, trash, ghost nets and Gunk Bots, all built in code |
| `js/data.js` | Fish Guide entries and facts |
| `js/save.js` | Progress and settings in localStorage (on the device only) |
| `js/audio.js` | Synthesized sound (no audio files) and the device voice |
| `lib/` | three.js (MIT licence, `lib/LICENSE-three.txt`) |
| `sw.js` | Offline cache (bump `VERSION` on every release) |

## Privacy
No accounts, ads, analytics or network calls. Everything is stored on the device. The published files contain no personal names.

## Performance
Pixel ratio is capped at 1.5 and drops to 1 if play runs below about 45 fps. Real iPad frame rate has not been measured yet.

## Updating
Bump `VERSION` in `sw.js` and `js/game.js`, then run `deploy.sh` (only with the owner's OK). Open the app twice on the iPad to load the new version.
