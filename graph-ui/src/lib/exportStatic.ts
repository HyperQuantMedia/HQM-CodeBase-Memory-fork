/* Standalone export: the current filtered view as one self-contained HTML file.
 *
 * The live app needs its server (search, code snippets, re-layout). A shared
 * artifact cannot, so the export bakes what is already on screen — the filtered
 * nodes with their current positions and colours, the edges between them — into
 * a page carrying its own miniature renderer. No server, no network, no
 * dependencies: openable from a mail attachment or a USB stick.
 *
 * Deliberately NOT the full app: this is a read-only viewer (orbit, zoom, hover,
 * click-to-inspect, label filter). Anything needing the index stays in the
 * live UI. */

import type { GraphEdge, GraphNode } from "./types";

export interface ExportOptions {
  project: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Baked into the page so it opens looking like the app did. */
  theme: "light" | "dark";
  /** Label → colour, including user overrides, so the legend matches. */
  labelColors: Record<string, string>;
  /** ISO timestamp string; the caller stamps it (this module stays pure). */
  generatedAt: string;
}

/* Trim to what the viewer actually draws — an export of a 50k-node graph should
 * not also carry qualified names and line numbers for every symbol. */
interface ExportNode {
  i: number;
  x: number;
  y: number;
  z: number;
  n: string;
  l: string;
  p?: string;
  s: number;
  c: string;
}

function escapeForScript(json: string): string {
  /* `</script>` inside a string literal would close the tag early; U+2028/9 are
   * literal line terminators in JS source. */
  return json
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
}

export function buildStaticPage(opts: ExportOptions): string {
  const index = new Map<number, number>();
  const nodes: ExportNode[] = opts.nodes.map((n, i) => {
    index.set(n.id, i);
    return {
      i,
      x: Math.round(n.x * 10) / 10,
      y: Math.round(n.y * 10) / 10,
      z: Math.round(n.z * 10) / 10,
      n: n.name,
      l: n.label,
      p: n.file_path,
      s: n.size,
      c: n.color,
    };
  });

  const edges: [number, number, string][] = [];
  for (const e of opts.edges) {
    const s = index.get(e.source);
    const t = index.get(e.target);
    if (s !== undefined && t !== undefined) edges.push([s, t, e.type]);
  }

  const payload = escapeForScript(
    JSON.stringify({
      project: opts.project,
      generatedAt: opts.generatedAt,
      theme: opts.theme,
      labelColors: opts.labelColors,
      nodes,
      edges,
    }),
  );

  const title = `Cartograph — ${opts.project}`;

  return `<!doctype html>
<html lang="en" data-theme="${opts.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root{
    color-scheme: dark;
    --bg:#07071a; --panel:#11122e; --border:#23264f; --ink:#eef1ff;
    --ink2:#aab4d8; --dim:#6b739c; --accent:#ffce6e;
  }
  :root[data-theme="light"]{
    color-scheme: light;
    --bg:#f7f8fc; --panel:#ffffff; --border:#d8dcec; --ink:#14162b;
    --ink2:#3c4260; --dim:#5c6284; --accent:#a86a00;
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden}
  body{background:var(--bg);color:var(--ink);
    font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
  header{position:fixed;top:0;left:0;right:0;height:44px;display:flex;
    align-items:center;gap:14px;padding:0 14px;background:var(--panel);
    border-bottom:1px solid var(--border);z-index:3}
  header b{font-size:13px;font-weight:600}
  header .meta{color:var(--dim);font-size:11px}
  header .spacer{flex:1}
  button{font:inherit;font-size:11px;color:var(--ink2);background:transparent;
    border:1px solid var(--border);border-radius:6px;padding:3px 8px;cursor:pointer}
  button:hover{color:var(--ink)}
  canvas{position:fixed;inset:44px 0 0 0;display:block;cursor:grab}
  canvas.drag{cursor:grabbing}
  #legend{position:fixed;left:12px;bottom:12px;max-height:45%;overflow:auto;
    background:var(--panel);border:1px solid var(--border);border-radius:10px;
    padding:8px 10px;z-index:2;min-width:150px}
  #legend h2{margin:0 0 6px;font-size:10px;letter-spacing:.09em;
    text-transform:uppercase;color:var(--dim);font-weight:500}
  #legend button{display:flex;align-items:center;gap:6px;width:100%;
    border:0;padding:2px 0;text-align:left;font-size:11px}
  #legend button.off{opacity:.32}
  #legend .dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto}
  #legend .ct{margin-left:auto;color:var(--dim);font-variant-numeric:tabular-nums}
  #info{position:fixed;right:12px;top:56px;width:260px;max-height:60%;
    overflow:auto;background:var(--panel);border:1px solid var(--border);
    border-radius:10px;padding:10px 12px;z-index:2;display:none}
  #info h3{margin:0 0 2px;font-size:12px;font-weight:600;word-break:break-word}
  #info .lbl{font-size:10px;color:var(--accent);text-transform:uppercase;
    letter-spacing:.07em}
  #info .path{margin-top:6px;font:11px/1.5 ui-monospace,monospace;
    color:var(--dim);word-break:break-all}
  #info .rel{margin-top:8px;font-size:11px;color:var(--ink2)}
  #tip{position:fixed;z-index:4;pointer-events:none;display:none;
    background:var(--panel);border:1px solid var(--border);border-radius:6px;
    padding:3px 7px;font-size:11px;white-space:nowrap}
  .hint{color:var(--dim);font-size:11px}
</style>
</head>
<body>
<header>
  <b>${escapeHtml(opts.project)}</b>
  <span class="meta" id="counts"></span>
  <span class="spacer"></span>
  <span class="hint">drag orbits · wheel zooms · click a node</span>
  <button id="reset">Reset view</button>
  <button id="theme">Theme</button>
</header>
<canvas id="c"></canvas>
<aside id="legend"><h2>Labels</h2><div id="rows"></div></aside>
<aside id="info"></aside>
<div id="tip"></div>
<script id="payload" type="application/json">${payload}</script>
<script>
(function(){
  "use strict";
  var D = JSON.parse(document.getElementById('payload').textContent);
  var N = D.nodes, E = D.edges;
  var canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  var tip = document.getElementById('tip'), info = document.getElementById('info');

  document.getElementById('counts').textContent =
    N.length.toLocaleString() + ' nodes · ' + E.length.toLocaleString() +
    ' edges · exported ' + D.generatedAt.slice(0, 10);

  /* ---- label filter + legend ---- */
  var counts = {};
  N.forEach(function(n){ counts[n.l] = (counts[n.l] || 0) + 1; });
  var off = {};
  var rows = document.getElementById('rows');
  Object.keys(counts).sort(function(a, b){ return counts[b] - counts[a]; })
    .forEach(function(label){
      var b = document.createElement('button');
      var color = D.labelColors[label] || '#94a3b8';
      b.innerHTML = '<span class="dot" style="background:' + color + '"></span>' +
        '<span>' + label.replace(/[&<>]/g, '') + '</span>' +
        '<span class="ct">' + counts[label].toLocaleString() + '</span>';
      b.onclick = function(){
        off[label] = !off[label];
        b.className = off[label] ? 'off' : '';
        draw();
      };
      rows.appendChild(b);
    });
  function visible(n){ return !off[n.l]; }

  /* ---- camera: yaw/pitch orbit + zoom, same feel as the live viewer ---- */
  var cam = { yaw: 0.5, pitch: 0.25, zoom: 1, panX: 0, panY: 0 };
  var home = JSON.parse(JSON.stringify(cam));
  var mid = { x: 0, y: 0, z: 0 }, span = 1;
  (function fit(){
    if (!N.length) return;
    var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    N.forEach(function(n){
      lo[0] = Math.min(lo[0], n.x); hi[0] = Math.max(hi[0], n.x);
      lo[1] = Math.min(lo[1], n.y); hi[1] = Math.max(hi[1], n.y);
      lo[2] = Math.min(lo[2], n.z); hi[2] = Math.max(hi[2], n.z);
    });
    mid = { x:(lo[0]+hi[0])/2, y:(lo[1]+hi[1])/2, z:(lo[2]+hi[2])/2 };
    span = Math.max(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) || 1;
  })();

  var W = 0, H = 0, dpr = 1, scale = 1;
  function resize(){
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    scale = Math.min(W, H) / (span * 1.35);
    draw();
  }

  var pos = new Float32Array(N.length * 2);
  var depth = new Float32Array(N.length);
  function project(){
    var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var k = scale * cam.zoom;
    for (var i = 0; i < N.length; i++){
      var n = N[i];
      var x = n.x - mid.x, y = n.y - mid.y, z = n.z - mid.z;
      var x1 = x * cy + z * sy, z1 = z * cy - x * sy;
      var y1 = y * cp - z1 * sp, z2 = z1 * cp + y * sp;
      pos[i*2]   = W/2 + x1 * k + cam.panX;
      pos[i*2+1] = H/2 - y1 * k + cam.panY;
      depth[i] = z2;
    }
  }

  function draw(){
    project();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* edges first, faint and additive so density reads as brightness */
    ctx.globalCompositeOperation = D.theme === 'light' ? 'source-over' : 'lighter';
    ctx.lineWidth = 1;
    ctx.strokeStyle = D.theme === 'light'
      ? 'rgba(60,66,96,0.13)' : 'rgba(150,170,255,0.10)';
    ctx.beginPath();
    for (var e = 0; e < E.length; e++){
      var a = E[e][0], b = E[e][1];
      if (!visible(N[a]) || !visible(N[b])) continue;
      ctx.moveTo(pos[a*2], pos[a*2+1]);
      ctx.lineTo(pos[b*2], pos[b*2+1]);
    }
    ctx.stroke();

    /* nodes back-to-front so near ones win */
    var order = [];
    for (var i = 0; i < N.length; i++) if (visible(N[i])) order.push(i);
    order.sort(function(p, q){ return depth[p] - depth[q]; });
    for (var oi = 0; oi < order.length; oi++){
      var idx = order[oi], n = N[idx];
      var r = Math.max(1.4, Math.min(9, (n.s || 3) * 0.5 * Math.sqrt(cam.zoom)));
      ctx.fillStyle = n.c;
      ctx.beginPath();
      ctx.arc(pos[idx*2], pos[idx*2+1], r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    /* labels only when the view is sparse enough to read them */
    if (order.length <= 220){
      ctx.fillStyle = D.theme === 'light' ? '#3c4260' : '#aab4d8';
      ctx.font = '11px system-ui,sans-serif';
      ctx.textBaseline = 'middle';
      for (var li = 0; li < order.length; li++){
        var j = order[li];
        ctx.fillText(N[j].n, pos[j*2] + 8, pos[j*2+1]);
      }
    }
  }

  function pick(mx, my){
    var best = -1, bestD = 14 * 14;
    for (var i = 0; i < N.length; i++){
      if (!visible(N[i])) continue;
      var dx = pos[i*2] - mx, dy = pos[i*2+1] - my;
      var d = dx*dx + dy*dy;
      if (d < bestD){ bestD = d; best = i; }
    }
    return best;
  }

  /* ---- interaction ---- */
  var drag = null;
  canvas.addEventListener('pointerdown', function(ev){
    drag = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey, moved: false };
    canvas.classList.add('drag');
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', function(ev){
    var my = ev.clientY - 44;
    if (drag){
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.shift){ cam.panX += dx; cam.panY += dy; }
      else {
        cam.yaw += dx * 0.006;
        cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.006));
      }
      drag.x = ev.clientX; drag.y = ev.clientY;
      tip.style.display = 'none';
      draw();
      return;
    }
    var hit = pick(ev.clientX, my);
    if (hit < 0){ tip.style.display = 'none'; return; }
    tip.textContent = N[hit].n + '  ·  ' + N[hit].l;
    tip.style.display = 'block';
    tip.style.left = (ev.clientX + 12) + 'px';
    tip.style.top = (ev.clientY + 12) + 'px';
  });
  canvas.addEventListener('pointerup', function(ev){
    var wasDrag = drag && drag.moved;
    drag = null;
    canvas.classList.remove('drag');
    if (wasDrag) return;
    var hit = pick(ev.clientX, ev.clientY - 44);
    if (hit < 0){ info.style.display = 'none'; return; }
    var n = N[hit];
    var rel = [];
    for (var e = 0; e < E.length && rel.length < 40; e++){
      if (E[e][0] === hit) rel.push('→ ' + N[E[e][1]].n + '  (' + E[e][2] + ')');
      else if (E[e][1] === hit) rel.push('← ' + N[E[e][0]].n + '  (' + E[e][2] + ')');
    }
    info.innerHTML =
      '<div class="lbl"></div><h3></h3>' +
      (n.p ? '<div class="path"></div>' : '') +
      '<div class="rel"></div>';
    info.querySelector('.lbl').textContent = n.l;
    info.querySelector('h3').textContent = n.n;
    if (n.p) info.querySelector('.path').textContent = n.p;
    info.querySelector('.rel').textContent = rel.length
      ? rel.join('\\n') : 'No connections in this view.';
    info.querySelector('.rel').style.whiteSpace = 'pre-wrap';
    info.style.display = 'block';
  });
  canvas.addEventListener('wheel', function(ev){
    ev.preventDefault();
    cam.zoom = Math.max(0.15, Math.min(14, cam.zoom * (ev.deltaY < 0 ? 1.12 : 0.89)));
    draw();
  }, { passive: false });

  document.getElementById('reset').onclick = function(){
    cam = JSON.parse(JSON.stringify(home));
    info.style.display = 'none';
    draw();
  };
  document.getElementById('theme').onclick = function(){
    D.theme = D.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', D.theme);
    draw();
  };
  document.addEventListener('keydown', function(ev){
    if (ev.key === 'Escape') info.style.display = 'none';
  });

  window.addEventListener('resize', resize);
  resize();
})();
</script>
</body>
</html>`;
}

/* Trigger a download of the built page. Split from buildStaticPage so the
 * generator stays testable without touching the DOM. */
export function downloadStaticPage(opts: ExportOptions) {
  const html = buildStaticPage(opts);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = opts.generatedAt.slice(0, 10);
  a.href = url;
  a.download = `cartograph-${opts.project}-${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Give the click a tick to start before the blob goes away. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
