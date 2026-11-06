// Deterministic frame-by-frame renderer: Playwright drives window.renderAt(t), ffmpeg encodes.
//   node render.mjs                         -> out/from-idea-to-app.mp4 (15s @ 60fps, lossless PNG frames)
//   node render.mjs --web                   -> also out/from-idea-to-app_web.mp4 (small, for sharing)
//   node render.mjs --jpeg                  -> fast draft: JPEG q95 frames instead of PNG
//   node render.mjs --workers 8             -> number of parallel browsers (default: ~cores/3, max 12)
//   node render.mjs --web-only              -> just re-encode an existing master to the web copy
//   node render.mjs --stills 1.5,4.6,8.9    -> out/stills/t_01.50.png ...
//   node render.mjs --from 6 --to 9.5       -> partial clip
//   node render.mjs --angle gl              -> override the GPU backend
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './server.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const stills = arg('stills');
const FPS = Number(arg('fps', 60));
const from = Number(arg('from', 0));
const to = Number(arg('to', 15));
const out = arg('out', 'out/from-idea-to-app.mp4');
const webOut = out.replace(/\.mp4$/i, '') + '_web.mp4';
const JPEG = flag('jpeg');
const cores = os.availableParallelism?.() ?? os.cpus().length;
const WORKERS = Math.max(1, Number(arg('workers', Math.min(12, Math.max(1, Math.floor(cores / 3))))));
// Headless Chromium falls back to SwiftShader (software) unless told to use the real GPU.
const ANGLE = arg('angle', { win32: 'd3d11', darwin: 'metal', linux: 'vulkan' }[process.platform] ?? 'default');

const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  p.on('error', reject);
  p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
});
async function encodeWeb() {
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', webOut]);
  console.log(`wrote ${webOut} (${(fs.statSync(webOut).size / 1e6).toFixed(1)} MB)`);
}

if (flag('web-only')) {
  if (!fs.existsSync(out)) throw new Error(`${out} not found — render it first`);
  await encodeWeb();
  process.exit(0);
}

const server = await startServer(0);
const url = `http://127.0.0.1:${server.address().port}/index.html?render`;
const errors = [];
const browsers = [];

async function openWorker(id, jpeg) {
  const browser = await chromium.launch({
    headless: true,
    args: [`--use-angle=${ANGLE}`, '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[w${id} ${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[w${id} pageerror] ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const canvas = await page.$('canvas');
  const shot = jpeg ? { type: 'jpeg', quality: 95 } : { type: 'png' };
  return {
    meta: await page.evaluate(() => window.__meta),
    async grab(t) {
      await page.evaluate((t) => window.renderAt(t), t);
      return canvas.screenshot(shot);
    },
  };
}
function reportGpu(meta) {
  console.log('GPU:', meta.gpu, '| shapes', meta.shapes, '| orbs', meta.orbs);
  if (/swiftshader|llvmpipe/i.test(meta.gpu)) console.log('warning: software rendering — this will be very slow. Try --angle gl (or d3d11 / metal / vulkan).');
}

try {
  if (stills) {
    const w = await openWorker(0, false); // stills are always lossless PNG
    reportGpu(w.meta);
    fs.mkdirSync('out/stills', { recursive: true });
    for (const s of stills.split(',').map(Number)) {
      const f = `out/stills/t_${s.toFixed(2).padStart(5, '0')}.png`;
      fs.writeFileSync(f, await w.grab(s));
      console.log('wrote', f);
    }
  } else {
    const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS), total = f1 - f0;
    const n = Math.min(WORKERS, total);
    const t0 = Date.now();
    const workers = await Promise.all(Array.from({ length: n }, (_, i) => openWorker(i, JPEG)));
    reportGpu(workers[0].meta);
    console.log(`${n} worker${n > 1 ? 's' : ''}, ${JPEG ? 'JPEG q95 (draft)' : 'lossless PNG'} frames, ${total} frames, ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    fs.mkdirSync(path.dirname(out), { recursive: true });
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', JPEG ? 'mjpeg' : 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-movflags', '+faststart', out,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const ffDone = new Promise((resolve, reject) => {
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    });

    // Worker k renders frames f0+k, f0+k+n, ...; the writer feeds ffmpeg strictly in order.
    // Backpressure: a worker may run at most LIMIT frames ahead of the writer.
    const LIMIT = n * 3;
    const slots = new Map();
    const slot = (f) => {
      if (!slots.has(f)) { let resolve; const promise = new Promise((r) => (resolve = r)); slots.set(f, { promise, resolve }); }
      return slots.get(f);
    };
    let written = f0;
    let room = [];
    const waitForRoom = (f) => (f - written < LIMIT ? null : new Promise((r) => room.push([f, r])));
    const tr = Date.now();

    const workerLoops = workers.map(async (w, k) => {
      for (let f = f0 + k; f < f1; f += n) {
        const wait = waitForRoom(f);
        if (wait) await wait;
        slot(f).resolve(await w.grab(f / FPS));
      }
    });
    const writer = (async () => {
      for (let f = f0; f < f1; f++) {
        const buf = await slot(f).promise;
        slots.delete(f);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        written = f + 1;
        room = room.filter(([g, r]) => (g - written < LIMIT ? (r(), false) : true));
        const done = f - f0 + 1;
        if (done % 60 === 0 || done === total) {
          const el = (Date.now() - tr) / 1000;
          console.log(`frame ${f + 1}/${f1}  ${((el / done) * 1000).toFixed(0)} ms/frame  eta ${((total - done) * el / done).toFixed(0)}s`);
        }
      }
      ff.stdin.end();
    })();
    await Promise.all([...workerLoops, writer, ffDone]);
    console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    if (flag('web')) await encodeWeb();
  }
  if (errors.length) console.log(`${errors.length} console warnings/errors:\n` + errors.slice(0, 10).join('\n'));
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  server.close();
}
