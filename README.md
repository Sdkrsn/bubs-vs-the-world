# BUBS VS. THE WORLD 🎮❤️

A tiny handcrafted 2D platformer gift. One girl, too many problems, one extremely annoying boyfriend.

## Files

- `index.html` — page structure, screens, HUD and touch controls
- `game.js` — the entire game engine (physics, levels, enemies, boss fight, audio)

No build step, no dependencies, no backend. Just two files.

## Running it locally

Opening `index.html` directly by double-clicking (`file://`) mostly works, but some
browsers restrict things like the Web Audio API or canvas behavior on `file://`
pages. The safest option is a tiny local server:

```bash
# from inside this folder
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

(Any other static server works too — `npx serve`, VS Code's "Live Server", etc.)

## Publishing

### GitHub Pages
1. Create a new GitHub repo and push these two files (`index.html`, `game.js`) to it.
2. In the repo settings, go to **Pages** → set source to the `main` branch, root folder.
3. Your game will be live at `https://<username>.github.io/<repo-name>/`.

### Netlify
1. Go to [netlify.com](https://netlify.com) → "Add new site" → "Deploy manually".
2. Drag the folder containing `index.html` and `game.js` into the drop zone.
3. Netlify gives you a live link instantly — share that.

Either way, grab the link and send it to her. 💕

## Controls

**Desktop:** Arrow keys / A-D to move, Up / W / Space to jump, Z / J to attack,
X / K for the Love Blast special (once charged), Esc to pause.

**Mobile:** on-screen buttons in the bottom corners — left/right, jump, attack,
and a smaller special-attack button.

## Feature checklist

- [x] Title screen with animated intro and "LET'S GO, BUBS!" entry
- [x] Mandatory instructions screen shown before gameplay, with desktop + mobile controls explained
- [x] Full platformer physics: gravity, jumping, ground/platform collision, camera follow, world bounds
- [x] Three hand-built levels with unique layouts, moving platforms, and scenery
- [x] Three enemy types (Stress, Overthinking, Exhaustion) with real health, hit detection, and defeat messages
- [x] Melee attack with a real hitbox + a chargeable Love Blast projectile special
- [x] Collectible hearts with floating messages and particle bursts
- [x] Player health/HUD, invulnerability frames, knockback, gentle retry flow (no harsh punishment)
- [x] Secret optional heart in Level 2
- [x] Cinematic transition into the secret bonus round after Level 3
- [x] Full boyfriend boss fight: three readable attacks (unfunny joke, "bubssss" heart wave, interruptible monologue), real health bar, defeat animation, dialogue, kiss button, and ending screen
- [x] Procedurally drawn pixel-art sprites for Bubs, the boyfriend, and all three enemies — no external image files
- [x] WebAudio-generated sound effects (jump, attack, hit, heart, portal, boss, victory) + mute toggle; game is fully playable with sound off
- [x] Pause/resume/restart, clean state reset on retry and "Play Again"
- [x] Mobile-first touch controls with proper pointer-event handling (no stuck buttons), portrait-safe layout
- [x] Responsive scaling across desktop and mobile viewports

Everything in the brief is implemented and was exercised end-to-end in a real
browser session (movement, combat, death/retry, level transitions, the full
boss fight, the kiss ending, and the mobile touch-control layout) before
delivery — nothing here is a placeholder.
