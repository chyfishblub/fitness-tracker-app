/* ============================================================
   spotter.js — the Spotter's looks. Juno is the app; the Spotter
   is the buddy each person names and dresses up. Five pixel
   creatures in seven colours, each with idle, blink and cheer
   frames. The chosen look lives in the auth user's metadata
   (spotter_look), next to spotter_name, so there's no schema change.

   Loaded before app.js, pixel.js and auth.js, which all draw it.
   ============================================================ */

// Grid letters: B body, L belly, D shade, O inner ear, P cheek, W eye white,
// e eye top (closes on blink and cheer), E eye bottom, M mouth, m open mouth (cheer only).
// An ink outline is added around every shape.
const SPOTTER_KINDS = {
  bunny: { label: "Bunny", rows: [
    "...BB......BB...", "...BOB....BOB...", "...BOB....BOB...", "...BOB....BOB...",
    "..BBBBBBBBBBBB..", ".BBBBBBBBBBBBBB.", ".BBBeBBBBBBeBBB.", ".BBBEBBBBBBEBBB.",
    ".BPPBBBMMBBBPPB.", ".BBBBBBmmBBBBBB.", "..BBBBBBBBBBBB..", "...BBLLLLLLBB...",
    "..BBLLLLLLLLBB..", "..BBLLLLLLLLBB..", "..DDDD....DDDD..", "................"] },
  cat: { label: "Cat", rows: [
    "................", "..BB........BB..", "..BOB......BOB..", "..BOOBBBBBBOOB..",
    ".BBBBBBBBBBBBBB.", ".BBBBBBBBBBBBBB.", ".BBBeBBBBBBeBBB.", ".BBBEBBBBBBEBBB.",
    ".BPPBBBMMBBBPPB.", ".BBBBBBmmBBBBBB.", "..BBBBBBBBBBBB..", "...BBLLLLLLBB...",
    "..BBLLLLLLLLBB..", "..BBLLLLLLLLBB..", "..DDDD....DDDD..", "................"] },
  frog: { label: "Frog", rows: [
    "................", "..BBBB....BBBB..", ".BWWeWB..BWeWWB.", ".BWWEWBBBBWEWWB.",
    ".BBBBBBBBBBBBBB.", ".BBBBBBBBBBBBBB.", ".BPPBMMMMMMBPPB.", ".BBBBBmmmmBBBBB.",
    "..BBBBBBBBBBBB..", "..BBLLLLLLLLBB..", "..BBLLLLLLLLBB..", "..BBLLLLLLLLBB..",
    "...BBBBBBBBBB...", ".DDDD......DDDD.", "................", "................"] },
  bear: { label: "Bear", rows: [
    "................", "..BBB......BBB..", ".BBOBB....BBOBB.", ".BBBBBBBBBBBBBB.",
    ".BBBBBBBBBBBBBB.", ".BBBeBBBBBBeBBB.", ".BBBEBBLLBBEBBB.", ".BPPBBLMMLBBPPB.",
    ".BBBBBLmmLBBBBB.", "..BBBBLLLLBBBB..", "...BBBBBBBBBB...", "..BBLLLLLLLLBB..",
    "..BBLLLLLLLLBB..", "..BBBLLLLLLBBB..", "..DDDD....DDDD..", "................"] },
  blob: { label: "Blob", rows: [
    "................", "................", "......BBBB......", "....BBBBBBBB....",
    "...BLLBBBBBBB...", "..BLLBBBBBBBBB..", "..BBBeBBBBeBBB..", ".BBBBEBBBBEBBBB.",
    ".BBPPBBMMBBPPBB.", ".BBBBBBmmBBBBBB.", ".BBBBBBBBBBBBBB.", ".BBBBBBBBBBBBBB.",
    ".BBBBBBBBBBBBBB.", ".DBBD.DBBD.DBBD.", "..DD...DD...DD..", "................"] },
};

// [body, belly, shade]
const SPOTTER_COLORS = {
  lilac: { label: "Lilac", c: ["#B9A2FF", "#EDE6FF", "#7F63E0"] },
  pink: { label: "Pink", c: ["#FF9EC4", "#FFE1EE", "#E0609A"] },
  peach: { label: "Peach", c: ["#FFB98A", "#FFE9D9", "#E8803F"] },
  sunny: { label: "Sunny", c: ["#FFD84D", "#FFF6CC", "#E0A72E"] },
  mint: { label: "Mint", c: ["#7FE8C8", "#DDFBF0", "#2FB896"] },
  sky: { label: "Sky", c: ["#8FD8FF", "#E2F5FF", "#3AA8E8"] },
  cocoa: { label: "Cocoa", c: ["#C48A5C", "#F2DCC4", "#8A5A34"] },
};

const SPOTTER_DEFAULT_LOOK = { kind: "bunny", color: "lilac" };
const SPOTTER_INK = "#2A1F3D";

function normalizeSpotterLook(look) {
  const l = look || {};
  return {
    kind: SPOTTER_KINDS[l.kind] ? l.kind : SPOTTER_DEFAULT_LOOK.kind,
    color: SPOTTER_COLORS[l.color] ? l.color : SPOTTER_DEFAULT_LOOK.color,
  };
}

// frame: "idle" | "blink" | "cheer"
const spotterSvgCache = {};
function spotterSVG(look, frame) {
  const { kind, color } = normalizeSpotterLook(look);
  frame = frame || "idle";
  const key = `${kind}|${color}|${frame}`;
  if (spotterSvgCache[key]) return spotterSvgCache[key];
  const [body, belly, shade] = SPOTTER_COLORS[color].c;
  const closed = frame !== "idle";
  const pal = {
    B: body, L: belly, D: shade, O: "#FF6FA8", P: "#FF7AA8", W: "#FFFFFF",
    e: closed ? body : SPOTTER_INK, E: SPOTTER_INK, M: SPOTTER_INK, m: frame === "cheer" ? "#C9385C" : body,
  };
  const rows = SPOTTER_KINDS[kind].rows;
  const h = rows.length, w = rows[0].length;
  const px = rows.map((r) => Array.from(r, (ch) => (ch === "." ? null : pal[ch] || null)));
  const out = px.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[y][x]) continue;
    if ((y > 0 && px[y - 1][x]) || (y < h - 1 && px[y + 1][x]) || px[y][x - 1] || px[y][x + 1]) out[y][x] = SPOTTER_INK;
  }
  let rects = "";
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = out[y][x];
      if (!c) { x++; continue; }
      let run = 1;
      while (x + run < w && out[y][x + run] === c) run++;
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`;
      x += run;
    }
  }
  return (spotterSvgCache[key] = `<svg viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects}</svg>`);
}

// The picker used on Me and in onboarding. Buttons carry data-spotter-kind / data-spotter-color;
// the caller wires the clicks.
function spotterPickerHTML(look, opts) {
  const l = normalizeSpotterLook(look);
  const showColors = !opts || opts.colors !== false;
  const kinds = Object.keys(SPOTTER_KINDS).map((k) =>
    `<button type="button" class="spotter-pick${k === l.kind ? " is-selected" : ""}" data-spotter-kind="${k}" aria-pressed="${k === l.kind}" aria-label="${SPOTTER_KINDS[k].label}">${spotterSVG({ kind: k, color: l.color })}</button>`).join("");
  const colors = Object.keys(SPOTTER_COLORS).map((c) =>
    `<button type="button" class="spotter-swatch${c === l.color ? " is-selected" : ""}" data-spotter-color="${c}" aria-pressed="${c === l.color}" aria-label="${SPOTTER_COLORS[c].label}" style="--swatch:${SPOTTER_COLORS[c].c[0]}"></button>`).join("");
  return `<div class="spotter-picks" role="group" aria-label="Pick your buddy">${kinds}</div>` +
    (showColors ? `<div class="spotter-swatches" role="group" aria-label="Pick a colour">${colors}</div>` : "");
}
