# RESUME — Merapi Dawn Run (new flight game, fresh build)

## Repo
- Local working dir: `/home/hatch/workspace/make-fun-flight-game/`
- GitHub repo: https://github.com/dewamimpi1st-coder/best-flight-game-20261126-0057
- Competition: **Make the best flight game**, slug `best-flight-game-20261126-0057`, $500 total, 50 paid places
- Entries close: **2026-11-28T00:57:00Z (07:57 WIB, 28 Nov 2026)** — quota was `can_submit: true` with a blind-round slot open (checked 2026-11-27 21:14 UTC)
- Local commit hash (game code): **3be3b8940c9bf33128aebcf6e7059364aaaeb1fa**
  (`Merapi Dawn Run: fresh flight game — 14 rings, correct controls, proven win`).
  A follow-up commit adds this RESUME.md hash line itself; use `git log -1`
  for the latest local hash — the push script builds its own remote commit
  anyway (see step 1 below).

## What was built
**"Merapi Dawn Run"** — a fresh chase-view flight game over Mount Merapi at dawn,
written from scratch in this session from the design brief. It replaces (not
patches) the old "Merapi Ring Run" / "Kind Matrix" code.

- Take off from a runway, fly **14 glowing rings** down a 6,300-unit valley
  (3 gold rings worth 250, others 100; PERFECT +50 for a centred pass),
  build a combo streak (score multiplier up to 3x), then land on the far
  runway before the **150-second** clock runs out.
- Win: touch down on the far runway, aligned and slow enough, then roll out —
  win screen shows rings hit, landing bonus +500, time bonus (+5/sec left),
  total score and best score.
- Lose: terrain strike, flying into the valley walls / Merapi, overshooting
  the runway, landing badly, or the timer running out (crash / time-up screens).
- Controls: arrows / WASD (RIGHT banks and turns right, LEFT left, UP climbs,
  DOWN descends), mouse steering by pointing, Shift throttle up, Ctrl throttle
  down, Space boost, P pause, R restart. Gentle auto-levelling; hands-off the
  plane climbs to a safe height and lifts off by itself (auto-climb disabled
  on final approach so the pilot owns the descent).
- HUD: score, combo streak, rings n/14, time left, speed (kn), altitude (m),
  heading (deg + compass point), throttle bar, next-ring guide (arrow, distance,
  CLIMB/DESCEND), PULL UP — TERRAIN and TURN BACK — MOUNTAINS warnings, and a
  final-approach helper after the last ring (line-up, height, speed).
- Polish: dawn sky gradient with low sun and stars, 26 deterministic clouds,
  layered mountain ridges, Merapi cone with snow cap and smoke plume,
  patchwork fields, river, trees, two runways with centre dashes, glowing
  pulsing rings, orange/red prop plane drawn from behind, ring-hit and crash
  particles, speed lines above 44 speed, WebAudio chime/thud/fanfare (optional,
  try/catch). Start / pause / crash / time-up / win screens. All art is canvas
  code — no downloaded assets, no runtime-fetched images.
- Test handle: `window.__dawnrun = { state, rings, reset, groundH, ringList }`.

## Files changed (local commit)
- `game/game.js` — rewritten fresh (~34 KB)
- `game/index.html` — rewritten fresh
- `game/style.css` — rewritten fresh
- `main.ts` — rewritten fresh (copies game/ + screenshots/ to the output dir,
  refuses any http(s) URL in game files, requires >=3 screenshots <=524,288
  bytes each, writes dossier.json via buildDossier)
- `README.md` — description updated; the three live make.fun badges and the
  bounty link are unchanged
- `screenshots/` — old PNGs removed, replaced with 4 fresh JPEG captures of
  the new game: `1-start.jpg` (76,524 B), `2-rings.jpg` (56,011 B),
  `3-merapi.jpg` (55,322 B), `4-win.jpg` (57,610 B)
- NOT modified: `vendor/makefun-game.ts`, `LICENSE`, `.makefun/owner.json`
  (vendor file is a reconstruction from another competition's kit, not
  byte-for-byte from this competition's kit — see caveat below)

## Verification — FINAL RUN 2026-11-27 21:38–21:40 UTC
Browser: Playwright Chromium (`~/.cache/ms-playwright/chromium-1255/`), CDP
driver `/tmp/drive.mjs` loading `game/index.html` directly. Console errors: **0**.

### Controls test (each: reset, Enter, wait airborne, hold key 1.5 s, compare state)
| Key | Observed | Result |
|-----|----------|--------|
| RIGHT | heading +0.508, x +15.2 | PASS — turns right |
| LEFT | heading −0.508, x −15.2 | PASS — turns left |
| UP | y +21.4 (4.9 → 26.3) | PASS — climbs |
| DOWN | y −4.1 (4.1 → 0.0, ground) | PASS — descends |

Same 4/4 PASS in the two earlier runs too (RIGHT +0.504/+0.975, LEFT
−0.511/−0.969, UP +20.9/+21.2, DOWN −4.0/−4.9). **The old inverted-controls
bug is fixed and proven.**

### Autopilot full flight (heading-error steering, pitch to ring height,
slow + descend on final)
- **Phase: WIN** — landed on the far runway at z = 5995.8, heading 0.025,
  speed 4.9 at rollout end, time left 26.0 s.
- **Rings hit: 14 / 14** (all rings, including all 3 gold rings).
- **Final score: 6305** (rings + landing bonus +500 + time bonus +130).
- Console errors: **0**. Win screen reached and screenshot captured
  (`screenshots/4-win.jpg`).
- Earlier autopilot runs (for the record): 1/14 crash into valley wall
  (fixed: wider walls, gentler turn rate, rings r=17); 11/14 crash into
  Merapi slope (fixed: cone moved to x=-150, z=4350, clear of the course);
  14/14 crash on final approach at z=5878 (fixed: flat approach corridor
  from z=5800, auto-climb off on final, longer runway TRACK_LEN 6300).

### main.ts / dossier (run through the kit entrypoint)
- Two runs with `MAKEFUN_OUTPUT_DIR=/tmp/out1` and `/tmp/out2`:
  `diff -r` clean — **DETERMINISTIC OK**.
- Dossier: schema `makefun/dossier/v1`, cover image 0, 4 images, text
  35,479 bytes (cap 65,536), 3 game files (35,217 bytes total), screenshots
  4 × 49–77 KB (cap 524,288 each).

## Caveats
- `vendor/makefun-game.ts` is NOT byte-for-byte from this competition's kit
  (reconstructed from the token-radar kit). It was not modified. Server intake
  checks passed for the previous entries built on it, but a dossier mismatch
  could surface during grading — same caveat as the earlier entries.
- The autopilot proves the course is completable and the controls are correct;
  it does not prove a human judge will enjoy the game. Difficulty feels
  fair: rings are generous (r=17) and the approach helper guides the landing.

## Next steps for the main agent (exact commands)
1. Push the new commit to GitHub via the API push helper (it creates its own
   remote commit from the working-tree files — the remote hash will DIFFER
   from the local hash; use the REMOTE hash for --commit):
   ```
   python3 /home/hatch/workspace/custom-connectors/custom.github/bin/push_flight_game_repo.py
   ```
   Verify the returned commit URL opens on GitHub, and note the remote commit
   hash (REMOTE_HASH).
2. Bundle with the kit CLI (builder evidence session = this session):
   ```
   node /home/hatch/workspace/make-fun-token-radar/kit/token-radar-01-kit/cli/makefun.mjs bundle \
     --session <SESSION FILE PATH — see below> --no-discover --no-family \
     --parent-session <MAIN CHAT SESSION FILE> \
     --prompt-file <file with the user's verbatim instruction> \
     --muse-usage <muse-usage.jsonl for this session>
   ```
   Note: if the builder session shows 0 usage rows in muse.db right after
   this report, query `agent.agent_message_token_usage` for this agent id
   and write the row(s) as JSON lines to `muse-usage.jsonl` (rewrite the file
   with proper newlines — appending can glue JSON objects onto one line and
   break the bundle).
3. Kit check (must be 0 failed, thinking_reproduces >= 30%):
   ```
   node /home/hatch/workspace/make-fun-token-radar/kit/token-radar-01-kit/cli/makefun.mjs check \
     --repo /home/hatch/workspace/make-fun-flight-game --worktree --transcripts <bundle.tar.gz>
   ```
4. Submit (before 2026-11-28T00:57:00Z / 07:57 WIB 28 Nov):
   ```
   node /home/hatch/workspace/make-fun-token-radar/kit/token-radar-01-kit/cli/makefun.mjs submit \
     --competition best-flight-game-20261126-0057 \
     --repo-url https://github.com/dewamimpi1st-coder/best-flight-game-20261126-0057 \
     --commit <REMOTE_HASH> \
     --keypair /home/hatch/workspace/make-fun-token-radar/makefun-keypair.json
   ```
   Then `makefun status --submission <new id>` to confirm, and report the new
   submission ID + claim code to the user in chat (claim code never in a file).
   The new entry replaces "Kind Matrix" (01a21a03) as final under Force_Last.
   If the new entry somehow scores worse, restore the old final with
   `makefun final best-flight-game-20261126-0057 01a21a03-05e8-76cb-812d-7e11ed96cd57`.

## Session identifiers
- This builder session id: `17eee757-d6ca-452a-bb4e-ad255aa26c69`
- Parent (main agent) session id: `4656f5aa-6e15-4102-ac0c-1da8d0113d7d`
- Task label: `149be2e1-4fe5-4afb-88f5-c5eb4f398257`
- Builder session file path: **<PLACEHOLDER — main agent to fill in from the
  agent record for session 17eee757-d6ca-452a-bb4e-ad255aa26c69>**
