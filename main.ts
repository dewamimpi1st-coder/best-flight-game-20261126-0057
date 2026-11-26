// Merapi Ring Run — a make.fun flight-game entry (Node 22, standard library only).
//
// The program copies this repository's game/ and screenshots/ to the output
// directory and writes /output/dossier.json, the summary the judge reads,
// with the vendored make.fun library. It reads nothing from /input, makes no
// network request, and writes the same bytes on every run: the game files are
// copied as they are and the dossier is canonical JSON over them.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const GAME_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string): never {
  process.stderr.write(`merapi ring run: ${message}\n`);
  process.exit(1);
}

const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** Copy one directory tree's regular files into `to`, skipping names that start with a dot. */
function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      if (!PLAIN_NAME.test(name)) fail(`${rel}${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) {
        mkdirSync(join(to, rel, name), { recursive: true });
        walk(path, `${rel}${name}/`);
      } else if (st.isFile()) {
        copyFileSync(path, join(to, rel, name));
        copied.push(`${rel}${name}`);
      } else {
        fail(`${rel}${name}: neither a file nor a directory`);
      }
    }
  };
  walk(from, '');
  return copied.sort();
}

const gameFiles = copyTree(join(here, 'game'), join(out, 'game'));
if (!gameFiles.includes('index.html')) fail('game/ holds no index.html: the page the browser opens');
if (gameFiles.length === 0) fail('game/ is empty');

// The game plays offline: no http:// or https:// address anywhere in its files.
for (const name of gameFiles) {
  const text = readFileSync(join(out, 'game', name), 'utf8');
  if (text.includes('http://') || text.includes('https://')) {
    fail(`game/${name} names a network address: the game must play offline`);
  }
}

const shots = copyTree(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3 or 4, real renders of the game`);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  const bytes = readFileSync(join(out, 'screenshots', name));
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) fail(`screenshots/${name} is neither a PNG nor a JPEG`);
  if (bytes.length > SCREENSHOT_CAPS.max_bytes) fail(`screenshots/${name} is ${bytes.length} bytes, over the ${SCREENSHOT_CAPS.max_bytes} a screenshot may be`);
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, game: GAME_CAPS }));

process.stdout.write(
  `merapi ring run: wrote ${join(out, 'game')} (${gameFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
