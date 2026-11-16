/* ============================================================
   pixel.js — Pixel mode: a bright 8-bit game skin for the app.

   It's a layer ON TOP of the normal app. app.js and auth.js don't
   know it exists: a MutationObserver watches #app, and after every
   render it swaps emoji for pixel sprites, adds the animated city
   scene, the XP bar and the meal hearts. pixel.css does the rest.
   Turn it off in Me → App settings → Pixel mode.
   ============================================================ */

(function () {
  "use strict";

  // ---------- preferences ----------
  const PREF_KEY = "fitnessTracker_pixel_v1";
  const prefs = (() => {
    const fallback = { on: true, sound: true };
    try { return Object.assign(fallback, JSON.parse(localStorage.getItem(PREF_KEY)) || {}); } catch (e) { return fallback; }
  })();
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} }

  document.documentElement.classList.toggle("pixel", prefs.on);
  const reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const INK = "#2A1F3D";

  // ---------- sprite engine ----------
  // Sprites are drawn as text grids. Each letter is a colour from PAL,
  // "." is empty. An ink outline is added automatically around every shape.
  const PAL = {
    K: INK, W: "#FFFFFF", C: "#FFF3D6", Y: "#FFD84D", y: "#F2A93B", O: "#FF9E5E", o: "#E8673C",
    R: "#FF5E7E", r: "#C9385C", P: "#FF7AB6", G: "#7BE05A", g: "#3FB04A", B: "#6FD3FF", b: "#3AA8E8",
    V: "#9C7BFF", v: "#6A4FD8", M: "#4FE3C1", N: "#C47A3D", n: "#7A4A26", S: "#D3CBE0", s: "#8A7FA0",
    F: "#FFCFA6", T: "#FF6FA8", c: "#C9385C",
  };

  const face = (rows) => {
    const base = ["............", "...YYYYYY...", "..YYYYYYYY..", ".YYYYYYYYYY.", ".YYKYYYYKYY.", ".YYKYYYYKYY.",
      ".YYYYYYYYYY.", ".YYYYYYYYYY.", ".YYYYYYYYYY.", "..YYYYYYYY..", "...YYYYYY...", "............"];
    Object.keys(rows).forEach((i) => { base[i] = rows[i]; });
    return base;
  };

  const SPRITES = {
    egg: ["............", "....WWWW....", "..WWWWWWW...", "..WWWWWWWW..", ".WWWYYYWWW..", ".WWYYWYYWWW.",
      ".WWYYYYYWWW.", ".WWWYYYWWWW.", "..WWWWWWWW..", "...WWWWWW...", "............"],
    rice: ["............", "....WWWW....", "..WWWWWWWW..", ".WWWWWSWWWW.", ".BBBBBBBBBB.", ".BWBBBBBBbB.",
      "..BBBBBBbB..", "...BBBBbB...", "....bbbb....", "............"],
    plate: ["..............", ".....G..OO....", "....GGG.OOO...", "...NNNNNNNNN..", "..WWWWWWWWWW..",
      ".WSWWWWWWWWSW.", "..WSSSSSSSSW..", "...WWWWWWWW...", ".............."],
    apple: ["...........", "......n....", ".....nGG...", "...RRnRR...", "..RWRRRRR..", ".RWRRRRRRR.",
      ".RRRRRRRRR.", ".RRRRRRRrR.", "..RRRRRRr..", "...RR.RR...", "..........."],
    target: ["............", "...RRRRRR...", "..RWWWWWWR..", ".RWRRRRRRWR.", ".RWRWWWWRWR.", ".RWRWRRWRWR.",
      ".RWRWRRWRWR.", ".RWRWWWWRWR.", ".RWRRRRRRWR.", "..RWWWWWWR..", "...RRRRRR...", "............"],
    star: ["...........", ".....Y.....", "....YYY....", "....YYY....", ".YYYYYYYYY.", "..YYYWYYY..",
      "...YYYYY...", "...YYYYY...", "..YYY.YYY..", "..YY...YY..", "..........."],
    sparkle: ["...........", ".....Y.....", ".....Y.....", "....YWY....", ".YYYWWWYYY.", "....YWY....",
      ".....Y.....", ".....Y..P..", ".......PPP.", "........P..", "..........."],
    sprout: ["...........", "...........", ".GG.....GG.", ".GGG...GGG.", "..GGG.GGG..", "...GGgGG...",
      ".....g.....", ".....g.....", "..NNNNNNN..", "...NNNNN...", "..........."],
    dumbbell: ["..............", "..VV......VV..", ".VVVV....VVVV.", ".VWVVSSSSVWVV.", ".VWVVSSSSVVVV.",
      ".VVVV....VVVV.", "..VV......VV..", ".............."],
    calendar: ["............", "..K....K....", ".RRRRRRRRRR.", ".RRRRRRRRRR.", ".WWWWWWWWWW.", ".WKWWKWWKWW.",
      ".WWWWWWWWWW.", ".WKWWKWWRRW.", ".WWWWWWWRRW.", ".WWWWWWWWWW.", "............"],
    bulb: ["...........", "....YYY....", "...YYWYY...", "..YYWYYYY..", "..YYYYYYY..", "..YYYYYYY..",
      "...YYYYY...", "....SSS....", "....sss....", "....SSS....", "..........."],
    book: [".............", ".............", ".BBBBB.BBBBB.", ".BWWWWBWWWWB.", ".BWKKWBWKKWB.", ".BWWWWBWWWWB.",
      ".BWKKWBWKKWB.", ".BWWWWBWWWWB.", ".BBBBBBBBBBB.", ".....bbb.....", "............."],
    bell: ["...........", ".....Y.....", "....YYY....", "...YYWYY...", "...YWYYY...", "...YYYYY...",
      "..YYYYYYY..", ".YYYYYYYYY.", ".....o.....", "..........."],
    camera: [".............", "....sss......", ".SSSSSSSSSSS.", ".SSSKKKKSSRS.", ".SSKBBBBKSSS.", ".SSKBWBBKSSS.",
      ".SSKBBBBKSSS.", ".SSSKKKKSSSS.", ".SSSSSSSSSSS.", "............."],
    faceYum: face({ 7: ".YKYYYYYYKY.", 8: ".YYKKKKKKYY.", 9: "..YYYYRRYY.." }),
    faceSmile: face({ 7: ".YYKYYYYKYY.", 8: ".YYYKKKKYYY." }),
    faceMeh: face({ 4: ".YYYYYYYYYY.", 5: ".YKKYYYYKKY.", 8: ".YYYKKKKYYY." }),
    faceGrimace: face({ 7: ".YKKKKKKKKY.", 8: ".YKWKWKWKWY.", 9: "..YKKKKKKY.." }),
    moon: ["...........", "....YYY..W.", "...YYY.....", "..YYY......", "..YYY...W..", "..YYY......",
      "..YYYY.....", "...YYYYYY..", "....YYYY...", "..........."],
    drop: ["...........", ".....B.....", ".....B.....", "....BBB....", "...BBBBB...", "..BBWBBBB..",
      "..BWBBBBB..", "..BBBBBBb..", "...BBBBb...", "....bbb....", "..........."],
    drumstick: ["............", "....OOOO....", "...OOOOOO...", "..OOWOOOOO..", "..OWOOOOOo..", "..OOOOOOOo..",
      "...OOOOOo...", "....OOoo....", ".....WW.....", "....WWWW....", "....W..W....", "............"],
    shoe: [".............", ".............", "..TTT........", "..TWTT.......", "..TTWTT......", "..TTTTTTTT...",
      "..TTTTTTTTTT.", "..WWWWWWWWWW.", "............."],
    nope: ["...........", "...RRRRR...", "..RR...RR..", ".RRR....RR.", ".R.RR....R.", ".R..RR...R.",
      ".R...RR..R.", ".R....RR.R.", ".RR....RRR.", "..RR...RR..", "...RRRRR...", "..........."],
    island: [".............", "....GGG......", "..GGGGGGG....", ".GG..N..GG...", ".....N.......", ".....N.......",
      "......N......", "..YYYYYYYYY..", ".BBBBBBBBBBB.", "............."],
    bolt: [".........", ".....YY..", "....YY...", "...YY....", "..YYYYY..", "....YY...", "...YY....", "..YY.....", "........."],
    clock: ["...........", "...WWWWW...", "..WWWKWWW..", ".WWWWKWWWW.", ".WWWWKWWWW.", ".WWWWKKKWW.",
      ".WWWWWWWWW.", "..WWWWWWW..", "...WWWWW...", "..........."],
    check: ["..........", "........W.", ".......WW.", "..W...WW..", "..WW.WW...", "...WWW....", "....W.....", ".........."],
    cross: [".........", ".WW...WW.", "..WW.WW..", "...WWW...", "..WW.WW..", ".WW...WW.", "........."],
    heart: [".............", "..RRR...RRR..", ".RRWRR.RRRRR.", ".RWRRRRRRRRR.", ".RRRRRRRRRRR.", "..RRRRRRRRr..",
      "...RRRRRRr...", "....RRRRr....", ".....RRr.....", "......R......", "............."],
    heartSmall: [".........", "..RR.RR..", ".RRRRRRR.", ".RRRRRRR.", "..RRRRR..", "...RRR...", "....R....", "........."],
    starSmall: [".......", "...Y...", "..YYY..", ".YYYYY.", "..YYY..", "..Y.Y..", "......."],
    house: ["............", ".....RR.....", "....RRRR....", "...RRRRRR...", "..RRRRRRRR..", ".RRRRRRRRRR.",
      "..CCCCCCCC..", "..CBBCCNNC..", "..CBBCCNNC..", "..CCCCCNNC..", "............"],
    scroll: ["............", ".NNNNNNNNNN.", "..CCCCCCCC..", "..CKKKKKCC..", "..CCCCCCCC..", "..CKKKKKKC..",
      "..CCCCCCCC..", "..CKKKCCCC..", "..CCCCCCCC..", ".NNNNNNNNNN.", "............"],
    trophy: ["..............", "...YYYYYYYY...", ".YYYWYYYYYYYY.", ".Y.YWYYYYYY.Y.", ".YYYYYYYYYYYY.", "...YYYYYYYY...",
      "....YYYYYY....", "......YY......", "......YY......", "....oooooo....", "....oooooo....", ".............."],
    hero: ["............", "...nnnnnn...", "..nnnnnnnn..", "..nPPPPPPn..", "..FKFFFFKF..", "..FFFFFFFF..",
      "...FFTTFF...", "....FFFF....", "..VVVVVVVV..", ".VVVVVVVVVV.", ".VVVVVVVVVV.", "............"],
    gamepad: ["..............", "..VVVVVVVVVV..", ".VVVVVVVVVVVV.", ".VVKVVVVVVRVV.", ".VKKKVVVVYVRV.",
      ".VVKVVVVVVYVV.", ".VVVVVVVVVVVV.", "..VVV....VVV..", ".............."],
    speaker: ["............", "....SS...B..", "..SSSS....B.", ".SSSSS..B.B.", ".SSSSS..B.B.", ".SSSSS..B.B.",
      "..SSSS....B.", "....SS...B..", "............"],

    // ----- scene characters -----
    runA: ["..........", "...nnnn...", "..nPPPPn..", ".nnFFFKF..", "...FFFF...", "...TTTT...", "..FTTTTF..",
      "...TTTT...", "...VVVV...", "..VV..VV..", ".FF....FF.", ".WW....WW.", ".........."],
    runB: ["..........", "...nnnn...", "..nPPPPn..", ".nnFFFKF..", "...FFFF...", "...TTTT...", "...TTTTF..",
      "..FTTTT...", "...VVVV...", "....VV....", "....FF....", "....FFW...", "...WW....."],
    runJump: ["..........", "...nnnn...", "..nPPPPn..", ".nnFFFKF..", "..FFFFF...", ".FTTTTTF..", "...TTTT...",
      "...TTTT...", "...VVVV...", "..VV..VV..", ".FF....FF.", ".W......W.", ".........."],
    walkA: ["........", "...nn...", "..nnnn..", "..FFFF..", "..FFKF..", "...FF...", "..TTTT..", ".FTTTTF.",
      "..TTTT..", "..VVVV..", "..V..V..", ".WW..WW.", "........"],
    walkB: ["........", "...nn...", "..nnnn..", "..FFFF..", "..FFKF..", "...FF...", "..TTTT..", "..TTTT..",
      ".FTTTTF.", "..VVVV..", "...VV...", "...WW...", "........"],
    car: ["......................", "......CCCCCCCC........", ".....CBBBCBBBBC.......", "....CBBBBCBBBBBC......",
      "..CCCCCCCCCCCCCCCCCC..", ".CCCCCCCCCCCCCCCCCCYY.", ".cCCCCCCCCCCCCCCCCCCC.", ".cccKKKcccccccKKKccc..",
      "....KSK........KSK....", "......................"],
  };

  function pixels(name, swap) {
    const rows = SPRITES[name];
    const h = rows.length, w = rows[0].length;
    const col = rows.map((r) => Array.from(r, (ch) => (ch === "." ? null : (swap && swap[ch]) || PAL[ch] || null)));
    if (swap && swap.noOutline) return { w, h, px: col };
    const out = col.map((r) => r.slice());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (col[y][x]) continue;
      if ((y > 0 && col[y - 1][x]) || (y < h - 1 && col[y + 1][x]) || col[y][x - 1] || col[y][x + 1]) out[y][x] = INK;
    }
    return { w, h, px: out };
  }

  const svgCache = {};
  function spriteSVG(name, swap, key) {
    const k = name + "|" + (key || "");
    if (svgCache[k]) return svgCache[k];
    const { w, h, px } = pixels(name, swap);
    let rects = "";
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const c = px[y][x];
        if (!c) { x++; continue; }
        let run = 1;
        while (x + run < w && px[y][x + run] === c) run++;
        rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`;
        x += run;
      }
    }
    return (svgCache[k] = `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`);
  }

  const canvasCache = {};
  function spriteCanvas(name, swap, key, flip) {
    const k = name + "|" + (key || "") + (flip ? "|f" : "");
    if (canvasCache[k]) return canvasCache[k];
    const { w, h, px } = pixels(name, swap);
    const c = mk(w, h), g = c.getContext("2d");
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!px[y][x]) continue;
      g.fillStyle = px[y][x];
      g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
    return (canvasCache[k] = c);
  }

  function mk(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  // ---------- tiny 3x5 pixel font for shop signs and the scene HUD ----------
  const FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
    F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
    K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
    Z: "111001010100111", 0: "111101101101111", 1: "010110010010111", 2: "110001010100111", 3: "110001010001110",
    4: "101101111001001", 5: "111100110001110", 6: "011100111101111", 7: "111001010010010", 8: "111101111101111",
    9: "111101111001110", "/": "001001010100100", "!": "010010010000010", "+": "000010111010000", " ": "000000000000000",
  };
  const textWidth = (s) => s.length * 4 - 1;
  function drawText(g, str, x, y, color, shadow) {
    String(str).toUpperCase().split("").forEach((ch, i) => {
      const bits = FONT[ch] || FONT[" "];
      for (let b = 0; b < 15; b++) {
        if (bits[b] !== "1") continue;
        const px = x + i * 4 + (b % 3), py = y + Math.floor(b / 3);
        if (shadow) { g.fillStyle = shadow; g.fillRect(px + 1, py + 1, 1, 1); }
        g.fillStyle = color; g.fillRect(px, py, 1, 1);
      }
    });
  }

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- 8-bit sound ----------
  let audioCtx = null;
  function tone(freq, start, dur, type, vol, slideTo) {
    if (!prefs.sound || !prefs.on) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t = audioCtx.currentTime + start;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) {}
  }
  const SFX = {
    tick() { tone(740, 0, 0.035, "square", 0.018); },
    coin() { tone(988, 0, 0.07, "square", 0.04); tone(1319, 0.07, 0.2, "square", 0.04); },
    undo() { tone(392, 0, 0.12, "triangle", 0.05, 196); },
    jump() { tone(320, 0, 0.16, "square", 0.03, 720); },
    clear() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.085, 0.16, "square", 0.04)); },
  };

  // ---------- screen effects: particle bursts, floating text, banners ----------
  const CONFETTI = ["#FF5E7E", "#FFD84D", "#7BE05A", "#6FD3FF", "#9C7BFF", "#FF9E5E", "#4FE3C1", "#FFFFFF"];
  const FX = (() => {
    const S = 3;
    let c = null, g = null, parts = [], raf = 0, last = 0;
    function ensure() {
      if (c) return;
      c = mk(1, 1); c.className = "px-fx"; c.setAttribute("aria-hidden", "true");
      document.body.appendChild(c); g = c.getContext("2d");
      size(); window.addEventListener("resize", size);
    }
    function size() {
      c.width = Math.ceil(innerWidth / S); c.height = Math.ceil(innerHeight / S);
      c.style.width = c.width * S + "px"; c.style.height = c.height * S + "px";
    }
    function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
    function tick(ts) {
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      g.clearRect(0, 0, c.width, c.height);
      parts = parts.filter((p) => (p.life -= dt) > 0);
      parts.forEach((p) => {
        p.vy += (p.confetti ? 30 : 160) * dt;
        p.x += (p.vx + (p.confetti ? Math.sin(ts / 180 + p.phase) * 12 : 0)) * dt;
        p.y += p.vy * dt;
        g.globalAlpha = Math.min(1, p.life * 3);
        g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      });
      g.globalAlpha = 1;
      raf = parts.length ? requestAnimationFrame(tick) : 0;
    }
    return {
      burst(x, y, n, colors) {
        if (reduceMotion) return;
        ensure(); colors = colors || CONFETTI; n = n || 16;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, sp = 25 + Math.random() * 55;
          parts.push({ x: x / S, y: y / S, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 35, life: 0.5 + Math.random() * 0.45, c: colors[i % colors.length], s: Math.random() < 0.35 ? 2 : 1 });
        }
        start();
      },
      confetti() {
        if (reduceMotion) return;
        ensure();
        for (let i = 0; i < 110; i++) {
          parts.push({ x: Math.random() * c.width, y: -Math.random() * 60, vx: (Math.random() - 0.5) * 20, vy: 18 + Math.random() * 30, life: 2.4 + Math.random() * 1.2, c: CONFETTI[i % CONFETTI.length], s: Math.random() < 0.5 ? 2 : 1, confetti: true, phase: Math.random() * 6 });
        }
        start();
      },
    };
  })();

  function floatText(text, x, y, cls) {
    const el = document.createElement("div");
    el.className = "px-float " + (cls || "");
    el.textContent = text;
    el.setAttribute("aria-hidden", "true");
    el.style.left = Math.round(x) + "px"; el.style.top = Math.round(y) + "px";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  // Banners queue up, so a level-up and a badge in the same tap each get their moment.
  const bannerQueue = [];
  let bannerBusy = false;
  function banner(text, sub) {
    bannerQueue.push([text, sub]);
    if (!bannerBusy) nextBanner();
  }
  function nextBanner() {
    const item = bannerQueue.shift();
    if (!item) { bannerBusy = false; return; }
    bannerBusy = true;
    const el = document.createElement("div");
    el.className = "px-banner"; el.setAttribute("role", "status");
    el.innerHTML = `<span class="px-banner-stars">${spriteSVG("star")}${spriteSVG("star")}${spriteSVG("star")}</span><strong></strong>${item[1] ? "<small></small>" : ""}`;
    el.querySelector("strong").textContent = item[0];
    if (item[1]) el.querySelector("small").textContent = item[1];
    document.body.appendChild(el);
    SFX.clear(); FX.confetti(); Scene.celebrate();
    setTimeout(() => { el.remove(); nextBanner(); }, 2600);
  }

  // ---------- today's score (XP) from the app's own state ----------
  function score() {
    try {
      if (typeof DB === "undefined" || !DB.goal || !DB.plan) return null;
      const today = todayStr();
      const meals = new Set(DB.mealLogs.filter((l) => l.meal_type !== "snack").map((l) => l.meal_type)).size;
      const habits = habitDefs.filter((h) => isHabitDone(today, h.id)).length;
      const w = todayWorkoutProgress();
      const totalSets = w.day.ex.reduce((s, x) => s + (Number(x.sets) || 0), 0);
      const sets = Math.min(DB.setLogs.length, totalSets);
      const xp = meals * XP.meal + habits * XP.habit + sets * XP.set + (w.complete ? XP.workout : 0);
      const max = 3 * XP.meal + habitDefs.length * XP.habit + totalSets * XP.set + XP.workout;
      const goalsTotal = habitDefs.length;
      return { meals, goalsDone: habits, goalsTotal, workoutDone: w.complete && w.total > 0, xp, max, ratio: max ? xp / max : 0,
        allDone: meals === 3 && habits === goalsTotal && w.complete };
    } catch (e) { return null; }
  }

  const REACTIONS = ["Nice one!", "Look at you go!", "Love that!", "That's the spirit!", "Ooh, XP!", "Small wins count!"];

  function nextTip(mode, s) {
    if (mode === "auth") return pick(["Hi! I'm your Spotter. Ready to play?", "Small days count!", "Your first quest is one tap away.", "Tap Play as guest to start!"]);
    if (!greetedByName && spotter()) { greetedByName = true; return `Hi, it's ${spotter()}! Let's go.`; }
    try {
      if (s && s.allDone) return pick(["Every quest done. Go rest!", "Perfect day!", "GG! See you tomorrow."]);
      const today = todayStr();
      const win = currentMealWindow();
      const logged = new Set(DB.mealLogs.filter((l) => l.meal_type !== "snack").map((l) => l.meal_type));
      if (win && !logged.has(win)) return `${win[0].toUpperCase() + win.slice(1)} time! Snap it for +20 XP.`;
      const left = habitDefs.filter((h) => !isHabitDone(today, h.id));
      const w = todayWorkoutProgress();
      const options = ["Sip some water!", "Love this pace!", "Small days count."];
      if (left.length) options.push(`${left.length} habit${left.length > 1 ? "s" : ""} left today`, `Next up: ${left[0].label}`);
      if (w.total && !w.complete) options.push(`Today: ${w.day.focus}`, `${w.total - w.done} move${w.total - w.done > 1 ? "s" : ""} to go!`);
      if (logged.size < 3) options.push(`${3 - logged.size} meal${3 - logged.size > 1 ? "s" : ""} left to snap`);
      return pick(options);
    } catch (e) { return "You've got this!"; }
  }

  // The Spotter speaks in the city. Its name comes from app.js; on sign-in there isn't one yet.
  const spotter = () => { try { return typeof spotterName === "function" ? spotterName() : ""; } catch (e) { return ""; } };
  let greetedByName = false;

  // ---------- the animated pixel city ----------
  const SHOPS = [
    { name: "GYM", wall: "#FF7AA8", trim: "#D9488C", sign: INK, text: "#FFD84D", awn: ["#FFFFFF", "#FF5E7E"], item: "dumbbell" },
    { name: "JUICE", wall: "#FFB65C", trim: "#E07F2E", sign: "#FFFFFF", text: "#FF6B3D", awn: ["#FFFFFF", "#7BE05A"], item: "fruit" },
    { name: "YOGA", wall: "#B9A2FF", trim: "#7F63E0", sign: "#FFF3D6", text: "#6A4FD8", awn: ["#FFF3D6", "#4FE3C1"], item: "plant" },
    { name: "FRUIT", wall: "#8BE36A", trim: "#4CB447", sign: "#FFFFFF", text: "#E8456B", awn: ["#FFFFFF", "#FF9E5E"], item: "fruit" },
    { name: "SWIM", wall: "#6FD3FF", trim: "#3AA8E8", sign: INK, text: "#7DF3FF", awn: ["#FFFFFF", "#3AA8E8"], item: "ring" },
    { name: "SALAD", wall: "#FFE066", trim: "#E0B22E", sign: "#3FB04A", text: "#FFFFFF", awn: ["#FFFFFF", "#3FB04A"], item: "plant" },
    { name: "BIKE", wall: "#4FE3C1", trim: "#22B39A", sign: "#FFFFFF", text: INK, awn: ["#FFD84D", "#FF7AB6"], item: "ring" },
    { name: "TEA", wall: "#FFB3C7", trim: "#E8789A", sign: "#7A4A26", text: "#FFF3D6", awn: ["#FFFFFF", "#C47A3D"], item: "fruit" },
  ];

  const SKIES = {
    morning: { sky: ["#FFB3B0", "#FFCFA8", "#FFE6B5", "#CDEFFF"], sun: "#FFE48A", core: "#FFF7D6", sunY: 34, far: ["#F4B3C8", "#C8B6F0", "#A8DCEA", "#F7CFA2"], win: "#FFF4E6", cloud: ["#FFF6F0", "#FFD6CB"], tint: "rgba(255,170,150,.10)", walk: "#F5E3C8", seam: "#E2C9A8", curb: "#CDB28F", road: "#77709A", lane: "#FFE48A" },
    day: { sky: ["#4CC2FF", "#6CCFFF", "#92DCFF", "#BDEBFF"], sun: "#FFE066", core: "#FFF8C8", sunY: 13, far: ["#A8C2FF", "#C3B0FF", "#9CE5D9", "#FFC1D5"], win: "#EAF7FF", cloud: ["#FFFFFF", "#D3EEFF"], tint: null, walk: "#F4E4C9", seam: "#E0C9A6", curb: "#C9AE8B", road: "#6D6A90", lane: "#FFE066" },
    golden: { sky: ["#FF7FAE", "#FF9C8C", "#FFBF7C", "#FFDE9C"], sun: "#FFB347", core: "#FFE8A6", sunY: 46, far: ["#E895B8", "#B596E8", "#F2A07E", "#F5B8C9"], win: "#FFE6C4", cloud: ["#FFE7DA", "#FFB9A8"], tint: "rgba(255,120,80,.12)", walk: "#F2D3B8", seam: "#DDB596", curb: "#C49A7E", road: "#6E5E8E", lane: "#FFD06B" },
    night: { sky: ["#18205E", "#252C80", "#3C35A0", "#6343B4"], sun: "#FFF4C9", core: "#FFFFFF", sunY: 15, far: ["#3A3F96", "#4E3C9E", "#2E5A9C", "#5A3F8E"], win: "#FFD86B", cloud: ["#6C63C8", "#4F47A6"], tint: "rgba(24,20,90,.42)", walk: "#8A7DB4", seam: "#7466A2", curb: "#5E5292", road: "#2D2A5E", lane: "#FFD86B", night: true },
  };
  // ?pxTime=morning|day|golden|night previews a sky without waiting for that time of day.
  const forcedSky = (() => { try { return new URLSearchParams(location.search).get("pxTime"); } catch (e) { return null; } })();
  function timeOfDay(h) {
    if (forcedSky && SKIES[forcedSky]) return forcedSky;
    return h >= 5 && h < 10 ? "morning" : h >= 10 && h < 16 ? "day" : h >= 16 && h < 19 ? "golden" : "night";
  }

  const Scene = (() => {
    const S = 2, H = 100, BASE = 74, FAR_W = 336;
    let wrap = null, btn = null, canvas = null, ctx = null, bubble = null;
    let W = 200, raf = 0, last = 0, t = 0, camX = 0, visible = true, mode = "home", greeted = false;
    let palName = null, P = null, layers = null, palChecked = 0, bubbleTimer = 0;
    let state = { meals: 0, goalsDone: 0, goalsTotal: 6, ratio: 0, allDone: false };
    const player = { x: 0, y: 0, vy: 0, air: false, ft: 0, frame: 0, hopTimer: 2 };
    const r = rng(42);
    const PEOPLE = [
      { n: "#2A1F3D", F: "#E0A07A", T: "#FFD84D", V: "#3A5BA8" }, { n: "#F2A93B", F: "#FFCFA6", T: "#4FE3C1", V: "#6A4FD8" },
      { n: "#7A4A26", F: "#A86B4A", T: "#FF7AB6", V: "#2A1F3D" }, { n: "#C9385C", F: "#FFCFA6", T: "#6FD3FF", V: "#4A3D63" },
      { n: "#2A1F3D", F: "#FFCFA6", T: "#FF9E5E", V: "#3FB04A" }, { n: "#7A4A26", F: "#E0A07A", T: "#9C7BFF", V: "#3A5BA8" },
    ];
    const peds = PEOPLE.map((swap, i) => ({ swap, key: "p" + i, x: r() * 500, v: (r() < 0.5 ? -1 : 1) * (5 + r() * 6), feet: 77 + Math.floor(r() * 6), ft: r() }));
    const CAR_COLORS = [["#FF5E7E", "#C9385C"], ["#FFD84D", "#E0A72E"], ["#6FD3FF", "#3AA8E8"], ["#7BE05A", "#3FB04A"], ["#9C7BFF", "#6A4FD8"], ["#FF9E5E", "#E8673C"]];
    const cars = [0, 1, 2, 3].map((i) => ({ lane: i % 2, x: i * 140 + r() * 60, v: i % 2 ? 46 : -38, col: CAR_COLORS[i % CAR_COLORS.length], key: "c" + i }));
    const clouds = [0, 1, 2, 3].map((i) => ({ x: i * 70 + r() * 30, y: 4 + Math.floor(r() * 22), w: 18 + Math.floor(r() * 16) }));
    const birds = [0, 1, 2].map((i) => ({ x: r() * 200, y: 10 + r() * 20, v: 6 + r() * 5, f: r() }));
    const stars = Array.from({ length: 34 }, () => ({ x: r(), y: Math.floor(r() * 50), p: r() * 6 }));
    let sparks = [], fireworkTimer = 0;

    function build() {
      wrap = document.createElement("div"); wrap.className = "px-scene";
      btn = document.createElement("button"); btn.type = "button"; btn.className = "px-scene-btn";
      canvas = mk(W, H); canvas.setAttribute("aria-hidden", "true");
      btn.appendChild(canvas);
      bubble = document.createElement("div"); bubble.className = "px-bubble"; bubble.setAttribute("aria-live", "polite");
      wrap.append(btn, bubble);
      ctx = canvas.getContext("2d");
      btn.addEventListener("click", onTap);
      if (window.ResizeObserver) new ResizeObserver(resize).observe(wrap);
      if (window.IntersectionObserver) new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(wrap);
      document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    }

    function resize() {
      const cw = wrap.clientWidth;
      if (!cw) return;
      const nw = Math.max(90, Math.floor(cw / S));
      if (nw === W && canvas.width === W) return;
      W = nw;
      canvas.width = W; canvas.height = H;
      canvas.style.width = W * S + "px"; canvas.style.height = H * S + "px";
      ctx.imageSmoothingEnabled = false;
      player.x = Math.floor(W * 0.3);
      if (P) layers.sky = buildSky(P, W);
      frame();
    }

    function ensurePalette() {
      const name = timeOfDay(new Date().getHours());
      palChecked = performance.now();
      if (name === palName) return;
      palName = name; P = SKIES[name];
      layers = { sky: buildSky(P, W), far: buildFar(P), mid: buildMid(P), clouds: clouds.map((c) => buildCloud(c.w, P)) };
    }

    // ----- prerendered layers -----
    function buildSky(P, w) {
      const c = mk(w, H), g = c.getContext("2d");
      const edges = [0, 15, 30, 46, H];
      P.sky.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, edges[i], w, edges[i + 1] - edges[i]); });
      for (let i = 1; i < P.sky.length; i++) {
        const y = edges[i];
        g.fillStyle = P.sky[i - 1];
        for (let x = 0; x < w; x += 2) g.fillRect(x + (y % 2), y, 1, 1);
        for (let x = 0; x < w; x += 4) g.fillRect(x, y + 2, 1, 1);
        g.fillStyle = P.sky[i];
        for (let x = 0; x < w; x += 4) g.fillRect(x + 2, y - 2, 1, 1);
      }
      return c;
    }

    function buildCloud(w, P) {
      const c = mk(w + 2, 12), g = c.getContext("2d");
      const disc = (cx, cy, rad, col) => {
        g.fillStyle = col;
        for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad + rad) g.fillRect(cx + dx, cy + dy, 1, 1);
      };
      const bumps = [[Math.floor(w * 0.28), 7, 4], [Math.floor(w * 0.52), 5, 5], [Math.floor(w * 0.76), 7, 4]];
      bumps.forEach(([x, y, rad]) => disc(x + 1, y, rad, P.cloud[0]));
      g.fillStyle = P.cloud[0]; g.fillRect(1, 7, w, 3);
      g.clearRect(0, 10, w + 2, 2);
      g.fillStyle = P.cloud[1]; g.fillRect(2, 9, w - 2, 1);
      return c;
    }

    function buildFar(P) {
      const c = mk(FAR_W, H), g = c.getContext("2d"), rr = rng(7);
      const wins = [], blinks = [];
      let x = 0;
      while (x < FAR_W) {
        let w = 12 + Math.floor(rr() * 15);
        if (FAR_W - x - w < 10) w = FAR_W - x;
        const h = 18 + Math.floor(rr() * 38), top = BASE - h;
        g.fillStyle = P.far[Math.floor(rr() * P.far.length)];
        g.fillRect(x, top, w, h);
        const roof = rr();
        if (roof < 0.25 && w > 8) g.fillRect(x + 2, top - 3, w - 4, 3);
        else if (roof < 0.42) { g.fillRect(x + Math.floor(w / 2), top - 7, 1, 7); blinks.push([x + Math.floor(w / 2), top - 8]); }
        else if (roof < 0.55 && w > 13) { g.fillRect(x + 3, top - 7, 6, 4); g.fillRect(x + 3, top - 3, 1, 3); g.fillRect(x + 8, top - 3, 1, 3); }
        g.fillStyle = "rgba(42,31,61,.14)"; g.fillRect(x + w - 2, top, 2, h);
        for (let wy = top + 3; wy < BASE - 2; wy += 4) for (let wx = x + 2; wx < x + w - 3; wx += 3) if (rr() < 0.6) wins.push([wx, wy, rr()]);
        x += w;
      }
      // landmark: a slim tower with a heart on top
      const lx = 196;
      g.fillStyle = P.far[1]; g.fillRect(lx, 14, 9, BASE - 14); g.fillRect(lx + 4, 6, 1, 8);
      g.fillStyle = "rgba(42,31,61,.14)"; g.fillRect(lx + 7, 14, 2, BASE - 14);
      if (P.tint) { g.globalCompositeOperation = "source-atop"; g.fillStyle = P.tint; g.fillRect(0, 0, FAR_W, H); g.globalCompositeOperation = "source-over"; }
      wins.forEach(([wx, wy, k]) => {
        if (P.night) { if (k < 0.45) { g.fillStyle = k < 0.15 ? "#FF9EDB" : P.win; g.fillRect(wx, wy, 1, 2); } }
        else { g.fillStyle = P.win; g.globalAlpha = 0.75; g.fillRect(wx, wy, 1, 2); g.globalAlpha = 1; }
      });
      g.drawImage(spriteCanvas("heartSmall", P.night ? { R: "#FF6FB5" } : null, P.night ? "neon" : ""), lx, 7);
      blinks.forEach(([bx, by]) => { g.fillStyle = "#FF5E7E"; g.fillRect(bx, by, 1, 1); });
      return c;
    }

    function buildMid(P) {
      const rr = rng(11);
      const plan = [];
      let x = 0;
      SHOPS.forEach((s, i) => {
        const decor = i % 3 === 0 ? "pole" : i % 3 === 1 ? "palm" : "lamp";
        plan.push({ type: decor, x: x + 4 });
        x += decor === "palm" ? 12 : 9;
        const w = Math.max(30, textWidth(s.name) + 14) + Math.floor(rr() * 10);
        const h = 26 + Math.floor(rr() * 10);
        plan.push({ type: "shop", x, w, h, s });
        x += w + 2;
      });
      const MW = x;
      const c = mk(MW, H), g = c.getContext("2d");
      const glow = [];
      const ink = (px, py, w, h) => { g.fillStyle = INK; g.fillRect(px, py, w, h); };

      // shops
      plan.filter((p) => p.type === "shop").forEach(({ x, w, h, s }) => {
        const top = BASE - h;
        ink(x - 1, top - 1, w + 2, h + 1);
        g.fillStyle = s.wall; g.fillRect(x, top, w, h);
        g.fillStyle = s.trim; g.fillRect(x, top, w, 2);
        g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x, top + 2, w, 1);
        g.fillStyle = "rgba(42,31,61,.12)"; g.fillRect(x + w - 2, top + 2, 2, h - 2);
        // sign board
        const sw = textWidth(s.name) + 6, sx = x + Math.floor((w - sw) / 2), sy = top + 4;
        ink(sx - 1, sy - 1, sw + 2, 9);
        g.fillStyle = s.sign; g.fillRect(sx, sy, sw, 7);
        glow.push(() => drawText(g, s.name, sx + 3, sy + 1, s.text));
        // awning with scalloped edge
        const ay = sy + 10;
        ink(x, ay - 1, w, 1);
        for (let i = 0; i < w; i++) {
          g.fillStyle = s.awn[Math.floor(i / 3) % 2];
          g.fillRect(x + i, ay, 1, 4);
          if (i % 3 !== 2) g.fillRect(x + i, ay + 4, 1, 1);
        }
        // shop window + door
        const wy = ay + 7, wh = BASE - wy - 3, dw = 7, dx = x + w - dw - 3;
        const winX = x + 3, winW = dx - winX - 3;
        ink(winX - 1, wy - 1, winW + 2, wh + 2);
        ink(dx - 1, wy - 2, dw + 2, BASE - wy + 2);
        g.fillStyle = s.trim; g.fillRect(dx, wy - 1, dw, BASE - wy + 1);
        g.fillStyle = "#FFD84D"; g.fillRect(dx + dw - 2, wy + Math.floor((BASE - wy) / 2), 1, 1);
        glow.push((night) => {
          g.fillStyle = night ? "#FFE38A" : "#C9F2FF"; g.fillRect(winX, wy, winW, wh);
          g.fillStyle = night ? "#FFF6C9" : "#FFFFFF";
          for (let k = 0; k < Math.min(wh, 6); k++) { g.fillRect(winX + 2 + k, wy + wh - 1 - k, 1, 1); g.fillRect(winX + 5 + k, wy + wh - 1 - k, 1, 1); }
          drawShopItem(g, s.item, winX + Math.floor(winW / 2), wy + wh - 1);
          if (night) { g.fillStyle = "rgba(255,226,138,.28)"; g.fillRect(winX - 2, BASE, winW + 4, 3); }
        });
        // a planter by the door
        g.fillStyle = "#C47A3D"; g.fillRect(dx - 6, BASE - 3, 4, 3);
        g.fillStyle = "#7BE05A"; g.fillRect(dx - 7, BASE - 6, 6, 3); g.fillRect(dx - 6, BASE - 7, 4, 1);
      });

      // sidewalk + curb
      g.fillStyle = P.walk; g.fillRect(0, BASE, MW, 10);
      g.fillStyle = P.seam;
      for (let sx = 0; sx < MW; sx += 8) g.fillRect(sx, BASE, 1, 10);
      g.fillRect(0, BASE + 5, MW, 1);
      g.fillStyle = P.curb; g.fillRect(0, BASE + 10, MW, 1);
      g.fillStyle = INK; g.globalAlpha = 0.35; g.fillRect(0, BASE + 11, MW, 1); g.globalAlpha = 1;

      // decor: palms, lamps, poles
      const poles = [];
      plan.filter((p) => p.type !== "shop").forEach(({ type, x }) => {
        if (type === "palm") drawPalm(g, x, BASE + 3);
        else if (type === "lamp") {
          ink(x, BASE - 26, 2, 29); g.fillStyle = "#4A3D63"; g.fillRect(x, BASE - 26, 1, 29);
          ink(x - 2, BASE - 29, 6, 3);
          glow.push((night) => {
            g.fillStyle = night ? "#FFF2B0" : "#FFF7DD"; g.fillRect(x - 1, BASE - 28, 4, 1);
            if (night) { g.fillStyle = "rgba(255,236,150,.30)"; for (let k = 1; k < 8; k++) g.fillRect(x - k, BASE - 27 + k * 3, 2 * k + 2, 3); }
          });
        } else {
          ink(x, 16, 2, BASE - 13); g.fillStyle = "#8A5A33"; g.fillRect(x, 16, 1, BASE - 13);
          ink(x - 5, 20, 12, 1);
          g.fillStyle = "#D3CBE0"; g.fillRect(x - 5, 19, 1, 1); g.fillRect(x + 6, 19, 1, 1);
          poles.push(x);
        }
      });

      // tint everything drawn so far for the time of day, then light up the glowing bits
      if (P.tint) { g.globalCompositeOperation = "source-atop"; g.fillStyle = P.tint; g.fillRect(0, 0, MW, H); g.globalCompositeOperation = "source-over"; }
      glow.forEach((fn) => fn(!!P.night));

      // power cables + bunting between poles (wrapping around the strip so it tiles)
      const cable = (ax, bx, ay, sag, flags) => {
        for (let xx = ax; xx <= bx; xx++) {
          const tt = (xx - ax) / (bx - ax), yy = ay + Math.round(sag * 4 * tt * (1 - tt));
          [0, -MW].forEach((off) => {
            g.fillStyle = "rgba(42,31,61,.8)"; g.fillRect(xx + off, yy, 1, 1);
            if (flags && (xx - ax) % 6 === 3 && xx > ax + 3 && xx < bx - 3) {
              g.fillStyle = CONFETTI[Math.floor((xx - ax) / 6) % 6];
              g.fillRect(xx + off - 1, yy + 1, 3, 1); g.fillRect(xx + off, yy + 2, 1, 2);
            }
          });
        }
      };
      poles.forEach((px, i) => {
        const nx = i + 1 < poles.length ? poles[i + 1] : poles[0] + MW;
        cable(px - 5, nx - 5, 20, 6);
        cable(px + 6, nx + 6, 20, 9, true);
      });
      return c;
    }

    function drawShopItem(g, item, cx, by) {
      if (item === "dumbbell") {
        g.fillStyle = INK; g.fillRect(cx - 4, by - 4, 2, 4); g.fillRect(cx + 2, by - 4, 2, 4);
        g.fillStyle = "#8A7FA0"; g.fillRect(cx - 2, by - 2, 4, 1);
      } else if (item === "fruit") {
        [["#FF5E7E", -4], ["#FFD84D", -1], ["#7BE05A", 2]].forEach(([col, dx]) => { g.fillStyle = col; g.fillRect(cx + dx, by - 2, 2, 2); });
        g.fillStyle = "#FF9E5E"; g.fillRect(cx - 2, by - 4, 2, 2); g.fillRect(cx + 1, by - 4, 2, 2);
      } else if (item === "plant") {
        g.fillStyle = "#C47A3D"; g.fillRect(cx - 1, by - 2, 3, 2);
        g.fillStyle = "#3FB04A"; g.fillRect(cx - 2, by - 5, 1, 3); g.fillRect(cx, by - 6, 1, 4); g.fillRect(cx + 2, by - 5, 1, 3);
      } else {
        g.fillStyle = "#FF5E7E"; g.fillRect(cx - 2, by - 5, 5, 1); g.fillRect(cx - 2, by - 1, 5, 1); g.fillRect(cx - 3, by - 4, 1, 3); g.fillRect(cx + 3, by - 4, 1, 3);
        g.fillStyle = "#FFFFFF"; g.fillRect(cx - 1, by - 5, 1, 1); g.fillRect(cx + 3, by - 2, 1, 1);
      }
    }

    function drawPalm(g, x, base) {
      let tx = x, ty = base;
      for (let i = 0; i < 34; i++) {
        const px = x + Math.round(Math.sin(i / 11) * 2.5);
        g.fillStyle = INK; g.fillRect(px - 1, base - i, 4, 1);
        g.fillStyle = i % 4 < 2 ? "#C47A3D" : "#9A5C2C"; g.fillRect(px, base - i, 2, 1);
        tx = px; ty = base - i;
      }
      const frond = (dir, lift, len) => {
        for (let k = 0; k < len; k++) {
          const lx = tx + 1 + dir * k, ly = ty + Math.round((k * k) / (len * 0.9)) - lift + (k < 3 ? -1 : 0);
          g.fillStyle = INK; g.fillRect(lx, ly - 1, 1, 3);
        }
        for (let k = 0; k < len; k++) {
          const lx = tx + 1 + dir * k, ly = ty + Math.round((k * k) / (len * 0.9)) - lift + (k < 3 ? -1 : 0);
          g.fillStyle = "#5FD14A"; g.fillRect(lx, ly, 1, 1);
          g.fillStyle = "#3FB04A"; g.fillRect(lx, ly + 1, 1, 1);
        }
      };
      [[-1, 2, 11], [1, 2, 11], [-1, 0, 8], [1, 0, 8], [-1, 4, 6], [1, 4, 6]].forEach(([d, l, n]) => frond(d, l, n));
      g.fillStyle = "#7A4A26"; g.fillRect(tx, ty + 1, 2, 2);
    }

    // ----- per-frame -----
    function update(dt) {
      t += dt;
      if (performance.now() - palChecked > 60000) ensurePalette();
      const speed = 9 + 26 * state.ratio;
      camX += speed * dt;
      player.ft += dt * (5 + state.ratio * 6);
      if (player.air) {
        player.vy += 260 * dt; player.y += player.vy * dt;
        if (player.y >= 0) { player.y = 0; player.vy = 0; player.air = false; }
      } else if (state.allDone) {
        player.hopTimer -= dt;
        if (player.hopTimer <= 0) { jump(); player.hopTimer = 2.4; }
      }
      peds.forEach((p) => { p.x += p.v * dt; p.ft += dt * 4; });
      cars.forEach((c) => { c.x += c.v * dt; });
      birds.forEach((b) => { b.x += b.v * dt; b.f += dt * 5; });
      if (state.allDone) {
        fireworkTimer -= dt;
        if (fireworkTimer <= 0) { firework(); fireworkTimer = 1.1 + Math.random(); }
      }
      sparks = sparks.filter((s) => (s.life -= dt) > 0);
      sparks.forEach((s) => { s.vy += 30 * dt; s.x += s.vx * dt; s.y += s.vy * dt; });
    }

    function firework(x, y) {
      x = x == null ? 20 + Math.random() * (W - 40) : x;
      y = y == null ? 10 + Math.random() * 26 : y;
      const col = pick(CONFETTI);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2, sp = 18 + Math.random() * 10;
        sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7 + Math.random() * 0.4, c: i % 3 ? col : "#FFFFFF" });
      }
    }

    const wrapX = (x, span) => ((x % span) + span) % span;

    function tile(img, off, y) {
      const w = img.width;
      let x = -Math.floor(wrapX(off, w));
      for (; x < W; x += w) ctx.drawImage(img, x, y || 0);
    }

    function frame() {
      if (!ctx || !layers) return;
      ctx.drawImage(layers.sky, 0, 0);
      // stars at night
      if (P.night) stars.forEach((s) => { ctx.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.4 + s.p)); ctx.fillStyle = "#FFFFFF"; ctx.fillRect(Math.floor(s.x * W), s.y, 1, 1); });
      ctx.globalAlpha = 1;
      // sun / moon
      const sx = Math.floor(W * 0.8), sy = P.sunY;
      const disc = (rad, col) => { ctx.fillStyle = col; for (let dy = -rad; dy <= rad; dy++) { const half = Math.floor(Math.sqrt(rad * rad + rad - dy * dy)); ctx.fillRect(sx - half, sy + dy, half * 2 + 1, 1); } };
      if (P.night) { disc(6, P.sun); ctx.fillStyle = P.sky[0]; for (let dy = -6; dy <= 6; dy++) { const half = Math.floor(Math.sqrt(42 - dy * dy)); ctx.fillRect(sx - half + 3, sy + dy - 2, half * 2 + 1, 1); } }
      else { ctx.globalAlpha = 0.3; disc(11, P.core); ctx.globalAlpha = 1; disc(8, P.sun); disc(5, P.core); }
      // clouds
      clouds.forEach((c, i) => { const img = layers.clouds[i]; ctx.drawImage(img, Math.floor(wrapX(c.x - camX * 0.08 - t * 1.5, W + 70) - 35), c.y); });
      // birds
      if (!P.night) birds.forEach((b) => {
        const bx = Math.floor(wrapX(b.x, W + 20) - 10), by = Math.floor(b.y + Math.sin(t + b.f) * 2), up = Math.floor(b.f) % 2;
        ctx.fillStyle = INK;
        ctx.fillRect(bx, by + up, 1, 1); ctx.fillRect(bx + 1, by + 1 - up, 1, 1); ctx.fillRect(bx + 2, by + 1, 1, 1); ctx.fillRect(bx + 3, by + 1 - up, 1, 1); ctx.fillRect(bx + 4, by + up, 1, 1);
      });
      // fireworks
      sparks.forEach((s) => { ctx.globalAlpha = Math.min(1, s.life * 2); ctx.fillStyle = s.c; ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); });
      ctx.globalAlpha = 1;
      // city
      tile(layers.far, camX * 0.3);
      tile(layers.mid, camX);
      // people on the sidewalk, sorted back-to-front, with the player among them
      const actors = peds.map((p) => ({ feet: p.feet, draw: () => {
        const img = spriteCanvas(Math.floor(p.ft) % 2 ? "walkB" : "walkA", p.swap, p.key, p.v < 0);
        ctx.drawImage(img, Math.floor(wrapX(p.x - camX, W + 40) - 20), p.feet - 11);
      } }));
      actors.push({ feet: 81, draw: drawPlayer });
      actors.sort((a, b) => a.feet - b.feet).forEach((a) => a.draw());
      // road
      ctx.fillStyle = P.road; ctx.fillRect(0, BASE + 12, W, H - BASE - 12);
      ctx.fillStyle = "rgba(255,255,255,.07)"; ctx.fillRect(0, BASE + 12, W, 1);
      ctx.fillStyle = P.lane;
      for (let x = -Math.floor(wrapX(camX, 12)); x < W; x += 12) ctx.fillRect(x, 92, 6, 1);
      cars.filter((c) => c.lane === 0).forEach(drawCar);
      cars.filter((c) => c.lane === 1).forEach(drawCar);
      if (P.night) { ctx.fillStyle = "rgba(255,236,150,.18)"; cars.forEach((c) => { const x = carX(c); ctx.fillRect(c.v > 0 ? x + 21 : x - 8, (c.lane ? 90 : 83) + 4, 9, 3); }); }
      // HUD (home only)
      if (mode === "home") drawHud();
    }

    const carX = (c) => Math.floor(wrapX(c.x - camX, W + 80) - 40);
    function drawCar(c) {
      const img = spriteCanvas("car", { C: c.col[0], c: c.col[1] }, c.key, c.v < 0);
      ctx.drawImage(img, carX(c), c.lane ? 90 : 83);
    }

    function drawPlayer() {
      const name = player.air ? "runJump" : Math.floor(player.ft) % 2 ? "runB" : "runA";
      const bob = !player.air && Math.floor(player.ft) % 2 ? -1 : 0;
      const img = spriteCanvas(name, { V: "#6A4FD8", P: "#FF5E7E" }, "hero");
      const py = 70 + Math.round(player.y) + bob;
      // shadow
      ctx.fillStyle = "rgba(42,31,61,.25)"; ctx.fillRect(player.x + 2, 81, 6, 1);
      ctx.drawImage(img, player.x, py);
    }

    function drawHud() {
      const heart = spriteCanvas("heartSmall"), heartOff = spriteCanvas("heartSmall", { R: "#D3CBE0" }, "off");
      for (let i = 0; i < 3; i++) ctx.drawImage(i < state.meals ? heart : heartOff, 3 + i * 8, 3);
      const label = `${state.goalsDone}/${state.goalsTotal}`;
      const lw = textWidth(label) + 9;
      ctx.drawImage(spriteCanvas("starSmall"), W - lw - 4, 3);
      drawText(ctx, label, W - lw + 4, 4, "#FFFFFF", INK);
    }

    // ----- interaction -----
    function jump() {
      if (player.air || reduceMotion) return;
      player.air = true; player.vy = -78;
    }
    function say(text) {
      if (!bubble) return;
      const name = mode === "home" ? spotter() : "";
      bubble.innerHTML = name ? '<b class="px-bubble-name"></b><span></span>' : "<span></span>";
      if (name) bubble.querySelector("b").textContent = name;
      bubble.querySelector("span").textContent = text;
      bubble.style.left = (player.x + 5) * S + "px";
      bubble.classList.add("is-visible");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove("is-visible"), 2800);
    }
    function onTap() {
      jump(); SFX.jump();
      say(nextTip(mode, state));
      if (state.allDone && !reduceMotion) firework(player.x + 5, 30);
    }

    function start() {
      if (!wrap || !wrap.isConnected) return;
      if (reduceMotion) { frame(); return; }
      if (!raf && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function loop(ts) {
      raf = 0;
      if (!wrap.isConnected) return;
      if (ts - last >= 33) { update(Math.min(0.1, (ts - last) / 1000)); last = ts; frame(); }
      raf = requestAnimationFrame(loop);
    }

    return {
      mount(parent, after, m) {
        if (!wrap) build();
        mode = m;
        btn.setAttribute("aria-label", `The pixel city. Tap for a tip from ${(m === "home" && spotter()) || "your Spotter"}.`);
        wrap.classList.toggle("is-auth", m === "auth");
        const ref = after ? after.nextSibling : parent.firstChild;
        if (wrap.parentNode !== parent || (after && wrap.previousSibling !== after)) parent.insertBefore(wrap, ref);
        ensurePalette();
        resize();
        start();
        if (!greeted) { greeted = true; setTimeout(() => say(nextTip(mode, state)), 900); }
      },
      unmount() { if (wrap && wrap.parentNode) wrap.remove(); stop(); },
      setState(s) { state = s; frame(); },
      say(text) { if (wrap && wrap.isConnected) say(text); },
      celebrate() { jump(); if (!reduceMotion) { firework(); setTimeout(() => firework(), 350); } },
    };
  })();

  // ---------- decorating the app after every render ----------
  const EMOJI = {
    "🍳": ["egg", "egg"], "🍚": ["rice", "rice"], "🍽": ["plate", "plate"], "🍴": ["plate", "plate"], "🍎": ["apple", "apple"],
    "🎯": ["target", "target"], "🎉": ["star", "star"], "✨": ["sparkle", "sparkle"], "🌿": ["sprout", "leaf"], "🌱": ["sprout", "sprout"],
    "🏋": ["dumbbell", "dumbbell"], "📅": ["calendar", "calendar"], "💡": ["bulb", "tip"], "📖": ["book", "book"], "🔔": ["bell", "bell"],
    "📷": ["camera", "camera"], "😋": ["faceYum", "yum"], "🙂": ["faceSmile", "smile"], "😑": ["faceMeh", "meh"], "😬": ["faceGrimace", "grimace"],
    "🏝": ["island", "peak week"], "⚡": ["bolt", "bolt"], "◷": ["clock", "clock"], "✓": ["check", "done"], "✕": ["cross", "close"],
    "🍗": ["drumstick", "protein"], "💧": ["drop", "water"], "😴": ["moon", "sleep"], "👟": ["shoe", "steps"], "🙅": ["nope", "no snacking"],
    "⭐": ["star", "star"],
  };
  const EMOJI_RE = new RegExp("(" + Object.keys(EMOJI).join("|") + ")\\uFE0F?", "gu");
  const NAV = { dashboard: "house", workout: "dumbbell", plan: "scroll", progress: "trophy", profile: "hero" };
  const escapeText = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function icon(name, label) {
    const rows = SPRITES[name];
    return `<span class="px-ico px-ico-${name}" style="--sw:${rows[0].length};--sh:${rows.length}" role="img" aria-label="${label}">${spriteSVG(name)}</span>`;
  }

  function replaceEmoji(rootEl) {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentNode;
        if (!p || /^(TEXTAREA|OPTION|SCRIPT|STYLE|TITLE)$/.test(p.nodeName) || (p.closest && p.closest("svg,.px-ico"))) return NodeFilter.FILTER_REJECT;
        EMOJI_RE.lastIndex = 0;
        return EMOJI_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      const holder = document.createElement("span");
      holder.innerHTML = escapeText(n.nodeValue).replace(EMOJI_RE, (m, e) => icon(EMOJI[e][0], EMOJI[e][1]));
      n.replaceWith(...holder.childNodes);
    });
  }

  function mealHearts(app) {
    const wrap = app.querySelector(".meal-ring-wrap");
    if (!wrap || wrap.querySelector(".px-hearts")) return;
    const names = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
    const box = document.createElement("div");
    box.className = "px-hearts";
    wrap.querySelectorAll(".meal-ring-segment").forEach((seg) => {
      const type = seg.dataset.type, logged = seg.classList.contains("is-logged"), now = seg.classList.contains("is-now");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "px-heart" + (logged ? " is-logged" : now ? " is-now" : "");
      b.dataset.act = "openMeal"; b.dataset.type = type;
      b.setAttribute("aria-label", `${names[type]}, ${logged ? "logged" : "not logged"}`);
      const sprite = logged ? spriteSVG("heart") : now ? spriteSVG("heart", { R: "#FFD84D", r: "#F2A93B" }, "now") : spriteSVG("heart", { R: "#EFE8F7", r: "#D3CBE0" }, "empty");
      b.innerHTML = `${sprite}<span>${names[type]}</span>`;
      box.appendChild(b);
    });
    wrap.insertBefore(box, wrap.firstChild);
  }

  function placeScene(app) {
    // On Today the city sits under "Up next", so the first action stays at the top of the screen.
    const heading = app.querySelector(".home-stack > .next-quest") || app.querySelector(".home-stack > .screen-heading");
    const hero = app.querySelector(".auth-hero");
    if (heading) Scene.mount(heading.parentNode, heading, "home");
    else if (hero) Scene.mount(hero, hero.querySelector(".auth-brand"), "auth");
    else Scene.unmount();
  }

  let lastScore = null, lastPointer = { x: innerWidth / 2, y: innerHeight / 2 }, lastCoin = 0;
  function hud(app) {
    const s = score();
    const bar = app.querySelector(".app-topbar > div");
    if (!s) return;
    Scene.setState(s);
    let meter = null;
    if (bar) {
      bar.querySelectorAll(".px-xp").forEach((old) => old.remove());
      meter = document.createElement("div");
      meter.className = "px-xp";
      meter.setAttribute("role", "img");
      meter.setAttribute("aria-label", `Today's XP: ${s.xp} of ${s.max}`);
      meter.innerHTML = `<b>XP</b><i><span style="width:${Math.round(s.ratio * 100)}%"></span></i><em>${s.xp}</em>`;
      bar.appendChild(meter);
    }
    if (lastScore && s.xp > lastScore.xp) {
      if (Date.now() - lastCoin > 700) SFX.coin();
      FX.burst(lastPointer.x, lastPointer.y, 18);
      floatText(`+${s.xp - lastScore.xp} XP`, lastPointer.x, lastPointer.y - 18);
      if (meter) meter.classList.add("is-gain");
      let clearText = null;
      if (s.allDone && !lastScore.allDone) clearText = "Perfect day!";
      else if (s.meals === 3 && lastScore.meals < 3) clearText = "Meals clear!";
      else if (s.goalsDone === s.goalsTotal && lastScore.goalsDone < s.goalsTotal) clearText = "Habits clear!";
      else if (s.workoutDone && !lastScore.workoutDone) clearText = "Workout cleared!";
      if (clearText) setTimeout(() => banner(clearText), 250);
      else Scene.say(pick(REACTIONS));
    }
    lastScore = s;
  }

  function injectSettings(app) {
    const card = app.querySelector(".settings-card");
    if (!card || card.querySelector("[data-px-act]")) return;
    const anchor = card.querySelector('[data-act="signOut"]');
    if (!anchor) return;
    const row = (act, iconHtml, title, sub, on) =>
      `<button class="settings-row" data-px-act="${act}" aria-pressed="${on}"><span class="settings-icon">${iconHtml}</span><span><strong>${title}</strong><small>${sub}</small></span><i>${on ? "On" : "Off"}</i></button>`;
    let html = row("theme", prefs.on ? icon("gamepad", "game") : "🎮", "Pixel mode", "The game look, with your Spotter's animated city", prefs.on);
    if (prefs.on) html += row("sound", icon("speaker", "sound"), "Game sounds", "8-bit blips when you earn XP", prefs.sound);
    anchor.insertAdjacentHTML("beforebegin", html);
  }

  let decorating = false;
  function decorate() {
    const app = document.getElementById("app");
    if (!app) return;
    decorating = true;
    try {
      injectSettings(app);
      if (!prefs.on) { Scene.unmount(); return; }
      replaceEmoji(app);
      app.querySelectorAll(".bottom-nav button[data-v]").forEach((b) => {
        const svg = b.querySelector("svg.nav-icon");
        if (!svg) return;
        const s = document.createElement("span");
        s.className = "px-nav-ico"; s.innerHTML = spriteSVG(NAV[b.dataset.v] || "star");
        svg.replaceWith(s);
      });
      mealHearts(app);
      hud(app);
      placeScene(app);
    } finally {
      observer.takeRecords();
      decorating = false;
    }
  }
  // Ignore mutations inside the scene (its speech bubble changes text) — only real app renders matter.
  const observer = new MutationObserver((records) => {
    if (decorating) return;
    if (records.every((r) => r.target.closest && r.target.closest(".px-scene"))) return;
    decorate();
  });
  const appRoot = document.getElementById("app");
  if (appRoot) { observer.observe(appRoot, { childList: true, subtree: true }); decorate(); }

  // ---------- input feedback ----------
  document.addEventListener("pointerdown", (e) => { lastPointer = { x: e.clientX, y: e.clientY }; }, true);
  document.addEventListener("click", (e) => {
    const own = e.target.closest("[data-px-act]");
    if (own) {
      if (own.dataset.pxAct === "theme") { prefs.on = !prefs.on; savePrefs(); location.reload(); }
      else if (own.dataset.pxAct === "sound") {
        prefs.sound = !prefs.sound; savePrefs();
        own.setAttribute("aria-pressed", String(prefs.sound));
        own.querySelector("i").textContent = prefs.sound ? "On" : "Off";
        if (prefs.sound) SFX.coin();
      }
      return;
    }
    if (!prefs.on) return;
    const b = e.target.closest("[data-act]");
    if (!b) return;
    if (b.dataset.act === "habit") {
      if (b.classList.contains("is-done")) SFX.undo();
      else {
        SFX.coin(); lastCoin = Date.now();
        const r = b.getBoundingClientRect();
        FX.burst(r.left + r.width / 2, r.top + r.height / 2, 14);
      }
    } else SFX.tick();
  }, true);

  // ---------- charts ----------
  if (prefs.on && window.Chart) {
    // Numbers stay in Nunito: the pixel font's 5 reads as an S.
    const MAP = { "#58CC02": "#3FB04A", "#FFC800": "#F2A93B", "#CE82FF": "#8E6CF0" };
    Chart.register({
      id: "pixelMode",
      beforeUpdate(chart) {
        chart.data.datasets.forEach((ds) => {
          ds.tension = 0;
          ds.pointStyle = "rect";
          ["borderColor", "backgroundColor", "pointBackgroundColor"].forEach((k) => { if (MAP[ds[k]]) ds[k] = MAP[ds[k]]; });
          if (ds.pointRadius) { ds.pointRadius = 4; ds.pointHoverRadius = 6; ds.pointBorderColor = INK; ds.pointBorderWidth = 2; }
        });
        Object.values(chart.options.scales || {}).forEach((sc) => {
          if (sc.grid && sc.grid.display !== false) sc.grid.color = "rgba(42,31,61,.12)";
          if (sc.ticks) sc.ticks.color = "#5B4F70";
        });
      },
    });
  }

  if (prefs.on) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", INK);

  window.PixelMode = { prefs, spriteSVG, SPRITES, celebrate: (title, sub) => { if (prefs.on) banner(title, sub); } };
})();
