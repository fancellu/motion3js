import * as THREE from 'three';
import {
  Panel, frosted, panelFace, drawCheck, drawArrow, rr, font, MONO, ACCENT, GREEN,
  clamp, lerp, prog, easeOutCubic, easeOutExpo, easeOutBack, easeInOutCubic, spring, mulberry32,
} from './lib.js';

// ======================================================================
// Shared: big "STEP 0X / Word" label (canvas only, no glass)
// ======================================================================
export function makeLabel(step, word, t0, w = 6.2) {
  return new Panel({
    w, h: 1.6, material: null, ppu: 240, range: [t0, t0 + 0.9],
    draw(c, t, W, H) {
      const a = easeOutExpo(prog(t, t0, t0 + 0.55));
      const b = easeOutExpo(prog(t, t0 + 0.12, t0 + 0.8));
      // STEP 0X — wipe in from the left
      c.save();
      c.beginPath();
      c.rect(0, 0, 12 + (W - 12) * a, 70);
      c.clip();
      c.font = font(700, 30);
      c.letterSpacing = '7px';
      c.shadowColor = 'rgba(255,138,76,0.55)';
      c.shadowBlur = 16;
      c.fillStyle = ACCENT;
      c.fillText(`STEP ${step}`, 8, 44);
      c.restore();
      // big white word — rises through a mask
      c.save();
      c.beginPath();
      c.rect(0, 58, W, H - 58);
      c.clip();
      c.globalAlpha = b;
      c.font = font(800, 92);
      c.letterSpacing = '-2px';
      c.fillStyle = '#ffffff';
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowBlur = 18;
      c.fillText(word, 4, 145 + (1 - b) * 70);
      c.restore();
    },
  });
}

// ======================================================================
// Scene 1 — Describe it (0–3s)
// ======================================================================
export function sceneDescribe() {
  const g = new THREE.Group();
  const panels = [];
  const PROMPT = 'Build me a habit tracker with streaks.';
  const REPLY = "On it. Here's the plan.";
  const T = { barIn: 0.0, typeA: 0.3, typeB: 1.4, send: 1.5, bubble: 1.78, dotsEnd: 2.2, replyB: 2.5 };

  const label = makeLabel('01', 'Describe it', 0.08);
  label.group.position.set(-3.4 + 3.1, 2.55, 0.35);
  g.add(label.group); panels.push(label);

  const glass = frosted({ roughness: 0.4, thickness: 0.6 });

  const bar = new Panel({
    w: 6.8, h: 1.0, radius: 0.5, depth: 0.22, material: glass, range: [0, 3.0],
    draw(c, t, W, H) {
      panelFace(c, W, H, H / 2);
      const n = Math.floor(PROMPT.length * prog(t, T.typeA, T.typeB));
      const txt = PROMPT.slice(0, n);
      c.font = font(500, 30);
      c.letterSpacing = '-0.3px';
      let x = 40;
      if (n === 0) {
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.fillText('Ask Claude Code…', x, 61);
      } else {
        c.fillStyle = '#ffffff';
        c.fillText(txt, x, 61);
        x += c.measureText(txt).width + 3;
      }
      // blinking cursor: solid while typing, blinking otherwise
      const typing = t > T.typeA && t < T.typeB + 0.05;
      const on = typing || Math.floor(t / 0.45) % 2 === 0;
      if (on && t < T.send + 0.1) {
        c.fillStyle = ACCENT;
        c.fillRect(n === 0 ? 38 : x, 33, 3, 36);
      }
      // send button
      const lit = easeOutCubic(prog(t, T.send, T.send + 0.18));
      const press = 1 - 0.14 * Math.sin(Math.PI * prog(t, T.send, T.send + 0.28));
      const bx = W - 52, by = H / 2, br = 31 * press;
      c.save();
      if (lit > 0) { c.shadowColor = 'rgba(255,138,76,0.95)'; c.shadowBlur = 34 * lit; }
      c.beginPath();
      c.arc(bx, by, br, 0, Math.PI * 2);
      c.fillStyle = lit > 0 ? `rgba(255,138,76,${0.12 + 0.88 * lit})` : 'rgba(255,255,255,0.10)';
      c.fill();
      c.restore();
      c.beginPath();
      c.arc(bx, by, br, 0, Math.PI * 2);
      c.lineWidth = 2;
      c.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * lit})`;
      c.stroke();
      // up arrow
      c.save();
      c.translate(bx, by);
      c.rotate(-Math.PI / 2);
      drawArrow(c, -11 * press, 0, 22 * press, '#ffffff', 3.5);
      c.restore();
    },
  });
  bar.group.position.set(0, -1.15, 0);
  g.add(bar.group); panels.push(bar);

  const bubble = new Panel({
    w: 5.0, h: 1.15, radius: 0.3, depth: 0.18, material: frosted({ roughness: 0.42 }), range: [T.bubble, 3.0],
    draw(c, t, W, H) {
      panelFace(c, W, H, 30);
      // avatar
      c.save();
      c.shadowColor = 'rgba(255,138,76,0.8)';
      c.shadowBlur = 14;
      c.beginPath();
      c.arc(54, H / 2, 27, 0, Math.PI * 2);
      c.fillStyle = ACCENT;
      c.fill();
      c.restore();
      c.save();
      c.translate(54, H / 2);
      c.strokeStyle = '#fff';
      c.lineWidth = 3.2;
      c.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        c.rotate(Math.PI / 3);
        c.beginPath(); c.moveTo(0, 4); c.lineTo(0, 13); c.stroke();
      }
      c.restore();
      c.font = font(600, 18);
      c.fillStyle = 'rgba(255,255,255,0.62)';
      c.fillText('Claude Code', 100, 43);
      if (t < T.dotsEnd) {
        for (let i = 0; i < 3; i++) {
          const k = Math.max(0, Math.sin(t * 11 - i * 0.9));
          c.beginPath();
          c.arc(108 + i * 24, 76 - k * 7, 6.5, 0, Math.PI * 2);
          c.fillStyle = `rgba(255,255,255,${0.45 + 0.55 * k})`;
          c.fill();
        }
      } else {
        const n = Math.ceil(REPLY.length * easeOutCubic(prog(t, T.dotsEnd, T.replyB)));
        c.font = font(600, 29);
        c.letterSpacing = '-0.3px';
        c.fillStyle = '#ffffff';
        c.fillText(REPLY.slice(0, n), 100, 84);
      }
    },
  });
  bubble.group.position.set(-0.85, 0.42, 0.3);
  g.add(bubble.group); panels.push(bubble);

  return {
    group: g, panels,
    update(t) {
      bar.appear(prog(t, T.barIn, T.barIn + 0.45), { from: 0.85, dy: -0.4 });
      bubble.appear(prog(t, T.bubble, T.bubble + 0.42), { from: 0.6, dy: -0.5, dx: -0.4 });
      // slow float
      bar.group.position.y = -1.15 + 0.04 * Math.sin(t * 1.3);
      bubble.group.rotation.y = 0.05 * Math.sin(t * 0.9);
      for (const p of panels) p.update(t);
    },
  };
}

// ======================================================================
// Scene 2 — Plan it (3–6s)
// ======================================================================
export function scenePlan() {
  const g = new THREE.Group();
  const panels = [];
  const S = 3.0; // local time origin
  const tasks = [
    'Scaffold React + Vite app',
    'Model habits & local storage',
    'Compute daily streaks',
    'Build the check-in UI',
    'Write tests & ship',
  ];
  const slideAt = (i) => S + 0.22 + i * 0.13;
  const tickAt = (i) => S + 1.25 + i * 0.25;

  const label = makeLabel('02', 'Plan it', S + 0.15);
  label.group.position.set(-3.2 + 3.1, 3.0, 0.45);
  g.add(label.group); panels.push(label);

  const glass = frosted({ roughness: 0.4, thickness: 0.5 });
  const cards = tasks.map((task, i) => {
    const p = new Panel({
      w: 5.9, h: 0.74, radius: 0.2, depth: 0.16, material: glass, range: [slideAt(i), tickAt(i) + 0.6],
      draw(c, t, W, H) {
        const q = prog(t, tickAt(i), tickAt(i) + 0.38);
        panelFace(c, W, H, 20, { fill: `rgba(14,12,26,${0.3 + 0.08 * q})` });
        // index / check circle
        const cx = 40, cy = H / 2;
        const fillP = easeOutBack(prog(q, 0, 0.45), 2);
        c.beginPath();
        c.arc(cx, cy, 16, 0, Math.PI * 2);
        c.lineWidth = 2;
        c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - q)})`;
        c.stroke();
        if (fillP > 0) {
          c.save();
          c.shadowColor = 'rgba(255,138,76,0.9)';
          c.shadowBlur = 14;
          c.beginPath();
          c.arc(cx, cy, 16 * fillP, 0, Math.PI * 2);
          c.fillStyle = ACCENT;
          c.fill();
          c.restore();
        }
        if (q < 0.3) {
          c.font = font(600, 16);
          c.textAlign = 'center';
          c.fillStyle = `rgba(255,255,255,${0.8 * (1 - q / 0.3)})`;
          c.fillText(String(i + 1), cx, cy + 6);
          c.textAlign = 'left';
        }
        drawCheck(c, cx, cy, 15, prog(q, 0.25, 0.75), '#fff', 3.2);
        // task text + strikethrough
        c.font = font(500, 25);
        c.letterSpacing = '-0.2px';
        const sp = easeOutCubic(prog(q, 0.35, 1));
        c.fillStyle = `rgba(255,255,255,${1 - 0.42 * sp})`;
        c.fillText(task, 76, 46);
        const tw = c.measureText(task).width;
        if (sp > 0) {
          c.fillStyle = 'rgba(255,255,255,0.9)';
          c.fillRect(74, 36.5, (tw + 4) * sp, 2.6);
        }
        // status
        c.font = font(500, 15, MONO);
        c.textAlign = 'right';
        if (sp > 0.5) {
          c.fillStyle = ACCENT;
          c.fillText('done', W - 26, 43);
        } else {
          c.fillStyle = 'rgba(255,255,255,0.38)';
          c.fillText('todo', W - 26, 43);
        }
        c.textAlign = 'left';
      },
    });
    p.group.position.set(0.25 + 0.16 * i, 1.65 - 0.87 * i, -0.5 * i);
    g.add(p.group); panels.push(p);
    return p;
  });

  return {
    group: g, panels,
    update(t) {
      cards.forEach((p, i) => {
        p.appear(prog(t, slideAt(i), slideAt(i) + 0.55), { from: 0.92, dx: 4.5, dy: 0, dz: 0.6 });
        const q = prog(t, tickAt(i), tickAt(i) + 0.4);
        p.inner.position.z += 0.18 * Math.sin(Math.PI * q);
        p.inner.rotation.x = 0.03 * Math.sin(t * 1.1 + i);
      });
      for (const p of panels) p.update(t);
    },
  };
}

// ======================================================================
// Scene 3 — Build it (6–9.5s)
// ======================================================================
const C = {
  kw: '#c792ea', str: '#ffb77a', fn: '#82aaff', tag: '#7fdbca', attr: '#ffcb6b',
  p: '#a9b1d6', v: '#eeeeff', num: '#f78c6c', comp: '#ffd479',
};
const CODE = [
  [['import', 'kw'], [' { ', 'p'], ['useState', 'v'], [' } ', 'p'], ['from', 'kw'], [' "react"', 'str'], [';', 'p']],
  [],
  [['export ', 'kw'], ['function ', 'kw'], ['HabitCard', 'comp'], ['({ ', 'p'], ['habit', 'v'], [' }) {', 'p']],
  [['  const ', 'kw'], ['[', 'p'], ['done', 'v'], [', ', 'p'], ['setDone', 'v'], ['] = ', 'p'], ['useState', 'fn'], ['(', 'p'], ['false', 'num'], [');', 'p']],
  [['  const ', 'kw'], ['streak', 'v'], [' = ', 'p'], ['habit', 'v'], ['.', 'p'], ['streak', 'v'], [' + (', 'p'], ['done', 'v'], [' ? ', 'p'], ['1', 'num'], [' : ', 'p'], ['0', 'num'], [');', 'p']],
  [],
  [['  return ', 'kw'], ['(', 'p']],
  [['    <button ', 'tag'], ['onClick', 'attr'], ['={() => ', 'p'], ['setDone', 'fn'], ['(!', 'p'], ['done', 'v'], [')}', 'p'], ['>', 'tag']],
  [['      <span>', 'tag'], ['{', 'p'], ['habit', 'v'], ['.', 'p'], ['name', 'v'], ['}', 'p'], ['</span>', 'tag']],
  [['      <b>', 'tag'], ['{', 'p'], ['streak', 'v'], ['}', 'p'], [' day streak', 'v'], ['</b>', 'tag']],
  [['    </button>', 'tag']],
  [['  );', 'p']],
  [['}', 'p']],
];
const CODE_LEN = CODE.reduce((n, l) => n + l.reduce((m, tk) => m + tk[0].length, 0) + 1, 0);

export function sceneBuild() {
  const g = new THREE.Group();
  const panels = [];
  const S = 6.0;
  const T = { edIn: S + 0.0, typeA: S + 0.45, typeB: S + 2.35, tests: S + 2.4, badge: S + 2.75 };

  const label = makeLabel('03', 'Build it', S + 0.2);
  label.group.position.set(-3.3 + 3.1, 3.3, 0.5);
  g.add(label.group); panels.push(label);

  const editor = new Panel({
    w: 6.6, h: 4.4, radius: 0.28, depth: 0.24, ppu: 240, range: [S - 0.5, T.badge + 0.6],
    material: frosted({ color: 0x9a9ab8, roughness: 0.36, thickness: 0.8, attenuationColor: 0x14141f, attenuationDistance: 0.9 }),
    draw(c, t, W, H) {
      panelFace(c, W, H, 28, { fill: 'rgba(7,7,14,0.66)' });
      // window dots
      ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
        c.beginPath(); c.arc(32 + i * 22, 30, 7, 0, Math.PI * 2); c.fillStyle = col; c.fill();
      });
      // tabs
      const tabs = ['HabitCard.jsx', 'App.jsx', 'useStreak.js'];
      let tx = 112;
      c.font = font(500, 15);
      tabs.forEach((name, i) => {
        const tw = c.measureText(name).width + 28;
        if (i === 0) {
          rr(c, tx, 14, tw, 32, 8);
          c.fillStyle = 'rgba(255,255,255,0.11)';
          c.fill();
          c.fillStyle = ACCENT;
          c.fillRect(tx + 10, 43, tw - 20, 2.5);
        }
        c.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,0.45)';
        c.fillText(name, tx + 14, 35);
        tx += tw + 6;
      });
      c.fillStyle = 'rgba(255,255,255,0.14)';
      c.fillRect(8, 56, W - 16, 1.5);
      // code, typed char by char
      let budget = Math.floor(CODE_LEN * prog(t, T.typeA, T.typeB));
      const y0 = 88, lh = 25, x0 = 70;
      c.font = font(400, 17.5, MONO);
      const cw = c.measureText('M').width;
      let cur = [x0, y0];
      for (let li = 0; li < CODE.length; li++) {
        if (li > 0 && budget <= 0) break;
        const y = y0 + li * lh;
        c.textAlign = 'right';
        c.fillStyle = 'rgba(255,255,255,0.26)';
        c.font = font(400, 14, MONO);
        c.fillText(String(li + 1), 46, y);
        c.textAlign = 'left';
        c.font = font(400, 17.5, MONO);
        let x = x0;
        for (const [txt, kind] of CODE[li]) {
          if (budget <= 0) break;
          const s = txt.slice(0, budget);
          budget -= s.length;
          c.fillStyle = C[kind];
          c.fillText(s, x, y);
          x += s.length * cw;
        }
        cur = [x, y];
        budget -= 1; // newline
      }
      const typingDone = t >= T.typeB;
      if (!typingDone || Math.floor(t / 0.45) % 2 === 0) {
        c.fillStyle = ACCENT;
        c.fillRect(cur[0] + 1, cur[1] - 16, 2.5, 21);
      }
      // footer status
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.fillRect(8, H - 44, W - 16, 1.5);
      c.font = font(500, 13.5, MONO);
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.fillText('main  ·  vite  ·  react 19', 26, H - 18);
      c.textAlign = 'right';
      if (t < T.tests) {
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.fillText(t < T.typeB ? 'writing…' : 'saved', W - 26, H - 18);
      } else if (t < T.badge) {
        c.fillStyle = '#ffd479';
        const dots = '.'.repeat(1 + (Math.floor((t - T.tests) / 0.1) % 3));
        c.fillText('npm test' + dots, W - 26, H - 18);
      } else {
        c.fillStyle = GREEN;
        c.fillText('12 passed  ·  0 failed', W - 26, H - 18);
      }
      c.textAlign = 'left';
    },
  });
  g.add(editor.group); panels.push(editor);

  const badge = new Panel({
    w: 3.0, h: 0.66, radius: 0.33, depth: 0.16, range: [T.badge, T.badge + 0.6],
    material: frosted({ color: 0xc9ffe6, roughness: 0.38 }),
    draw(c, t, W, H) {
      panelFace(c, W, H, H / 2, { fill: 'rgba(14,70,48,0.55)', border: 0.95 });
      const q = prog(t, T.badge + 0.05, T.badge + 0.4);
      c.save();
      c.shadowColor = 'rgba(61,220,151,0.95)';
      c.shadowBlur = 16;
      c.beginPath(); c.arc(38, H / 2, 19, 0, Math.PI * 2); c.fillStyle = GREEN; c.fill();
      c.restore();
      drawCheck(c, 38, H / 2, 17, q, '#ffffff', 3.6);
      c.font = font(700, 27);
      c.letterSpacing = '-0.3px';
      c.fillStyle = '#ffffff';
      c.fillText('12 tests passed', 72, 43);
    },
  });
  badge.group.position.set(1.95, 2.25, 0.65);
  g.add(badge.group); panels.push(badge);

  // Six orbiting file tiles
  const files = [
    ['App.jsx', '#82aaff'], ['HabitCard.jsx', '#7fdbca'], ['useStreak.js', '#ffd479'],
    ['storage.js', '#c792ea'], ['streak.test.js', GREEN], ['index.css', '#ff8fb1'],
  ];
  const tileGlass = frosted({ roughness: 0.4, thickness: 0.4 });
  const tiles = files.map(([name, col], i) => {
    const p = new Panel({
      w: 2.05, h: 0.54, radius: 0.16, depth: 0.12, material: tileGlass, range: [0, 0],
      draw(c, t, W, H) {
        panelFace(c, W, H, 16, { fill: 'rgba(14,12,26,0.42)' });
        rr(c, 16, 15, 17, 24, 4);
        c.fillStyle = col; c.fill();
        c.font = font(500, 19, MONO);
        c.fillStyle = '#ffffff';
        c.fillText(name, 44, 34);
      },
    });
    g.add(p.group); panels.push(p);
    return p;
  });

  return {
    group: g, panels,
    update(t) {
      editor.appear(prog(t, T.edIn - 0.2, T.edIn + 0.45), { from: 0.88, dy: -0.4 });
      editor.group.rotation.y = -0.04 * Math.sin(t * 0.7);
      badge.appear(prog(t, T.badge, T.badge + 0.5), { from: 0.4, dy: 0.0, dz: 0.8 });
      tiles.forEach((p, i) => {
        const th = (i / 6) * Math.PI * 2 + (t - S) * 0.62 + 0.25;
        const Rx = 4.7, Rz = 2.1, yc = -0.7, Ry = -2.05;
        p.group.position.set(Rx * Math.sin(th), yc + Ry * Math.cos(th) + 0.06 * Math.sin(t * 2 + i), Rz * Math.cos(th) + 0.2);
        p.group.rotation.set(0.12 * Math.cos(th), -0.45 * Math.sin(th), 0.05 * Math.sin(th));
        p.appear(prog(t, S + 0.15 + i * 0.07, S + 0.6 + i * 0.07), { from: 0.3, dy: 0 });
      });
      for (const p of panels) p.update(t);
    },
  };
}

// ======================================================================
// Scene 4 — Ship it (10–12.5s)
// ======================================================================
function drawFlame(c, x, y, s, col1, col2) {
  const path = (k) => {
    c.beginPath();
    c.moveTo(x, y - 24 * k);
    c.bezierCurveTo(x + 6 * k, y - 12 * k, x + 18 * k, y - 6 * k, x + 16 * k, y + 6 * k);
    c.bezierCurveTo(x + 14 * k, y + 16 * k, x + 6 * k, y + 20 * k, x, y + 20 * k);
    c.bezierCurveTo(x - 8 * k, y + 20 * k, x - 16 * k, y + 14 * k, x - 16 * k, y + 4 * k);
    c.bezierCurveTo(x - 16 * k, y - 6 * k, x - 6 * k, y - 10 * k, x, y - 24 * k);
  };
  path(s); c.fillStyle = col1; c.fill();
  c.save(); c.translate(0, 7 * s); path(s * 0.5); c.fillStyle = col2; c.fill(); c.restore();
}

export function sceneShip() {
  const g = new THREE.Group();
  const panels = [];
  const S = 9.7;
  const T = {
    swing: S + 0.0, count0: S + 0.55, count1: S + 1.55,
    habit: (j) => S + 0.85 + j * 0.2, bar: (k) => S + 1.0 + k * 0.07, burst: S + 1.6,
  };

  const label = makeLabel('04', 'Ship it', S + 0.25, 5.2);
  label.group.position.set(-4.75 + 2.6, 0.55, 0.5);
  g.add(label.group); panels.push(label);

  const habits = [['Drink water', '#5aa8ff'], ['Read 20 min', '#c792ea'], ['Morning run', GREEN], ['Meditate', '#ffd479']];
  const week = [0.45, 0.7, 0.55, 0.85, 0.62, 0.9, 1.0];

  const phone = new Panel({
    w: 2.7, h: 5.6, radius: 0.42, depth: 0.3, ppu: 300, range: [S, S + 2.6],
    material: frosted({ color: 0xdedef0, roughness: 0.3, thickness: 0.6 }),
    draw(c, t, W, H) {
      // bezel border + screen
      rr(c, 4, 4, W - 8, H - 8, 38);
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
      rr(c, 11, 11, W - 22, H - 22, 32);
      const bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, 'rgba(16,13,30,0.86)');
      bg.addColorStop(1, 'rgba(8,8,16,0.9)');
      c.fillStyle = bg; c.fill();
      // island + status
      rr(c, W / 2 - 30, 21, 60, 17, 8.5); c.fillStyle = '#000'; c.fill();
      c.font = font(600, 13); c.fillStyle = '#fff'; c.fillText('9:41', 30, 35);
      rr(c, W - 52, 25, 22, 11, 3); c.lineWidth = 1.4; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
      c.fillStyle = '#fff'; c.fillRect(W - 50, 27, 15, 7);
      // header
      c.font = font(800, 29); c.letterSpacing = '-0.5px'; c.fillStyle = '#fff'; c.fillText('Habits', 26, 88);
      c.letterSpacing = '0px';
      c.font = font(500, 13); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillText('Thursday · Nov 6', 27, 108);
      // streak card
      const n = Math.round(12 * easeOutCubic(prog(t, T.count0, T.count1)));
      const pulse = 1 + 0.12 * Math.sin(Math.PI * prog(t, T.count1, T.count1 + 0.35));
      rr(c, 22, 124, W - 44, 108, 22);
      const sg = c.createLinearGradient(22, 124, W - 22, 232);
      sg.addColorStop(0, '#ff8a4c'); sg.addColorStop(1, '#ff4f8b');
      c.fillStyle = sg; c.fill();
      c.save(); c.translate(62, 178); c.scale(pulse, pulse);
      drawFlame(c, 0, 0, 1.05, '#ffffff', '#ffb36b');
      c.restore();
      c.font = font(800, 54); c.letterSpacing = '-1px'; c.fillStyle = '#fff';
      c.fillText(String(n), 96, 194);
      const nw = c.measureText(String(n)).width;
      c.letterSpacing = '0px';
      c.font = font(700, 15); c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillText('day streak', 100 + nw, 194);
      c.font = font(600, 12); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillText('CURRENT STREAK', 98, 150);
      // habits
      c.font = font(700, 11.5); c.letterSpacing = '1.6px'; c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillText('TODAY', 27, 260);
      c.letterSpacing = '0px';
      habits.forEach(([name, col], j) => {
        const y = 270 + j * 46;
        const q = prog(t, T.habit(j), T.habit(j) + 0.3);
        rr(c, 22, y, W - 44, 39, 12);
        c.fillStyle = `rgba(255,255,255,${0.07 + 0.05 * q})`; c.fill();
        c.beginPath(); c.arc(40, y + 19.5, 5, 0, Math.PI * 2); c.fillStyle = col; c.fill();
        c.font = font(600, 15); c.fillStyle = '#fff'; c.fillText(name, 55, y + 25);
        const cx = W - 44, cy = y + 19.5;
        c.beginPath(); c.arc(cx, cy, 11, 0, Math.PI * 2);
        c.lineWidth = 1.8; c.strokeStyle = `rgba(255,255,255,${0.55 * (1 - q)})`; c.stroke();
        const f = easeOutBack(prog(q, 0, 0.6), 2.2);
        if (f > 0) { c.beginPath(); c.arc(cx, cy, 11 * f, 0, Math.PI * 2); c.fillStyle = ACCENT; c.fill(); }
        drawCheck(c, cx, cy, 10, prog(q, 0.3, 1), '#fff', 2.6);
      });
      // weekly bars
      c.font = font(700, 11.5); c.letterSpacing = '1.6px'; c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillText('THIS WEEK', 27, 470);
      c.letterSpacing = '0px';
      const base = 530, maxH = 46, step = (W - 60) / 7;
      week.forEach((v, k) => {
        const e = easeOutBack(prog(t, T.bar(k), T.bar(k) + 0.45), 1.6);
        const h = Math.max(2, maxH * v * e);
        rr(c, 32 + k * step, base - h, step - 10, h, 5);
        c.fillStyle = k === 6 ? ACCENT : 'rgba(255,255,255,0.55)';
        c.fill();
      });
    },
  });
  phone.group.position.set(1.6, 0, 0);
  g.add(phone.group); panels.push(phone);

  // ---- instanced confetti, analytic ballistic motion with drag ----
  const N = 420;
  const rnd = mulberry32(20261106);
  const palette = ['#ff8a4c', '#ff5fa2', '#9b7bff', '#5aa8ff', '#ffd166', '#ffffff', '#3ddc97'];
  const conf = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.25, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.0 }),
    N,
  );
  conf.frustumCulled = false;
  const P = [];
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2;
    const sp = 1.5 + rnd() * 4.5;
    P.push({
      o: new THREE.Vector3(1.6 + (rnd() - 0.5) * 1.6, 2.4 + (rnd() - 0.5) * 0.5, -0.45 + rnd() * 0.25),
      v: new THREE.Vector3(Math.cos(a) * sp * 1.5, 3.0 + rnd() * 5.0, Math.sin(a) * sp * 0.45 + 0.35),
      sx: 0.06 + rnd() * 0.07, sy: 0.035 + rnd() * 0.03,
      r: new THREE.Vector3(rnd() * 6, rnd() * 6, rnd() * 6),
      w: new THREE.Vector3((rnd() - 0.5) * 18, (rnd() - 0.5) * 18, (rnd() - 0.5) * 10),
      ph: rnd() * 6.28, fl: 3 + rnd() * 4,
    });
    col.set(palette[i % palette.length]).multiplyScalar(1.15);
    conf.setColorAt(i, col);
  }
  g.add(conf);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), p4 = new THREE.Vector3(), s4 = new THREE.Vector3();
  const k = 1.7, grav = 7.5;
  function updateConfetti(t) {
    const tau = t - T.burst;
    conf.visible = tau > 0;
    if (tau <= 0) return;
    const ek = (1 - Math.exp(-k * tau)) / k;
    for (let i = 0; i < N; i++) {
      const c = P[i];
      const sway = Math.sin(tau * c.fl + c.ph) * 0.18 * Math.min(1, tau);
      p4.set(
        c.o.x + c.v.x * ek + sway,
        c.o.y + (c.v.y + grav / k) * ek - (grav / k) * tau,
        c.o.z + c.v.z * ek + sway * 0.5,
      );
      e4.set(c.r.x + c.w.x * tau, c.r.y + c.w.y * tau, c.r.z + c.w.z * tau);
      q4.setFromEuler(e4);
      const grow = Math.min(1, tau * 8);
      s4.set(c.sx * grow, c.sy * grow, 1);
      m4.compose(p4, q4, s4);
      conf.setMatrixAt(i, m4);
    }
    conf.instanceMatrix.needsUpdate = true;
  }

  return {
    group: g, panels,
    update(t) {
      const u = prog(t, T.swing, T.swing + 1.0);
      phone.group.visible = t >= T.swing;
      const sw = spring(u);
      phone.inner.rotation.set(
        lerp(0.35, 0, sw) + 0.025 * Math.sin(t * 1.3),
        lerp(-1.45, 0, sw) + 0.07 * Math.sin(t * 0.9) * prog(t, S + 1, S + 2),
        lerp(-0.25, 0, sw),
      );
      phone.inner.position.set(lerp(4.2, 0, easeOutExpo(u)), lerp(-0.8, 0, easeOutCubic(u)), lerp(-1.5, 0, easeOutCubic(u)));
      phone.faceMat.opacity = 1;
      updateConfetti(t);
      for (const p of panels) p.update(t);
    },
  };
}

// ======================================================================
// Reveal HUD — fixed to the camera
// ======================================================================
function scrimTexture() {
  // radial scrim: darkest behind the title, lighter toward the edges so every scene stays visible
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 300;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(256, 150, 20, 256, 150, 300);
  g.addColorStop(0, 'rgba(4,3,10,0.92)');
  g.addColorStop(0.45, 'rgba(4,3,10,0.72)');
  g.addColorStop(1, 'rgba(4,3,10,0.38)');
  c.fillStyle = g; c.fillRect(0, 0, 512, 300);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeHud(camera) {
  const hud = new THREE.Group();
  camera.add(hud);
  const T = { scrim: 13.35, l1: 13.7, l2: 13.85, pill: 14.15 };

  const scrim = new THREE.Mesh(
    new THREE.PlaneGeometry(34, 20),
    new THREE.MeshBasicMaterial({ map: scrimTexture(), transparent: true, opacity: 0, depthWrite: false }),
  );
  scrim.position.z = -11;
  scrim.renderOrder = 10;
  hud.add(scrim);

  const title = new Panel({
    w: 7.4, h: 2.3, material: null, ppu: 280, range: [T.l1, T.l2 + 0.8],
    draw(c, t, W, H) {
      const a = easeOutCubic(prog(t, T.l1, T.l1 + 0.5));
      c.textAlign = 'center';
      c.save();
      c.globalAlpha = a;
      c.font = font(700, 30);
      c.letterSpacing = '12px';
      c.shadowColor = 'rgba(255,138,76,0.6)';
      c.shadowBlur = 18;
      c.fillStyle = ACCENT;
      c.fillText('ONE CONVERSATION', W / 2 + 6, 62 + (1 - a) * 18);
      c.restore();
      // "Idea → App"
      const b = easeOutExpo(prog(t, T.l2, T.l2 + 0.6));
      c.font = font(800, 118);
      c.letterSpacing = '-3px';
      const wIdea = c.measureText('Idea').width, wApp = c.measureText('App').width;
      const gap = 34, arrowL = 92;
      const total = wIdea + gap + arrowL + gap + wApp;
      const x0 = W / 2 - total / 2;
      c.textAlign = 'left';
      c.save();
      c.beginPath();
      c.rect(0, 70, W, H - 70);
      c.clip();
      c.shadowColor = 'rgba(0,0,0,0.5)';
      c.shadowBlur = 24;
      c.fillStyle = '#fff';
      const yb = 186;
      const bi = easeOutExpo(prog(t, T.l2, T.l2 + 0.5));
      const ba = easeOutExpo(prog(t, T.l2 + 0.22, T.l2 + 0.72));
      c.globalAlpha = bi;
      c.fillText('Idea', x0, yb + (1 - bi) * 110);
      c.globalAlpha = ba;
      c.fillText('App', x0 + wIdea + gap * 2 + arrowL, yb + (1 - ba) * 110);
      c.restore();
      const ar = easeOutCubic(prog(t, T.l2 + 0.1, T.l2 + 0.55));
      if (ar > 0) {
        c.save();
        c.shadowColor = 'rgba(255,138,76,0.9)';
        c.shadowBlur = 20;
        drawArrow(c, x0 + wIdea + gap, yb - 40, arrowL * ar, ACCENT, 11);
        c.restore();
      }
      void b;
    },
  });
  title.group.position.set(0, 0.62, -10);
  title.face.renderOrder = 11;
  hud.add(title.group);

  const pill = new Panel({
    w: 3.4, h: 0.62, radius: 0.31, depth: 0.12, ppu: 300, range: [T.pill, T.pill + 0.6],
    material: frosted({ roughness: 0.35, thickness: 0.4 }),
    draw(c, t, W, H) {
      panelFace(c, W, H, H / 2, { fill: 'rgba(16,12,30,0.5)' });
      c.save();
      c.shadowColor = 'rgba(255,138,76,1)';
      c.shadowBlur = 12;
      c.beginPath(); c.arc(36, H / 2, 7, 0, Math.PI * 2); c.fillStyle = ACCENT; c.fill();
      c.restore();
      c.font = font(600, 24);
      c.letterSpacing = '0.2px';
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.fillText('Built with Claude Code', W / 2 + 12, 39.5);
      c.textAlign = 'left';
    },
  });
  pill.group.position.set(0, -1.55, -10);
  pill.face.renderOrder = 12;
  hud.add(pill.group);

  return {
    group: hud,
    update(t) {
      const s = easeInOutCubic(prog(t, T.scrim, T.scrim + 0.55));
      scrim.visible = s > 0;
      scrim.material.opacity = s;
      title.group.visible = t >= T.l1;
      title.update(t);
      pill.appear(prog(t, T.pill, T.pill + 0.5), { from: 0.6, dy: -0.18 });
      pill.update(t);
    },
  };
}
