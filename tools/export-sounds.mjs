// Exports every sound the game makes as a WAV file: npm run export-sounds [-- <folder>]
//
// The game makes its sounds in code as it plays (game/src/audio). This renders
// them with that same code, offline in headless Chrome (game/src/audio/render.ts),
// and writes them to sound-export/ (or <folder>) to listen to or open in an
// audio editor. Editing a file there doesn't change the game.
//
// Needs Chrome or Chromium (set CHROME=/path/to/chrome if it isn't found), and
// the compiled game: run npm run build first after changing a sound.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { delimiter, dirname, extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const GAME = join(ROOT, 'game');
const OUT = resolve(ROOT, process.argv[2] ?? 'sound-export');
const PROFILE = join(ROOT, '.tmp', 'export-sounds-chrome');
const FOLDERS = ['interface', 'typing', 'computer', 'song', 'hum', 'music'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json', '.wav': 'audio/wav', '.json': 'application/json' };

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Chrome or Chromium: $CHROME, else the usual names on the PATH, else the usual install places. */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of names) {
      for (const file of [join(dir, name), join(dir, `${name}.exe`)]) if (existsSync(file)) return file;
    }
  }
  const installed = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return installed.find((file) => existsSync(file));
}

/** Serves the game folder (and an empty page to run the export in) on a free port. */
function serve() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    if (path === '/export') {
      response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><meta charset="utf-8"><title>Sound export</title>');
      return;
    }
    const file = normalize(join(GAME, path));
    if (!file.startsWith(GAME) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

/** Headless Chrome, and a DevTools connection to its page: send(method, params). */
async function openChrome(chrome) {
  rmSync(PROFILE, { recursive: true, force: true });
  mkdirSync(PROFILE, { recursive: true });
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-breakpad', 'about:blank'];
  const process_ = spawn(chrome, args, { stdio: 'ignore' });
  const exited = new Promise((done) => process_.once('exit', done));
  // Chrome writes the port it chose into the profile.
  const portFile = join(PROFILE, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0];
  let pages = [];
  for (let i = 0; i < 50 && pages.length === 0; i++) {
    pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((page) => page.type === 'page');
    if (pages.length === 0) await sleep(100);
  }
  const socket = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((done) => socket.addEventListener('open', done));
  let id = 0;
  const waiting = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  });
  const send = (method, params = {}) =>
    new Promise((done) => {
      waiting.set(++id, done);
      socket.send(JSON.stringify({ id, method, params }));
    });
  // Closing asks Chrome to quit (killing it leaves helpers writing to its profile) and waits until it has.
  const close = async () => {
    socket.close();
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const browser = new WebSocket(webSocketDebuggerUrl);
    await new Promise((done) => browser.addEventListener('open', done));
    browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await Promise.race([exited, sleep(5000).then(() => process_.kill())]);
  };
  return { send, close };
}

/** Runs `expression` (a promise) in the page and returns its value, or throws its error. */
async function run(send, expression) {
  const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

const chrome = findChrome();
if (!chrome) {
  console.error('Chrome or Chromium not found: set CHROME=/path/to/chrome');
  process.exit(1);
}
if (!existsSync(join(GAME, 'js', 'audio', 'render.js'))) {
  console.error('The compiled game is missing: run npm run build first.');
  process.exit(1);
}

const server = await serve();
const { send, close } = await openChrome(chrome);
try {
  await send('Page.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/export` });
  await sleep(500);
  const load = "import('/js/audio/render.js')";
  const files = await run(send, `${load}.then((m) => m.soundFiles())`);
  // Last time's files go, so a renamed sound doesn't leave its old file behind.
  for (const folder of FOLDERS) rmSync(join(OUT, folder), { recursive: true, force: true });
  let bytes = 0;
  for (const file of files) {
    const sound = await run(send, `${load}.then((m) => m.renderSound(${JSON.stringify(file)}))`);
    const wav = Buffer.from(sound.wav, 'base64');
    mkdirSync(dirname(join(OUT, file)), { recursive: true });
    writeFileSync(join(OUT, file), wav);
    bytes += wav.length;
    const level = sound.peak > 0 ? `${(20 * Math.log10(sound.peak)).toFixed(1)} dB` : 'silent';
    console.log(`${file.padEnd(30)} ${sound.seconds.toFixed(2).padStart(6)} s  ${sound.channels === 1 ? 'mono  ' : 'stereo'}  peak ${level}`);
  }
  writeFileSync(
    join(OUT, 'README.txt'),
    [
      'Every sound Bit Cycler makes, as WAV files (16-bit, 44.1 kHz).',
      '',
      'Made by `npm run export-sounds` from the game\'s own code (game/src/audio):',
      'the game makes these sounds as it plays, so editing a file here does not',
      'change the game. Levels are the game\'s own at 100% volume. Typing and the',
      'drives are random in the game; each file is one take. The song\'s sounds and',
      'music are at the first pipelined CPU\'s tempo (about 87 BPM); in the game the',
      'tempo follows the clock.',
      '',
      '  interface/  menu sounds          typing/  keys (recordings)',
      '  computer/   boot, power, chime   song/    hits, stalls, mistakes, memory waits, metronome',
      '  hum/        the menus\' hum       music/   the song\'s music, 1 to 5 layers',
      '',
    ].join('\n'),
  );
  console.log(`\n${files.length} files, ${(bytes / 1e6).toFixed(1)} MB, in ${OUT}`);
} finally {
  await close();
  server.close();
  // Chrome's helpers can take a moment more to let go of its profile.
  for (let i = 0; existsSync(PROFILE); i++) {
    try {
      rmSync(PROFILE, { recursive: true, force: true });
    } catch (error) {
      if (i >= 20) console.warn(`Couldn't remove ${PROFILE}: ${error.message}`);
      if (i >= 20) break;
      await sleep(250);
    }
  }
}
