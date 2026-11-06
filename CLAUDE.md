# motion3js

A collection of independent motion-graphics projects, one per subfolder (for example `idea-to-app/`). The git repo root is this folder.

- New projects go in a new sibling subfolder, never at the repo root. Each has its own `package.json`, `node_modules` and `vercel.json`. On Vercel, each project is imported separately with **Root Directory** set to its folder.
- Start new projects from `idea-to-app/` and follow the playbook below. Reuse `src/lib.js`, `render.mjs`, `server.mjs`, `scripts/build.mjs` and the engine half of `src/main.js`.
- Before a full render, review still frames and run the scrambled-order determinism check.
- Commit only when asked. The owner pushes to GitHub themselves.
- Environment: Windows with Git Bash. `python` is the Microsoft Store stub and hangs, so script with `node` instead. ffmpeg 9 is on `PATH`. Bun 1.4.4 is installed.

@PLAYBOOK.md
