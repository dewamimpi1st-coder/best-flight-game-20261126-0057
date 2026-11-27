// Merapi Dawn Run — a make.fun flight-game entry (Node 22, standard library only).
//
// This entrypoint assembles the graded output: it copies this repository's
// game/ and screenshots/ into the output directory and writes dossier.json,
// the summary the judge reads, using the vendored make.fun library. It reads
// nothing from /input, makes no network request, and writes the same bytes on
// every run, because the game files are copied as they are and the dossier is
// canonical JSON computed over them.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_CAP_BYTES = 65_536;
const SHOT_CAP = { max: 4, max_bytes: 524_288 };
const GAME_CAP = { max_files: 400, max_bytes: 4_194_304 };
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** The value after --name, or the fallback when the flag is absent. */
function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function die(message: string): never {
  process.stderr.write(`merapi dawn run: ${message}\n`);
  process.exit(1);
}

const outDir = flag('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/**
 * Copy one file, leaving the destination writable (mode 0644).
 *
 * copyFileSync preserves the source file's mode. The repo is mounted
 * read-only in the grader, so its files are mode 0444 — the copies land
 * read-only too, and a second run into the same output directory (the
 * grader runs the program more than once, e.g. for the determinism check)
 * then dies with EACCES "permission denied, copyfile ..." and exit 1.
 * Forcing 0644 makes every re-run succeed. Only modes change — the bytes
 * are untouched, so the dossier (computed from file contents) is
 * byte-identical. The pre-copy chmod covers a destination left read-only
 * by an earlier run; both chmods are best-effort so a filesystem that
 * refuses chmod can never turn a successful copy into a failure.
 */
function copyOne(from: string, to: string): void {
  try { chmodSync(to, 0o644); } catch { /* destination does not exist yet, or is not ours */ }
  copyFileSync(from, to);
  try { chmodSync(to, 0o644); } catch { /* best effort: the copy itself already succeeded */ }
}

/** Mirror one directory tree of regular files into `to`, skipping dot-names. */
function mirror(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  try { chmodSync(to, 0o755); } catch { /* best effort */ }
  const found: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      if (!SAFE_NAME.test(name)) die(`${rel}${name}: names are letters, digits and . _ -, 1 to 128 characters`);
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) {
        const destDir = join(to, rel, name);
        mkdirSync(destDir, { recursive: true });
        try { chmodSync(destDir, 0o755); } catch { /* best effort */ }
        walk(path, `${rel}${name}/`);
      } else if (st.isFile()) {
        copyOne(path, join(to, rel, name));
        found.push(`${rel}${name}`);
      } else {
        die(`${rel}${name}: neither a file nor a directory`);
      }
    }
  };
  walk(from, '');
  return found.sort();
}

const gameFiles = mirror(join(here, 'game'), join(outDir, 'game'));
if (gameFiles.length === 0) die('game/ is empty');
if (!gameFiles.includes('index.html')) die('game/ holds no index.html: the page the browser opens');

// The game plays offline: no network address anywhere in its files.
for (const name of gameFiles) {
  const text = readFileSync(join(outDir, 'game', name), 'utf8');
  if (text.includes('http://') || text.includes('https://')) {
    die(`game/${name} names a network address: the game must play offline`);
  }
}

const shots = mirror(join(here, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  die(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3 or 4, real renders of the game`);
}
for (const name of shots) {
  if (!SAFE_NAME.test(name)) die(`screenshots/${name}: names are letters, digits and . _ -, 1 to 128 characters`);
  const bytes = readFileSync(join(outDir, 'screenshots', name));
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpeg) die(`screenshots/${name} is neither a PNG nor a JPEG`);
  if (bytes.length > SHOT_CAP.max_bytes) die(`screenshots/${name} is ${bytes.length} bytes, over the ${SHOT_CAP.max_bytes} a screenshot may be`);
}

// The dossier goes last: the scorer rebuilds it from this output and compares bytes.
const dossierPath = join(outDir, 'dossier.json');
try { chmodSync(dossierPath, 0o644); } catch { /* first run: no dossier yet */ }
writeFileSync(dossierPath, buildDossier(outDir, { text_max_bytes: TEXT_CAP_BYTES, screenshots: SHOT_CAP, game: GAME_CAP }));

process.stdout.write(
  `merapi dawn run: wrote ${join(outDir, 'game')} (${gameFiles.length} files), ${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
