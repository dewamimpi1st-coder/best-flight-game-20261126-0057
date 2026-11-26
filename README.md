# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/dewamimpi1st-coder/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/dewamimpi1st-coder/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Merapi Ring Run** — a complete, original chase-view flight game that plays offline in a desktop browser from static files, with no network requests. Fly a little red-and-yellow prop plane down the Merapi valley at dawn, thread all 12 glowing rings, mind the mountains, and land on the far runway before the 150-second clock runs out.

- Chase view over recognisable terrain: a winding river, patchwork fields, snow-capped ridges and two runways, all drawn by the game's own canvas code — no images, no downloaded assets.
- The aircraft stays in frame with lit instruments: a glowing HUD (altitude, speed, heading, compass tape, score, timer) plus an instrument panel with an artificial horizon, airspeed and altitude dials, a heading dial and a throttle gauge.
- Keyboard and mouse: arrows or WASD to pitch and bank, mouse to steer, Shift to throttle up, Ctrl to throttle down, Space to boost, P to pause, R to restart. Enter or click to fly.
- Score, combos, ring-pass and landing bonuses, terrain-crash and overshoot logic, and start / pause / crash / landing / time-up flows.

## Run it

Play it straight from the files — no build step:

```sh
open game/index.html
```

Build the graded output the way the grader does (Node 22, standard library only):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `game/` and `screenshots/` to `out/` and writes `out/dossier.json` with the vendored `vendor/makefun-game.ts` library. Running it twice writes byte-identical output.

---

Entered on [make.fun](https://make.fun/?ref=a23jzwmt&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards
