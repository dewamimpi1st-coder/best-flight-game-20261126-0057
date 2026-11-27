# best-flight-game-20261126-0057

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/dewamimpi1st-coder/best-flight-game-20261126-0057/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/dewamimpi1st-coder/best-flight-game-20261126-0057/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Merapi Dawn Run** — a complete, original chase-view flight game that plays offline in a desktop browser from static files, with no network requests. Fly a little orange prop plane down the Merapi valley at dawn, thread all 14 glowing rings, mind the mountains and the river, and land on the far runway before the 150-second clock runs out.

- Chase view over a living valley: a winding river, patchwork fields, drifting clouds, layered mountain ridges, Merapi's cone with a smoking crater, and two runways — all drawn by the game's own canvas code, no images, no downloaded assets.
- Built to be flyable: gentle auto-levelling, a coordinated turn model where banking right really turns right, automatic takeoff lift, and a next-ring guide with a direction arrow, distance and climb/descend hint, so a first-time player can finish the course.
- Keyboard and mouse: arrows or WASD to climb, descend and bank, mouse to steer by pointing, Shift to throttle up, Ctrl to throttle down, Space to boost, P to pause, R to restart. Enter or click to fly.
- Rings with personality: three gold rings worth 250, a PERFECT +50 for threading the centre, and a combo multiplier for chaining rings quickly. A final-approach helper (line-up, height, speed) talks the player down to the runway, and a touchdown rollout leads into a win screen with a full score breakdown.
- Score, combos, ring-pass and landing bonuses, terrain-crash and overshoot logic, and start / pause / crash / time-up / win flows.

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
