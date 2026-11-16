/* ============================================================
   home.js — Home: the room where the Spotter lives, and the
   furniture catalogue. Each piece is earned by reaching a level
   or earning a badge (game.js), then claimed with a tap. Every
   piece has its own fixed spot in the room.

   Claimed pieces live in the auth user's metadata (home_items),
   next to spotter_name and spotter_look, so there's no schema
   change. Nothing is ever taken back: a claimed piece stays.

   Loaded after game.js and spotter.js, before app.js. The room
   is drawn as one SVG string, so it renders without a canvas.
   ============================================================ */

const HOME_W = 200, HOME_H = 150, HOME_FLOOR = 96;
const HOME_INK = "#2A1F3D", HOME_WOOD = "#C98A4E", HOME_WOOD_D = "#8A5A34", HOME_CREAM = "#FFF6E0";

// A tiny canvas-like painter that records rects for an SVG.
function homePainter() {
  const rects = [];
  return { rects, fillStyle: "#000", fillRect(x, y, w, h) { rects.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${this.fillStyle}"/>`); } };
}
const hr = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const hbox = (g, x, y, w, h, c) => { hr(g, x - 1, y - 1, w + 2, h + 2, HOME_INK); hr(g, x, y, w, h, c); };

// unlock: { type: "start" } | { type: "level", n } | { type: "badge", id }.
// x, y: the piece's fixed spot in the room (top-left, in room pixels).
const FURNITURE = {
  bed: { name: "Bed", w: 46, h: 28, x: 4, y: 72, unlock: { type: "start" }, draw(g, x, y) {
    hbox(g, x, y, 5, 27, HOME_WOOD); hr(g, x + 3, y, 2, 27, HOME_WOOD_D);
    hbox(g, x + 6, y + 17, 39, 7, HOME_WOOD); hr(g, x + 6, y + 22, 39, 2, HOME_WOOD_D);
    hr(g, x + 8, y + 25, 3, 3, HOME_INK); hr(g, x + 40, y + 25, 3, 3, HOME_INK);
    hbox(g, x + 6, y + 11, 39, 6, "#FFFFFF");
    hbox(g, x + 8, y + 7, 11, 6, HOME_CREAM); hr(g, x + 8, y + 11, 11, 2, "#F0DFC0");
    hbox(g, x + 21, y + 9, 24, 11, "#FF8AC8"); hr(g, x + 21, y + 12, 24, 2, "#FFC2E2"); hr(g, x + 21, y + 16, 24, 2, "#FFC2E2"); hr(g, x + 21, y + 19, 24, 1, "#E0609A");
  } },
  window: { name: "Window", w: 44, h: 38, x: 78, y: 10, unlock: { type: "start" }, draw(g, x, y, night) {
    const sky = night ? ["#1E2A5C", "#2A3A78", "#3A4C8E"] : ["#5EC8FF", "#8FDCFF", "#C8F0FF"];
    hr(g, x, y, 44, 1, HOME_INK);
    hbox(g, x + 4, y + 3, 36, 30, HOME_CREAM);
    hr(g, x + 7, y + 6, 30, 24, HOME_INK);
    hr(g, x + 8, y + 7, 28, 7, sky[0]); hr(g, x + 8, y + 14, 28, 6, sky[1]); hr(g, x + 8, y + 20, 28, 5, sky[2]);
    if (night) {
      hr(g, x + 28, y + 8, 4, 4, "#FFF3B0"); hr(g, x + 27, y + 9, 1, 2, "#FFF3B0"); hr(g, x + 30, y + 8, 2, 2, sky[0]);
      [[11, 9], [17, 12], [23, 8], [13, 17], [33, 16]].forEach(([sx, sy]) => hr(g, x + sx, y + sy, 1, 1, "#FFFFFF"));
    } else {
      hr(g, x + 11, y + 10, 8, 3, "#FFFFFF"); hr(g, x + 13, y + 9, 4, 1, "#FFFFFF"); hr(g, x + 26, y + 15, 7, 2, "#FFFFFF");
    }
    const hill = night ? ["#2F7A4A", "#235E39"] : ["#5ED44A", "#3FB04A"];
    hr(g, x + 8, y + 25, 28, 4, hill[0]); hr(g, x + 8, y + 24, 9, 1, hill[0]); hr(g, x + 24, y + 23, 12, 2, hill[0]); hr(g, x + 8, y + 28, 28, 1, hill[1]);
    hr(g, x + 21, y + 6, 2, 24, HOME_CREAM); hr(g, x + 7, y + 17, 30, 2, HOME_CREAM);
    hbox(g, x + 2, y + 34, 40, 3, HOME_CREAM);
    hbox(g, x + 1, y + 2, 6, 30, "#FF8AC8"); hr(g, x + 5, y + 2, 2, 30, "#E0609A");
    hbox(g, x + 37, y + 2, 6, 30, "#FF8AC8"); hr(g, x + 37, y + 2, 2, 30, "#E0609A");
  } },
  rug: { name: "Rug", w: 46, h: 16, x: 72, y: 124, unlock: { type: "level", n: 2 }, draw(g, x, y) {
    const inset = [7, 4, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4, 7];
    for (let i = 0; i < 16; i++) hr(g, x + inset[i] - 1, y + i - 1, 46 - inset[i] * 2 + 2, 3, HOME_INK);
    const oval = (pad, c) => { for (let i = pad; i < 16 - pad; i++) { const n = inset[i] + pad * 2; hr(g, x + n, y + i, 46 - n * 2, 1, c); } };
    oval(0, "#FF6B8B"); oval(2, "#FFD23F"); oval(4, HOME_CREAM); oval(6, "#FF8AC8");
  } },
  plant: { name: "Plant", w: 16, h: 28, x: 103, y: 70, unlock: { type: "level", n: 3 }, draw(g, x, y) {
    hbox(g, x + 6, y + 1, 4, 16, "#5ED44A");
    hbox(g, x + 1, y + 6, 5, 7, "#5ED44A"); hbox(g, x + 10, y + 3, 5, 8, "#5ED44A");
    hbox(g, x + 4, y + 11, 8, 6, "#3FB04A"); hr(g, x + 7, y + 3, 1, 12, "#B5F29A"); hr(g, x + 2, y + 7, 1, 4, "#B5F29A"); hr(g, x + 12, y + 4, 1, 5, "#B5F29A");
    hbox(g, x + 3, y + 18, 10, 3, "#FFB877"); hbox(g, x + 4, y + 21, 8, 6, "#FF9F4A"); hr(g, x + 10, y + 21, 2, 6, "#D97A2B");
  } },
  lamp: { name: "Lamp", w: 14, h: 42, x: 54, y: 57, unlock: { type: "level", n: 4 }, draw(g, x, y) {
    hr(g, x + 6, y + 10, 2, 28, HOME_INK);
    hbox(g, x + 3, y + 1, 8, 3, "#FFE680"); hbox(g, x + 1, y + 4, 12, 7, "#FFD23F"); hr(g, x + 1, y + 9, 12, 2, "#E0A72E");
    hbox(g, x + 3, y + 38, 8, 3, "#8A7FA0");
  } },
  shelf: { name: "Bookshelf", w: 30, h: 46, x: 70, y: 52, unlock: { type: "level", n: 5 }, draw(g, x, y) {
    hbox(g, x, y, 30, 45, HOME_WOOD); hr(g, x + 27, y, 3, 45, HOME_WOOD_D);
    const rows = [["#FF6B8B", "#5CC8FF", "#FFD23F", "#5ED44A", "#A98BFF"], ["#4FE3C1", "#FF9F4A", "#FF8AC8", "#5CC8FF"], ["#A98BFF", "#FFD23F", "#FF6B8B"]];
    [3, 17, 31].forEach((sy, row) => {
      hr(g, x + 3, y + sy, 23, 11, "#5A3A22");
      rows[row].forEach((c, i) => { const h = 7 + ((i * 3 + row) % 3); hr(g, x + 4 + i * 4, y + sy + 11 - h, 3, h, c); hr(g, x + 4 + i * 4, y + sy + 13 - h, 3, 1, HOME_CREAM); });
    });
    hr(g, x + 20, y + 36, 5, 6, "#FFD23F"); hr(g, x + 21, y + 34, 3, 2, "#FFD23F");
  } },
  sofa: { name: "Sofa", w: 34, h: 22, x: 150, y: 76, unlock: { type: "level", n: 7 }, draw(g, x, y) {
    hbox(g, x + 3, y, 28, 13, "#2FB896");
    hbox(g, x, y + 7, 6, 12, "#4FE3C1"); hbox(g, x + 28, y + 7, 6, 12, "#4FE3C1");
    hbox(g, x + 6, y + 11, 22, 8, "#4FE3C1"); hr(g, x + 16, y + 11, 1, 8, "#2FB896"); hr(g, x + 6, y + 17, 22, 2, "#2FB896");
    hr(g, x + 2, y + 20, 3, 2, HOME_INK); hr(g, x + 29, y + 20, 3, 2, HOME_INK);
    hbox(g, x + 8, y + 5, 7, 6, "#FFD23F");
  } },
  rack: { name: "Dumbbell rack", w: 34, h: 20, x: 8, y: 118, unlock: { type: "badge", id: "first-workout" }, draw(g, x, y) {
    hbox(g, x, y + 1, 3, 18, "#8A7FA0"); hbox(g, x + 31, y + 1, 3, 18, "#8A7FA0");
    hbox(g, x + 3, y + 7, 28, 2, "#B9B0CC"); hbox(g, x + 3, y + 16, 28, 2, "#B9B0CC");
    const bell = (bx, by, c) => { hbox(g, bx, by, 3, 5, c); hbox(g, bx + 7, by, 3, 5, c); hr(g, bx + 3, by + 2, 4, 1, HOME_INK); };
    bell(x + 5, y + 1, "#FF6B8B"); bell(x + 19, y + 1, "#5CC8FF"); bell(x + 5, y + 10, "#FFD23F"); bell(x + 19, y + 10, "#5ED44A");
  } },
  photos: { name: "Photo wall", w: 28, h: 22, x: 132, y: 12, unlock: { type: "badge", id: "photo-10" }, draw(g, x, y) {
    hbox(g, x, y + 2, 11, 9, HOME_CREAM); hr(g, x + 2, y + 4, 7, 5, "#FF9F4A"); hr(g, x + 4, y + 5, 3, 3, "#FFD23F");
    hbox(g, x + 15, y, 13, 11, HOME_CREAM); hr(g, x + 17, y + 2, 9, 7, "#5ED44A"); hr(g, x + 19, y + 4, 5, 3, "#FF6B8B");
    hbox(g, x + 6, y + 14, 14, 8, HOME_CREAM); hr(g, x + 8, y + 16, 10, 4, "#5CC8FF"); hr(g, x + 10, y + 17, 4, 2, "#FFFFFF");
  } },
  poster: { name: "Star poster", w: 20, h: 26, x: 24, y: 24, unlock: { type: "badge", id: "week-star" }, draw(g, x, y) {
    hbox(g, x, y, 20, 26, "#5CC8FF"); hr(g, x, y + 20, 20, 6, HOME_CREAM);
    const s = ["....Y....", "....Y....", "...YYY...", "YYYYYYYYY", ".YYYYYYY.", "..YYYYY..", "..YYYYY..", ".YYY.YYY.", ".YY...YY."];
    s.forEach((row, j) => Array.from(row).forEach((ch, i) => { if (ch === "Y") hr(g, x + 5 + i, y + 5 + j, 1, 1, "#FFD23F"); }));
    hr(g, x + 3, y + 22, 14, 1, HOME_INK); hr(g, x + 9, y - 1, 2, 2, "#FF6B8B");
  } },
  lights: { name: "String lights", w: 46, h: 10, x: 6, y: 8, unlock: { type: "badge", id: "all-habits" }, draw(g, x, y) {
    const cols = ["#FF6B8B", "#FFD23F", "#5ED44A", "#5CC8FF", "#FF8AC8", "#A98BFF"];
    const sag = (i) => Math.round(Math.sin(((i % 15) / 15) * Math.PI) * 3);
    for (let i = 0; i < 46; i++) hr(g, x + i, y + 1 + sag(i), 1, 1, HOME_INK);
    for (let i = 0; i < 6; i++) { const o = (3 + i * 7.5) | 0; hbox(g, x + o, y + 3 + sag(o), 3, 4, cols[i]); }
  } },
  trophy: { name: "Trophy shelf", w: 26, h: 18, x: 166, y: 34, unlock: { type: "badge", id: "high-score" }, draw(g, x, y) {
    hbox(g, x, y + 14, 26, 3, HOME_WOOD);
    hbox(g, x + 4, y + 1, 8, 6, "#FFD23F"); hr(g, x + 2, y + 2, 2, 3, "#E0A72E"); hr(g, x + 12, y + 2, 2, 3, "#E0A72E"); hr(g, x + 7, y + 8, 2, 3, "#E0A72E"); hbox(g, x + 5, y + 11, 6, 2, "#E0A72E");
    hbox(g, x + 17, y + 6, 5, 7, "#5CC8FF"); hr(g, x + 18, y + 3, 3, 3, "#FF6B8B");
  } },
  mat: { name: "Yoga mat", w: 34, h: 10, x: 152, y: 128, unlock: { type: "badge", id: "rest-day" }, draw(g, x, y) {
    hbox(g, x, y + 5, 28, 4, "#A98BFF"); hr(g, x, y + 8, 28, 1, "#6F52E0");
    hbox(g, x + 27, y + 1, 7, 8, "#C4B0FF"); hr(g, x + 29, y + 3, 3, 4, "#6F52E0"); hr(g, x + 30, y + 4, 1, 2, "#C4B0FF");
  } },
  arcade: { name: "Arcade machine", w: 24, h: 44, x: 123, y: 54, unlock: { type: "badge", id: "boss" }, draw(g, x, y) {
    hbox(g, x + 1, y, 22, 43, "#A98BFF"); hr(g, x + 20, y, 3, 43, "#6F52E0");
    hbox(g, x + 3, y + 2, 18, 5, "#FFD23F"); hr(g, x + 6, y + 4, 12, 1, HOME_INK);
    hbox(g, x + 4, y + 10, 16, 12, HOME_INK); hr(g, x + 6, y + 12, 3, 3, "#5ED44A"); hr(g, x + 12, y + 15, 2, 2, "#FF6B8B"); hr(g, x + 15, y + 12, 2, 2, "#FFD23F"); hr(g, x + 6, y + 19, 12, 1, "#5CC8FF");
    hbox(g, x, y + 25, 24, 5, "#C4B0FF"); hr(g, x + 4, y + 26, 2, 3, HOME_INK); hr(g, x + 12, y + 27, 3, 2, "#FF6B8B"); hr(g, x + 17, y + 27, 3, 2, "#FFD23F");
    hr(g, x + 9, y + 34, 6, 5, "#6F52E0"); hr(g, x + 11, y + 35, 2, 3, HOME_INK);
  } },
};
const FURNITURE_ORDER = ["bed", "window", "rug", "plant", "lamp", "shelf", "sofa", "rack", "photos", "poster", "lights", "trophy", "mat", "arcade"];
// Drawn back to front, so floor pieces sit in front of wall pieces.
const FURNITURE_LAYERS = ["lights", "poster", "window", "photos", "trophy", "bed", "lamp", "shelf", "plant", "arcade", "sofa", "rug", "rack", "mat"];

// The spot on the rug where the Spotter stands.
const HOME_BUDDY = { x: 79, y: 102, size: 32 };

function homeClaimedIds() {
  const list = AUTH.user && AUTH.user.user_metadata && AUTH.user.user_metadata.home_items;
  return Array.isArray(list) ? list.filter((id) => FURNITURE[id]) : [];
}

function furnitureHow(f) {
  if (f.unlock.type === "start") return "Comes with the room";
  if (f.unlock.type === "level") return `Reach level ${f.unlock.n}`;
  const b = BADGES.find((x) => x.id === f.unlock.id);
  return `Earn ${b ? b.title : "a badge"}`;
}
function furnitureEarnedLine(f) {
  if (f.unlock.type === "level") return `Level ${f.unlock.n} reached`;
  const b = BADGES.find((x) => x.id === f.unlock.id);
  return `${b ? b.title : "Badge"} earned`;
}

// Every piece with its state: "in" (in the room), "ready" (earned, waiting to be claimed) or "locked".
function furnitureList(game) {
  const claimed = new Set(homeClaimedIds());
  const level = game ? game.level : 1;
  const badges = new Set(game ? game.badges.filter((b) => b.earned).map((b) => b.id) : []);
  return FURNITURE_ORDER.map((id) => {
    const f = FURNITURE[id];
    const open = f.unlock.type === "start" || (f.unlock.type === "level" && level >= f.unlock.n) || (f.unlock.type === "badge" && badges.has(f.unlock.id));
    const state = f.unlock.type === "start" || claimed.has(id) ? "in" : open ? "ready" : "locked";
    return { id, f, state };
  });
}
function homeReadyCount(game) { return furnitureList(game).filter((p) => p.state === "ready").length; }

function homeIsNight() {
  let forced = null;
  try { forced = new URLSearchParams(location.search).get("pxTime"); } catch (e) {}
  if (forced) return forced === "night";
  const h = new Date().getHours();
  return h >= 19 || h < 5;
}

// The room as one SVG: wall, floor, every piece in the room, and dashed spots for pieces ready to claim.
function homeRoomSVG(list, night, label) {
  const g = homePainter();
  const W = HOME_W, H = HOME_H, F = HOME_FLOOR;
  const wall = night ? ["#B9AEE0", "#AFA2D9", "#9A8BCB"] : ["#E6DCFF", "#DCCFFB", "#C4B0FF"];
  hr(g, 0, 0, W, F, wall[0]);
  for (let x = 0; x < W; x += 12) hr(g, x, 0, 6, F, wall[1]);
  for (let x = 3; x < W; x += 12) for (let y = 6; y < F - 6; y += 12) hr(g, x + ((y / 12) % 2 ? 6 : 0), y, 1, 1, wall[2]);
  hr(g, 0, 0, W, 4, wall[2]); hr(g, 0, 4, W, 1, HOME_INK);
  hr(g, 0, F - 5, W, 1, HOME_INK); hr(g, 0, F - 4, W, 4, HOME_CREAM); hr(g, 0, F, W, 1, HOME_INK);
  const floor = night ? ["#C99466", "#A8723F", "#D9A97A"] : ["#EDB579", "#C98A4E", "#F6CC9A"];
  hr(g, 0, F + 1, W, H - F, floor[0]);
  for (let y = F + 1, i = 0; y < H; y += 8, i++) {
    hr(g, 0, y + 7, W, 1, floor[1]);
    for (let x = (i % 2) * 22 + 10; x < W; x += 44) hr(g, x, y, 1, 7, floor[1]);
    hr(g, 0, y, W, 1, floor[2]);
  }
  const has = (id) => list.some((p) => p.id === id && p.state === "in");
  if (has("lamp")) {
    const l = FURNITURE.lamp;
    g.fillStyle = night ? "rgba(255,230,128,.45)" : "rgba(255,230,128,.25)";
    g.fillRect(l.x - 8, l.y - 6, l.w + 16, 26); g.fillRect(l.x - 4, l.y - 10, l.w + 8, 34);
    if (night) { g.fillStyle = "rgba(255,230,128,.25)"; g.fillRect(l.x - 10, F + 1, l.w + 20, 8); }
  }
  FURNITURE_LAYERS.forEach((id) => {
    const p = list.find((x) => x.id === id);
    const f = FURNITURE[id];
    if (p.state === "in") f.draw(g, f.x, f.y, night);
    else if (p.state === "ready") homeDashed(g, f.x, f.y, f.w, f.h);
  });
  // the Spotter's shadow on the rug
  const b = HOME_BUDDY;
  g.fillStyle = "rgba(42,31,61,.25)"; g.fillRect(b.x + 2, b.y + b.size - 3, b.size - 4, 3); g.fillRect(b.x + 5, b.y + b.size, b.size - 10, 1);
  const a11y = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"';
  return `<svg class="home-room-art" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" ${a11y} focusable="false">${g.rects.join("")}</svg>`;
}
function homeDashed(g, x, y, w, h) {
  g.fillStyle = "rgba(255,210,63,.35)"; g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = "rgba(42,31,61,.55)";
  for (let i = 0; i < w; i++) if (i % 4 < 2) { g.fillRect(x + i, y, 1, 1); g.fillRect(x + i, y + h - 1, 1, 1); }
  for (let i = 0; i < h; i++) if (i % 4 < 2) { g.fillRect(x, y + i, 1, 1); g.fillRect(x + w - 1, y + i, 1, 1); }
}

// One piece on its own, for a catalogue tile.
const furnitureSvgCache = {};
function furnitureSVG(id) {
  if (furnitureSvgCache[id]) return furnitureSvgCache[id];
  const f = FURNITURE[id], g = homePainter(), S = 48;
  f.draw(g, Math.floor((S - f.w) / 2), Math.floor((S - f.h) / 2), false);
  return (furnitureSvgCache[id] = `<svg viewBox="0 0 ${S} ${S}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${g.rects.join("")}</svg>`);
}

const HOME_LINES = {
  pat: ["Hehe, that tickles!", "Aww. Right back at you.", "Best pat of the day."],
  dance: ["Dance break! You earned it.", "Watch this move!", "Shimmy, shimmy!"],
  nap: ["Zzz… five more minutes.", "Resting is part of training too.", "Wake me for the next quest."],
  tip: ["I like it here.", "Every badge you earn can make this place cosier.", "Levels bring new furniture. Keep going!", "Home is where the snacks are. Kidding. Mostly."],
};
// Pixel icons for the room's action bar. Letters are colours; an ink outline is added around each shape.
const HOME_ICONS = {
  pat: { label: "Pat", pal: { R: "#FF5E7E", r: "#C9385C", W: "#FFFFFF" }, rows: [
    ".RRR...RRR.", "RWWRR.RRRRR", "RWRRRRRRRRR", "RRRRRRRRRRR", "RRRRRRRRRrR", ".RRRRRRRrR.", "..RRRRRrR..", "...RRRrR...", "....RrR....", ".....R....."] },
  dance: { label: "Dance", pal: { V: "#9C7BFF", v: "#6A4FD8" }, rows: [
    "...VVVVVVVV", "...VVVVVVVV", "...V......V", "...V......V", "...V......V", "...V......V", ".VVV....VVV", "VVVV...VVVV", "VVVv...VVVv", ".vv.....vv."] },
  nap: { label: "Nap", pal: { Y: "#FFD84D", y: "#E0A72E", W: "#FFFFFF" }, rows: [
    "..YYY...WWWW", ".YYY......W.", "YYY......W..", "YYY.....WWWW", "YYY.........", "YYYY........", ".yYYYYYYy...", "..yyyyyy...."] },
};
const homeIconCache = {};
function homeIconSVG(name) {
  if (homeIconCache[name]) return homeIconCache[name];
  const { pal } = HOME_ICONS[name];
  // Pad with a blank pixel on every side so the ink outline isn't clipped at the edges.
  const blank = ".".repeat(HOME_ICONS[name].rows[0].length + 2);
  const rows = [blank, ...HOME_ICONS[name].rows.map((r) => `.${r}.`), blank];
  const h = rows.length, w = rows[0].length;
  const px = rows.map((r) => Array.from(r, (ch) => (ch === "." ? null : pal[ch])));
  const out = px.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[y][x]) continue;
    if ((y > 0 && px[y - 1][x]) || (y < h - 1 && px[y + 1][x]) || px[y][x - 1] || px[y][x + 1]) out[y][x] = HOME_INK;
  }
  let rects = "";
  out.forEach((r, y) => r.forEach((c, x) => { if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; }));
  return (homeIconCache[name] = `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`);
}

const pct = (n, of) => `${Math.round((n / of) * 10000) / 100}%`;

// The Home screen. ui.homeAct is what the Spotter is doing (pat, dance, nap, tip) and ui.homeLine what it says.
function homeTab(game) {
  const list = furnitureList(game);
  const ready = list.filter((p) => p.state === "ready");
  const inRoom = list.filter((p) => p.state === "in").length;
  const name = spotterName() || "Your Spotter";
  const look = spotterLook();
  const act = ui.homeAct || "";
  const frame = act === "nap" ? "blink" : act === "pat" || act === "dance" ? "cheer" : "idle";
  let line = ui.homeLine;
  if (!line) {
    const next = list.find((p) => p.state === "locked");
    line = ready.length ? `Welcome home! ${ready.length === 1 ? "One new thing is" : `${ready.length} new things are`} ready for the room.`
      : next ? `Welcome home! Next up: the ${next.f.name.toLowerCase()}. ${furnitureHow(next.f)} to get it.`
      : "Welcome home! Every piece is here. This place feels like us.";
  }

  const tags = ready.map((p) => `<button class="home-claim-tag" data-act="claimFurniture" data-v="${p.id}" style="left:${pct(p.f.x, HOME_W)};top:${pct(p.f.y, HOME_H)}" aria-label="Claim the ${escapeHtml(p.f.name.toLowerCase())}">CLAIM</button>`).join("");
  const b = HOME_BUDDY;
  const extras = act === "pat" ? '<i class="home-heart">♥</i><i class="home-heart">♥</i>' : act === "nap" ? '<i class="home-zz">Z</i><i class="home-zz">z</i>' : "";
  const buddy = `<button class="home-buddy${act ? ` is-${act}` : ""}" data-act="homeAct" data-v="tip" style="left:${pct(b.x, HOME_W)};top:${pct(b.y, HOME_H)};width:${pct(b.size, HOME_W)}" aria-label="${escapeHtml(name)}. Tap to chat.">${spotterSVG(look, frame)}${extras}</button>`;

  const hud = Object.keys(HOME_ICONS).map((k) => `<button class="home-hud-btn${act === k ? " is-on" : ""}" data-act="homeAct" data-v="${k}" aria-pressed="${act === k}" aria-label="${HOME_ICONS[k].label} ${escapeHtml(name)}" title="${HOME_ICONS[k].label}">${homeIconSVG(k)}</button>`).join("");

  const rank = { ready: 0, in: 1, locked: 2 };
  const tiles = list.slice().sort((a, c) => rank[a.state] - rank[c.state]).map((p) => {
    const foot = p.state === "in" ? '<small>✓ In your room</small>'
      : p.state === "ready" ? `<button class="btn3d home-claim" data-act="claimFurniture" data-v="${p.id}">Claim</button><small>${furnitureEarnedLine(p.f)}</small>`
      : `<small>${furnitureHow(p.f)}</small>`;
    return `<div class="home-tile is-${p.state}"><span class="home-tile-art">${furnitureSVG(p.id)}</span><b>${escapeHtml(p.f.name)}</b>${foot}</div>`;
  }).join("");

  return `<div class="home-stack home-screen">
    <div class="home-top"><button class="secondary-button home-back" data-act="leaveHome">◀ Street</button><h1>Home</h1><span class="home-level">LV ${game ? game.level : 1}</span></div>
    <div class="home-room"><div class="home-room-view">${homeRoomSVG(list, homeIsNight(), `Your room. ${inRoom} of ${list.length} pieces in place.`)}${tags}${buddy}</div>
      <div class="home-hud" role="group" aria-label="Play with ${escapeHtml(name)}">${hud}</div></div>
    <section class="home-talk"><b class="home-talk-name">${escapeHtml(name)}</b><p aria-live="polite">${escapeHtml(line)}</p></section>
    <section class="home-catalogue"><div class="card-heading"><div><span>FURNITURE</span><h2>Catalogue</h2></div><small>${inRoom} of ${list.length} in your room</small></div>
      <div class="home-grid">${tiles}</div></section>
  </div>`;
}

// The door on Today's street.
function homeDoorButton(game) {
  const n = homeReadyCount(game);
  return `<button class="home-door" data-act="goHome" aria-label="Go home${n ? `. ${n} to claim` : ""}">🏠 Go home${n ? `<em>${n}</em>` : ""}</button>`;
}
