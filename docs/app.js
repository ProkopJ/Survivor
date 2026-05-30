const D = window.SURVIVOR;
const PAL = ["#E8623A", "#1F9E92", "#E7AE3A", "#3E6FA3", "#8E5BA6", "#C0473E", "#6B8E3A"];
let state = { series: D.series_order[0], metric: "btw", roundIdx: 0 };
let rankChart = null, tlChart = null;

const seriesSel = document.getElementById("seriesSel");
D.series_order.forEach(k => {
  const o = document.createElement("option");
  o.value = k; o.textContent = D.series[k].label; seriesSel.appendChild(o);
});
const slider = document.getElementById("krSlider");

function setSeries(k) {
  state.series = k;
  const s = D.series[k]; const n = s.rounds.length; const hasFin = !!s.finale;
  const max = Math.max(0, n - 1 + (hasFin ? 1 : 0));
  slider.max = max; state.roundIdx = n - 1; slider.value = state.roundIdx;
  document.getElementById("sliderBox").style.display = max > 0 ? "" : "none";
  render();
}
let playTimer = null;
const playBtn = document.getElementById("playBtn");
function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; } playBtn.textContent = "▶ Přehrát"; playBtn.classList.remove("on"); }
function startPlay() {
  const max = +slider.max;
  if (state.roundIdx >= max) { state.roundIdx = 0; slider.value = 0; render(); }
  playBtn.textContent = "⏸ Pauza"; playBtn.classList.add("on");
  playTimer = setInterval(() => {
    if (state.roundIdx >= +slider.max) { stopPlay(); return; }
    state.roundIdx++; slider.value = state.roundIdx; render();
  }, 1900);
}
playBtn.onclick = () => { playTimer ? stopPlay() : startPlay(); };

seriesSel.onchange = () => { stopPlay(); setSeries(seriesSel.value); };
slider.oninput = () => { stopPlay(); state.roundIdx = +slider.value; render(); };
document.querySelectorAll("#metricWrap button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#metricWrap button").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); state.metric = b.dataset.m; render(false);
});
document.querySelectorAll("button.exp").forEach(b => b.onclick = () => {
  html2canvas(document.getElementById(b.dataset.t), { scale: 2, backgroundColor: "#F3EEE4" })
    .then(c => { const a = document.createElement("a"); a.download = `survivor_${state.series}_${b.dataset.t}.png`; a.href = c.toDataURL("image/png"); a.click(); });
});

function curRound() { return D.series[state.series].rounds[state.roundIdx]; }

const DUR = 850;
function renderRanking(r) {
  const rows = [...r.ranking].sort((a, b) => b[state.metric] - a[state.metric]);
  document.getElementById("rankSub").textContent = `Metrika: ${state.metric === "btw" ? "betweenness (hlavní)" : "eigenvector + betweenness"}` + (r.eliminated ? ` · vypadl(a): ${r.eliminated}` : "");
  document.getElementById("winnerBox").innerHTML = `<div class="winner">Favorit: <b>${rows[0].nick}</b> · ${rows[0][state.metric]} %</div>`;
  const svg = d3.select("#rankSvg");
  const W = svg.node().clientWidth, n = rows.length, rowH = 30, padT = 8, bh = rowH - 8, m = { l: 96, r: 56 };
  svg.attr("height", padT * 2 + n * rowH);
  const maxv = d3.max(rows, d => d[state.metric]) || 1;
  const x = d3.scaleLinear().domain([0, maxv]).range([m.l, W - m.r]);
  const Y = i => padT + i * rowH;
  const sel = svg.selectAll("g.bar").data(rows, d => d.nick);
  sel.exit().transition().duration(DUR / 2).style("opacity", 0).remove();
  const en = sel.enter().append("g").attr("class", "bar").style("opacity", 0).attr("transform", (d, i) => `translate(0,${Y(i)})`);
  en.append("rect").attr("class", "bx").attr("x", m.l).attr("height", bh).attr("rx", 5).attr("width", 0);
  en.append("text").attr("class", "nm").attr("x", m.l - 8).attr("text-anchor", "end").attr("y", bh / 2 + 5).attr("font-weight", 800).attr("font-size", 13).attr("fill", "#2A2A28");
  en.append("text").attr("class", "vl").attr("y", bh / 2 + 5).attr("font-weight", 800).attr("font-size", 12).attr("fill", "#6B6256");
  const all = en.merge(sel);
  all.transition().duration(DUR).ease(d3.easeCubicInOut).style("opacity", 1).attr("transform", (d, i) => `translate(0,${Y(i)})`);
  all.select("rect.bx").transition().duration(DUR).ease(d3.easeCubicInOut)
    .attr("width", d => Math.max(2, x(d[state.metric]) - m.l)).attr("fill", (d, i) => i === 0 ? "#E8623A" : "#1F9E92");
  all.select("text.nm").text(d => d.nick);
  all.select("text.vl").transition().duration(DUR).ease(d3.easeCubicInOut).attr("x", d => x(d[state.metric]) + 6)
    .tween("t", function (d) { const self = d3.select(this); const c0 = parseFloat(self.text()) || 0; const ip = d3.interpolateNumber(c0, d[state.metric]); return t => self.text(ip(t).toFixed(1) + " %"); });
  all.order();
}

function renderTreemap(r) {
  const svg = d3.select("#tmSvg");
  const Wt = svg.node().parentNode.clientWidth, Ht = Math.round(Wt * 0.6);
  svg.attr("width", Wt).attr("height", Ht).style("display", "block");
  const size = { w: Wt, h: Ht };
  const groups = {};
  r.ranking.forEach(p => { const g = p.voted || "nehlasoval"; (groups[g] = groups[g] || []).push(p); });
  const gnames = Object.keys(groups);
  const root = d3.hierarchy({ children: gnames.map(g => ({ name: g, children: groups[g].map(p => ({ name: p.nick, value: Math.max(p[state.metric], 0.01) })) })) }).sum(d => d.value).sort((a, b) => b.value - a.value);
  d3.treemap().size([size.w, size.h]).paddingInner(3).paddingOuter(2)(root);
  const gi = {}; root.children.forEach((c, i) => gi[c.data.name] = i);
  // adaptivní popisek: zmenšuj font dokud se jméno nevejde do dlaždice; teprve při extrému usekni/skryj
  const fitLabel = function (d) {
    const w = d.x1 - d.x0, h = d.y1 - d.y0, pad = 7;
    const t1 = d3.select(this).select("text.t1"), t2 = d3.select(this).select("text.t2");
    if (w < 24 || h < 16) { t1.text(""); t2.text(""); return; }
    let fs = Math.min(14, h - 6); const node = t1.text(d.data.name).attr("font-size", fs).node();
    while (fs > 7 && node.getComputedTextLength() > w - pad * 2) { fs -= 0.5; t1.attr("font-size", fs); }
    if (node.getComputedTextLength() > w - pad * 2) { // i při min fontu moc dlouhé → usekni
      let nm = d.data.name;
      while (nm.length > 1 && node.getComputedTextLength() > w - pad * 2) { nm = nm.slice(0, -1); t1.text(nm + "…"); }
    }
    t1.attr("y", fs + 3);
    const showPct = h > fs + 18 && w > 40;
    t2.text(showPct ? Math.round(d.data.value) + " %" : "").attr("y", fs + 17).attr("font-size", Math.min(12, fs));
  };
  const sel = svg.selectAll("g.tile").data(root.leaves(), d => d.data.name);
  sel.exit().transition().duration(DUR / 2).style("opacity", 0).remove();
  const en = sel.enter().append("g").attr("class", "tile").style("opacity", 0).attr("transform", d => `translate(${d.x0},${d.y0})`);
  en.append("rect").attr("rx", 4);
  en.append("title");
  en.append("text").attr("class", "tmlabel t1").attr("x", 7);
  en.append("text").attr("class", "tmlabel t2").attr("x", 7).attr("opacity", .85);
  const all = en.merge(sel);
  all.transition().duration(DUR).ease(d3.easeCubicInOut).style("opacity", 1).attr("transform", d => `translate(${d.x0},${d.y0})`);
  all.select("rect").transition().duration(DUR).ease(d3.easeCubicInOut)
    .attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0).attr("fill", d => PAL[gi[d.parent.data.name] % PAL.length]);
  all.select("title").text(d => `${d.data.name} · ${Math.round(d.data.value)} %`);
  all.each(fitLabel);
}

function renderTree(r) {
  const svg = d3.select("#treeSvg"); svg.selectAll("*").remove();
  if (!r.tree) return;
  const W = svg.node().clientWidth, H = 470, m = { l: 26, r: 26, t: 16, b: 130 };
  const PW = W - m.l - m.r, PH = H - m.t - m.b;
  const X = lp => m.l + lp * PW;
  const Y = dx => m.t + dx * PH;
  const line = d3.line().x(d => X(d[1])).y(d => Y(d[0]));
  svg.append("g").selectAll("path").data(r.tree.links).enter().append("path")
    .attr("d", d => line(d.p)).attr("fill", "none").attr("stroke", d => d.k ? "#3A3733" : "#CBC2B0")
    .attr("stroke-width", d => d.k ? 3.5 : 2.5).attr("stroke-linejoin", "round").attr("stroke-linecap", "round");
  const PALc = ["#E8623A", "#1F9E92", "#E7AE3A", "#3E6FA3", "#8E5BA6", "#C0473E", "#6B8E3A"];
  const blocs = r.blocs || [];
  const blocColor = {}; blocs.forEach((b, i) => b.members.forEach(mm => blocColor[mm] = PALc[i % PALc.length]));
  const yb = Y(1);
  // vrstva NA větvích: obarvení dle hlasovací skupiny tohoto kola; sdílená větev = čerchovaně (dvoubarevně)
  r.tree.links.forEach(d => {
    if (!d.bl || !d.bl.length) return;
    if (d.bl.length === 1) {
      svg.append("path").attr("d", line(d.p)).attr("fill", "none").attr("stroke", PALc[d.bl[0] % PALc.length])
        .attr("stroke-width", 2.6).attr("stroke-linecap", "round").attr("stroke-linejoin", "round").attr("opacity", 0.95);
    } else {
      d.bl.forEach((gi, j) => {
        svg.append("path").attr("d", line(d.p)).attr("fill", "none").attr("stroke", PALc[gi % PALc.length])
          .attr("stroke-width", 2.6).attr("stroke-linecap", "butt")
          .attr("stroke-dasharray", `5 ${5 * (d.bl.length - 1)}`).attr("stroke-dashoffset", j * 5);
      });
    }
  });
  const g = svg.selectAll("g.lf").data(r.tree.leaves).enter().append("g").attr("transform", d => `translate(${X(d.y)},${yb})`);
  g.append("circle").attr("r", 6).attr("fill", d => d.e ? "#A89E8C" : (blocColor[d.l] || "#2A2A28")).attr("stroke", "#F3EEE4").attr("stroke-width", 2);
  g.append("text").attr("transform", "rotate(38)").attr("x", 11).attr("dy", "0.32em").attr("class", "leaflbl")
    .attr("fill", d => d.e ? "#A89E8C" : "#2A2A28").style("text-decoration", d => d.e ? "line-through" : "none").text(d => d.l);
}

function renderBlocs(r) {
  const el = document.getElementById("blocs"); el.innerHTML = "";
  r.blocs.forEach((b, i) => {
    const col = PAL[i % PAL.length];
    const div = document.createElement("div");
    div.className = "bloc"; div.style.borderTopColor = col;
    div.innerHTML = `<h3 style="color:${col}">hlasovali na ${b.target}</h3>` + b.members.map(m => `<span class="chip">${m}</span>`).join("");
    el.appendChild(div);
  });
}

function renderTimeline(sk) {
  const tl = D.series[sk].timeline;
  const labels = tl.rounds.map(k => `KR ${k}`);
  const winner = D.series[sk].winner;
  const datasets = Object.entries(tl.players).map(([nm, vals], i) => ({
    label: nm, data: vals, spanGaps: false, tension: .3,
    borderColor: nm === winner ? "#E8623A" : PAL[(i + 1) % PAL.length],
    borderWidth: nm === winner ? 4 : 2, pointRadius: 2, fill: false
  }));
  if (tlChart) tlChart.destroy();
  tlChart = new Chart(document.getElementById("tlChart"), {
    type: "line", data: { labels, datasets },
    options: { maintainAspectRatio: false, animation: false, responsive: true, resizeDelay: 120,
      plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { ticks: { callback: v => v + " %", color: "#6B6256" }, grid: { color: "#E0D6C4" } },
                x: { ticks: { color: "#2A2A28", font: { weight: "700" } }, grid: { display: false } } } }
  });
}

function renderFinale(s) {
  const fb = document.getElementById("finaleBox");
  fb.innerHTML = s.finale.finalists.map(f => {
    const win = f.nick === s.finale.winner;
    return `<div style="display:flex;align-items:center;gap:14px;padding:11px 16px;margin:7px 0;background:#fff;border-radius:12px;${win ? "border:2px solid #E8623A" : "border:1px solid #D8CEBC"}">
      <div style="font-weight:900;font-size:24px;width:34px;color:${win ? "#E8623A" : "#8A8073"}">${f.pos}.</div>
      <div style="font-weight:800;font-size:18px;flex:1">${f.nick}${win ? " 🏆" : ""}</div>
      <div style="color:#6B6256;font-size:13px;font-weight:700">${f.jury ? f.jury + " hlasů poroty" : ""}</div>
    </div>`;
  }).join("");
}

function renderPairs(s) {
  const svg = d3.select("#pairsSvg"); svg.selectAll("*").remove();
  const W = svg.node().clientWidth, H = 300, base = H - 70;
  if (!s.pairs || !s.pairs.length) { svg.append("text").attr("x", 16).attr("y", 40).attr("fill", "#8A8073").attr("font-size", 14).text("Zatím málo kol pro výpočet silných dvojic."); return; }
  const players = [...new Set(s.pairs.flatMap(p => [p.a, p.b]))];
  const x = d3.scalePoint().domain(players).range([50, W - 50]);
  s.pairs.forEach(p => {
    const x1 = x(p.a), x2 = x(p.b), mx = (x1 + x2) / 2, h = base - Math.min(Math.abs(x2 - x1) * 0.5, base - 24);
    svg.append("path").attr("d", `M${x1},${base} Q${mx},${h} ${x2},${base}`).attr("fill", "none")
      .attr("stroke", "#1F9E92").attr("stroke-width", 1 + p.ag / 100 * 8).attr("opacity", 0.22 + p.ag / 100 * 0.5)
      .append("title").text(`${p.a} + ${p.b}: ${p.ag}%`);
  });
  const g = svg.selectAll("g.pl").data(players).enter().append("g").attr("transform", d => `translate(${x(d)},${base})`);
  g.append("circle").attr("r", 5).attr("fill", "#2A2A28");
  g.append("text").attr("transform", "rotate(38)").attr("x", 9).attr("dy", "0.3em").attr("class", "leaflbl").attr("font-size", 13).attr("fill", "#2A2A28").text(d => d);
}

// ---- FLOW STRIP (notový zápis): sloupce = kmenovky, čáry = hráči protékající koly ----
function playerColors(s) {
  const set = new Set();
  s.rounds.forEach(r => (r.blocs || []).forEach(b => b.members.forEach(m => set.add(m))));
  const names = [...set].sort((a, b) => a.localeCompare(b, "cs"));
  const cmap = {}; names.forEach((n, i) => cmap[n] = d3.interpolateTurbo((i + 0.5) / names.length));
  return cmap;
}
function stripGeom(s) {
  const top = 40, rowH = 22, gap = 15;
  const cols = s.rounds.map(r => {
    const T = {}; (r.blocs || []).forEach(b => b.members.forEach(m => T[m] = b.target));
    const players = Object.keys(T), elim = r.most_voted || r.eliminated;
    const cnt = {}; players.forEach(n => cnt[T[n]] = (cnt[T[n]] || 0) + 1);
    const targets = Object.keys(cnt).sort((a, b) => (b === elim) - (a === elim) || cnt[b] - cnt[a] || a.localeCompare(b, "cs"));
    const pos = {}, center = {}; let y = top;
    targets.forEach(t => {
      const mem = players.filter(n => T[n] === t).sort((a, b) => a.localeCompare(b, "cs")); const y0 = y;
      mem.forEach(n => { pos[n] = y + rowH / 2; y += rowH; });
      center[t] = (y0 + y) / 2; y += gap;
    });
    return { r, T, players, targets, pos, center, elim, h: y };
  });
  return { cols, top, rowH, maxH: Math.max(...cols.map(c => c.h)) };
}
function drawStrip(g, geo, xOf, colorOf, opts) {
  const { cols } = geo; opts = opts || {}; const hidden = opts.hidden || new Set();
  g.selectAll("*").remove();
  cols.forEach((c, i) => {
    const x = xOf(i);
    g.append("text").attr("x", x).attr("y", 22).attr("text-anchor", "middle").attr("font-weight", 800).attr("fill", "#6B6256").attr("font-size", 12).text(`${c.r.n}.`);
    c.targets.forEach(t => g.append("text").attr("x", x).attr("y", c.center[t] - 9).attr("text-anchor", "middle").attr("font-size", 8.5).attr("font-weight", 700)
      .attr("fill", t === c.elim ? "#C0473E" : "#A89E8C").text((t === c.elim ? "☠" : "→") + t));
  });
  for (let i = 0; i < cols.length - 1; i++) {
    const a = cols[i], b = cols[i + 1], xa = xOf(i), xb = xOf(i + 1), mid = (xa + xb) / 2;
    a.players.filter(n => b.pos[n] != null && !hidden.has(n)).forEach(n => {
      const op = opts.emph ? (opts.emph === i + 1 ? 0.95 : 0.16) : 0.82;
      g.append("path").attr("d", `M${xa},${a.pos[n]} C${mid},${a.pos[n]} ${mid},${b.pos[n]} ${xb},${b.pos[n]}`)
        .attr("fill", "none").attr("stroke", colorOf(n)).attr("stroke-width", 2.2).attr("opacity", op)
        .attr("stroke-dasharray", n === b.elim ? "5 4" : null).append("title").text(n);
    });
  }
  cols.forEach((c, i) => {
    const x = xOf(i), showN = !opts.emph || Math.abs(i - opts.emph) <= 1 || i === opts.emph - 1;
    c.players.forEach(n => {
      if (hidden.has(n)) return;
      g.append("circle").attr("cx", x).attr("cy", c.pos[n]).attr("r", 3).attr("fill", n === c.elim ? "#C0473E" : colorOf(n));
      if (showN) g.append("text").attr("x", x + 6).attr("y", c.pos[n] + 3.5).attr("font-size", 10).attr("font-weight", 700)
        .attr("fill", n === c.elim ? "#C0473E" : "#4D4A44").text(n);
    });
  });
}
function renderFlow(idx) {
  const svg = d3.select("#flowSvg"); svg.selectAll("*").remove();
  const W = svg.node().clientWidth, s = D.series[state.series];
  if (s.rounds.length < 2) { svg.attr("height", 70); svg.append("text").attr("x", 16).attr("y", 40).attr("fill", "#8A8073").attr("font-size", 14).text("Zatím málo kol."); return; }
  const geo = stripGeom(s), cmap = playerColors(s);
  const colW = 168, padL = 34, xOf = i => padL + i * colW;
  svg.attr("height", geo.maxH + 8);
  const strip = svg.append("g").attr("class", "strip");
  drawStrip(strip, geo, xOf, n => cmap[n], { emph: idx });
  const cx = idx >= 1 ? (xOf(idx - 1) + xOf(idx)) / 2 : xOf(0);
  strip.transition().duration(DUR).ease(d3.easeCubicInOut).attr("transform", `translate(${W / 2 - cx},0)`);
}
let flowHidden = new Set();
function renderFlowFull() {
  const svg = d3.select("#flowFullSvg"); svg.selectAll("*").remove();
  const W = svg.node().clientWidth, s = D.series[state.series];
  if (s.rounds.length < 2) return;
  const geo = stripGeom(s), cmap = playerColors(s);
  const n = geo.cols.length, padL = 44, padR = 30, colW = (W - padL - padR) / Math.max(1, n - 1), xOf = i => padL + i * colW;
  svg.attr("height", geo.maxH + 8);
  drawStrip(svg.append("g"), geo, xOf, x => cmap[x], { hidden: flowHidden });
  // legenda s vypínáním hráčů (jako u vývoje šancí)
  const leg = d3.select("#flowFullLegend"); leg.html("");
  Object.keys(cmap).sort((a, b) => a.localeCompare(b, "cs")).forEach(nm => {
    const chip = leg.append("span").attr("class", "flchip").style("opacity", flowHidden.has(nm) ? 0.35 : 1);
    chip.append("span").attr("class", "fldot").style("background", cmap[nm]);
    chip.append("span").text(nm);
    chip.on("click", () => { flowHidden.has(nm) ? flowHidden.delete(nm) : flowHidden.add(nm); renderFlowFull(); });
  });
}

// ---- per-card slidery: každý graf má vlastní posuvník kol (nezávislé prohlížení jedné statistiky) ----
const DYN = ["rankCard", "tmCard", "treeCard", "flowCard"];
const cardIdx = {}, cardCtl = {};
function renderCard(id, i) {
  const r = D.series[state.series].rounds[i];
  if (id === "rankCard") renderRanking(r);
  else if (id === "tmCard") { renderTreemap(r); renderBlocs(r); }
  else if (id === "treeCard") renderTree(r);
  else if (id === "flowCard") renderFlow(i);
}
function buildCardSliders() {
  // řízeno jen globálním sliderem (sticky lišta nahoře); karty zůstávají ve své pozici
  DYN.forEach(id => { cardCtl[id] = { card: document.getElementById(id) }; });
}

let prevFin;
function render(reset = true) {
  const s = D.series[state.series], nR = s.rounds.length;
  const isFin = s.finale && state.roundIdx >= nR;
  if (prevFin !== undefined && prevFin !== isFin) window.scrollTo({ top: 0, behavior: "smooth" });
  prevFin = isFin;
  document.getElementById("krLabel").textContent = isFin ? "Finále" : `${s.rounds[state.roundIdx].n}. kmenová rada po sloučení`;
  ["rankCard", "tmCard", "flowCard"].forEach(id => document.getElementById(id).style.display = isFin ? "none" : "");
  document.getElementById("pairsCard").style.display = isFin ? "none" : "";
  document.getElementById("finaleCard").style.display = isFin ? "" : "none";
  document.getElementById("flowFullCard").style.display = isFin ? "" : "none";
  const treeCard = document.getElementById("treeCard"), tmCard = document.getElementById("tmCard");
  treeCard.style.display = "";
  const wrap = treeCard.parentNode, tlCard = document.getElementById("tlCard");
  renderTimeline(state.series);
  renderPairs(s);
  const ridx = Math.min(state.roundIdx, nR - 1);
  if (isFin) {
    renderFinale(s); renderFlowFull();
    treeCard.querySelector("h2").textContent = "Finální strom aliancí";
    if (tlCard.nextSibling !== treeCard) wrap.insertBefore(treeCard, tlCard.nextSibling); // strom až za časovou osu (3. karta)
    renderTree(s.rounds[nR - 1]);
    return;
  }
  if (tmCard.nextSibling !== treeCard) wrap.insertBefore(treeCard, tmCard.nextSibling); // zpět hned za treemapu
  treeCard.querySelector("h2").textContent = "Strom aliancí";
  DYN.forEach(id => renderCard(id, ridx));
}
let rsz; window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => render(false), 160); });
buildCardSliders();
setSeries(state.series);
