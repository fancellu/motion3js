# Motion-graphics playbook

Lessons from building [`idea-to-app`](idea-to-app/), and how to start the next project from it. Each lesson notes how it was found: by measuring, or by spotting a problem in a still frame.

## Starting a new project

1. Copy `idea-to-app/` to a new sibling folder, leaving out `node_modules/`, `out/` and `dist/`. Change `name` and `description` in its `package.json`.
2. These files work unchanged, so keep them:

   | File | What it is |
   | --- | --- |
   | `src/lib.js` | Easing, seeded random numbers, canvas helpers, `slabGeometry`, `frosted()` glass, the `Panel` class |
   | `render.mjs` | Parallel Playwright + ffmpeg renderer, stills or video |
   | `server.mjs` | Static server for preview and render |
   | `scripts/build.mjs` | Single-file `dist/index.html` build |
   | `index.html` | Fonts, import map, preview scaling |
   | `vercel.json` | Vercel build settings |
   | `.gitignore` | Ignores `node_modules/`, `out/`, `dist/` |

3. `src/main.js` is half engine and half story:
   - **Keep (engine):**
     - the renderer;
     - the dome and environment map;
     - `cameraAt` and `holdState`;
     - the tube shader and its progress mapping;
     - scatter rejection sampling;
     - the post chain, `update`, `renderAt` and `boot`.
   - **Replace (story):**
     - `sceneDefs`, for where each scene sits and how its camera frames it;
     - `holds`, for the camera timeline;
     - `WIDE`, for the final shot;
     - the tube anchor points;
     - the dome blob colours.
4. Write new scenes in `src/scenes.js`. Each scene builder returns `{ group, panels, update(t) }`.
5. Follow the [workflow](#workflow) below: stills first, then the determinism check, then the full render.

If a third project ends up copying the same engine, move `lib.js` and the engine half of `main.js` into a shared folder.

## The determinism contract

Every pixel must be a pure function of `t`. Breaking this costs more than it looks: parallel rendering draws frames out of order, so anything that depends on render history produces wrong frames.

- **Set every value from `t` on every frame.** Don't accumulate state from one frame to the next. Adding to a value with `+=` is only safe straight after something in the same frame has reset it.
- **No `Math.random`, `performance.now` or `Date`** in anything that renders. Use `mulberry32(seed)` from `lib.js`, and seed the film grain from the frame number.
- **Use closed-form physics, not step-by-step simulation.** The confetti uses ballistic motion with linear drag: `x = x0 + v0·(1−e^(−kτ))/k`, and for height add the gravity term `−(g/k)·τ`. A step-by-step simulation would depend on which frames had been drawn.
- **Use Chromium's CPU canvas for every per-frame canvas:** `getContext('2d', { willReadFrequently: true })`. *(Found by measurement.)* The default GPU-accelerated 2D canvas caches text and shadows between draws. Drawing the same `t` twice in one browser gave different pixels from the first text-with-shadow onwards. The CPU canvas costs about 10% per frame.
- **Test with frames in a scrambled order, not by repeating one frame.** The first check rendered one frame in two fresh sessions. That passed, because both drew that frame first, and so it hid the canvas bug. The test that works: render N frames in order in one browser, then in a scrambled order in another, and compare the PNG hashes.
- **To compare finished videos**, hash the decoded frames with `ffmpeg -i a.mp4 -f framemd5 -`. H.264 frames refer back to earlier frames, so one bad frame makes every later frame differ. To find the first real difference, compare the captured PNGs, not the encoded video.

## Rendering pipeline

- **Headless Chromium uses software rendering (SwiftShader) unless told otherwise.** Pass `--use-angle=d3d11` on Windows, `metal` on macOS or `vulkan` on Linux, plus `--enable-gpu --ignore-gpu-blocklist`. Check `WEBGL_debug_renderer_info` to see which GPU you got. `render.mjs` does all this.
- **Capture is the bottleneck, not the GPU.** *(Measured on an RTX 4090.)*

  | Stage | Time per frame |
  | --- | --- |
  | Drawing the frame | ~26 ms |
  | PNG screenshot | ~556 ms |
  | x264 encode (CRF 14, preset slow) | ~22 ms |
  | JPEG q95 screenshot | ~74 ms |

  Film grain makes each frame nearly incompressible, about 2.7 MB as PNG.
- **Run browsers in parallel.** Worker `k` renders frames `k, k+N, …`, and a reorder buffer feeds them to a single ffmpeg in order. This gives one encode with no joins. With 32 cores, frame time fell from 577 ms with 1 worker to 173 ms with 4, 91 ms with 8, 61 ms with 12 and 52 ms with 16. A full 900-frame render takes about 68 s with 10 workers, compared with 576 s with 1.
- **Use JPEG capture for drafts** (`--jpeg`). It is about twice as fast again when running in parallel. Keep PNG for the master.
- **Render a few warm-up frames from every scene in `boot()`** so shaders compile before capture begins.
- **Load fonts locally and explicitly.** Use `@font-face` with local `woff2` files, then `await document.fonts.load(...)` for every weight before marking the page ready. Drawing to a canvas does not trigger font loading by itself. Apple only licenses SF Pro for Apple platforms, so the stack lists SF Pro first and falls back to a bundled Inter.
- **Mind the output sizes.** The master MP4 is about 200 MB, which is over GitHub's 100 MB file limit, so `out/` is gitignored. A CRF 22 web copy is about 7 MB (`npm run render:web`).
- **Bun 1.4.4 works** and gives identical output, about 9% faster on one run. Bun 1.3.x timed out launching Chromium through Playwright.

## Three.js lessons

**Glass and layering**

- **Glass only refracts opaque objects.** Transmission renders opaque objects into a buffer, then draws transmissive objects, then transparent ones. Glass therefore can't show other glass, or text planes, behind it. Lay scenes out so glass never needs to show glass behind it.
- **Draw UI as a transparent plane 0.004 units in front of the slab.** It renders after the glass, so text sits sharply on top of frosted glass.
- **Overlays fixed to the camera:** call `camera.add(hud)`, and also `scene.add(camera)` or the overlay won't render. To darken the scene behind a glass element in the overlay, put the scrim further from the camera than the glass, with depth testing on. The glass writes depth first, so the scrim can't cover it.
- **Size overlays from the frustum.** Visible height at distance `d` is `2·d·tan(fov/2)`, and visible width is that times the aspect ratio. *(Found in a still.)* The first title was sized at depth 6 and filled about 95% of the screen width. At depth 10 it fits.

**Tone mapping and bloom**

- **With `EffectComposer`, tone mapping happens in `OutputPass`.** Materials render linear HDR, so their `toneMapped` setting has no effect. Neutral tone mapping maps white (1.0) to about 0.87 linear, roughly 240 out of 255.
- **Set the bloom threshold just above 1.0** (`UnrealBloomPass(res, 0.55, 0.45, 1.05)`). UI white then never blooms, and only HDR highlights do: the tube head at 7×, orbs at 2.5–7×, and specular highlights. The pass order is: half-float render target with 4× MSAA → bloom → `OutputPass` → a final grade (chromatic aberration, vignette, grain) applied to display-space colours.
- **Keep the visible dome dim.** *(Found in a still.)* At an intensity of 0.42 the "dark space" looked like a bright gradient wallpaper. Use about 0.2, with tighter blobs (`pow(dot, 9–12)`). Light the glass from a separate, brighter copy (1.6) plus soft boxes, prefiltered once with PMREM.

**Text**

- **Use design units of 100 per world unit** for canvas drawing, and about 220–300 canvas pixels per world unit. That is roughly 1.7× the on-screen size, which keeps text sharp. Set `anisotropy` to the maximum and `colorSpace` to sRGB.
- **Make text readable on glass.** Put a faint dark tint behind it (`rgba(14,12,26,0.3)`) with a crisp white border. Make code editors darker (0.66). Chromatic aberration grows towards the edges, so keep text away from them. CA 0.0045 and grain 0.03 are subtle; the first pass (0.0065 and 0.045) visibly fringed the labels.
- **Check that text fits its panel.** *(Found in a still.)* "Built with Claude Code" at 22 px overflowed a 275-unit pill. Estimate the width as about 0.55 × font size × number of characters.

**Camera and paths**

- **Camera:** each scene has a hold with a slow linear drift. `easeInOutExpo` whips move between holds, plus a small arc and roll. The expo curve barely moves for the first 30%, which gives the "drift, then snap" feel. Mid-whip frames show only background. That is expected without motion blur.
- **Key path progress to the same times as the camera.** The tube's head then travels with the shot. `TubeGeometry` builds on `getPointAt`, so `uv.x` is the fraction of length along the curve. To convert control point `i` to that fraction, look it up in `getLengths()` at `t = i/(n−1)`.
- **Keep scattered objects out of shot by rejection sampling.** Sample the camera every 0.02 s. Reject a candidate if it is within 4 units of the camera, inside the widening cone from the camera to its target (radius 1.6 growing to 6.2), within 7.5 units of a scene centre, or inside the wide shot's cone to each scene.
- **Check for neighbouring scenes in frame.** *(Found in a still.)* With scenes 12 units apart, the edge of one appeared in the next one's frame. Space them about 14 or more units apart, or turn the scenes so each camera looks away from its neighbours.
- **Bursts like confetti shouldn't cover the UI.** *(Found in a still.)* The first burst was aimed at the camera and hid the phone screen. Start it behind the subject and send it sideways and up.

## Workflow

1. Write the scenes, then run `npm run stills` and tile them into one image to review together:

   ```bash
   ffmpeg -i a.png -i b.png ... -filter_complex "[0]scale=960:540[s0];...;[s0][s1]...xstack=inputs=12:layout=..." sheet.png
   ```

2. Include frames from the middle of whips and from each scene's last moment, not only settled shots. Check that the text is inside the frame, readable, not overflowing, and not covered by anything.
3. Run the scrambled-order determinism check described above.
4. Run `npm run render:draft` for a quick look at the motion, then `npm run render:web` for the master and the web copy.
5. Check frames pulled from the encoded MP4, not only the PNGs: `ffmpeg -i out.mp4 -vf "select='eq(n,350)+eq(n,700)',tile=2x1" -frames:v 1 check.png`.
6. Run `npm run build` for the single-file site. Before relying on it, open `dist/index.html` from disk with network requests blocked.
