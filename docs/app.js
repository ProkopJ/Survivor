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
  // dohraná série → otevři rovnou na finále (max); živá série → poslední odehrané kolo
  slider.max = max; state.roundIdx = hasFin ? max : n - 1; slider.value = state.roundIdx;
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
  const W = svg.node().clientWidth, rowH = 30, padT = 8, bh = rowH - 8, m = { l: 96, r: 56 };
  // Konstantní výška = rezervace pro max. počet hráčů v sérii → obsah neposkakuje při posunu kol
  const nMax = Math.max(...D.series[state.series].rounds.map(rr => rr.ranking.length));
  svg.attr("height", padT * 2 + nMax * rowH);
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
  const Wt = svg.node().clientWidth, Ht = Math.round(Wt * 0.6);
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

let _blocsKey = null; // live-reload test
function renderBlocs(r) {
  const el = document.getElementById("blocs");
  const build = rb => {
    el.innerHTML = "";
    rb.blocs.forEach((b, i) => {
      const col = PAL[i % PAL.length];
      const div = document.createElement("div");
      div.className = "bloc"; div.style.borderTopColor = col;
      div.innerHTML = `<h3 style="color:${col}">hlasovali na ${b.target}</h3>` + b.members.map(m => `<span class="chip">${m}</span>`).join("");
      el.appendChild(div);
    });
  };
  // rezervuj konstantní výšku = max přes sérii (proti poskakování obsahu pod bloky)
  const key = state.series + "@" + el.clientWidth;
  if (_blocsKey !== key) {
    el.style.minHeight = "0";
    let mx = 0;
    for (const rr of D.series[state.series].rounds) { build(rr); if (el.offsetHeight > mx) mx = el.offsetHeight; }
    el.style.minHeight = mx + "px"; _blocsKey = key;
  }
  build(r);
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
  // FINÁLNÍ ODDS = predikce modelu mezi finalisty (poslední kolo, přenormováno na 100 %)
  const finalists = s.finale.finalists.map(f => f.nick);
  const lastRank = s.rounds[s.rounds.length - 1].ranking.filter(x => finalists.includes(x.nick));
  const tot = lastRank.reduce((a, x) => a + (x[state.metric] || 0), 0) || 1;
  const odds = {}; lastRank.forEach(x => odds[x.nick] = (x[state.metric] || 0) / tot * 100);
  const oddOrder = [...lastRank].sort((a, b) => (odds[b.nick]) - (odds[a.nick]));
  const oddsHtml = oddOrder.length ? `<div style="background:#fff;border:1px solid #D8CEBC;border-radius:12px;padding:13px 16px;margin-bottom:12px">
    <div style="font-size:12px;font-weight:800;color:#8A8073;margin-bottom:9px">FINÁLNÍ ODDS — predikce modelu (${state.metric === "btw" ? "betweenness" : "eig+btw"})</div>
    ${oddOrder.map((x, i) => `<div style="display:flex;align-items:center;gap:9px;margin:5px 0">
      <div style="width:64px;font-weight:800;font-size:13px;color:${i === 0 ? "#E8623A" : "#2A2A28"}">${x.nick}</div>
      <div style="flex:1;background:#EFE9DD;border-radius:6px;height:16px;overflow:hidden"><div style="width:${Math.max(2, odds[x.nick])}%;height:100%;background:${i === 0 ? "#E8623A" : "#1F9E92"}"></div></div>
      <div style="width:46px;text-align:right;font-weight:800;font-size:12px;color:#6B6256">${odds[x.nick].toFixed(1)} %</div>
    </div>`).join("")}
    <div style="font-size:10.5px;color:#A89E8C;margin-top:8px;font-style:italic">Pozn.: model nezná hlasy poroty — odds jsou z hlasovací sítě, ne predikce poroty.</div>
  </div>` : "";
  fb.innerHTML = oddsHtml + s.finale.finalists.map(f => {
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

// ---- FLOW: fixní vodorovné pruhy (1 hráč = 1 pruh), čerchované vodicí linky ----
function playerColors(s) {
  const set = new Set();
  s.rounds.forEach(r => (r.blocs || []).forEach(b => b.members.forEach(m => set.add(m))));
  const names = [...set].sort((a, b) => a.localeCompare(b, "cs"));
  const cmap = {}; names.forEach((n, i) => cmap[n] = d3.interpolateTurbo((i + 0.5) / names.length));
  return cmap;
}
function elimSet(r) { return new Set(String(r.eliminated || "").split(",").map(x => x.trim()).filter(Boolean)); }
function targetMap(r) { const T = {}; (r.blocs || []).forEach(b => b.members.forEach(m => T[m] = b.target)); return T; }
function voteRanking(r) {
  const arr = (r.blocs || []).map(b => ({ target: b.target, votes: b.members.length }))
    .sort((a, b) => b.votes - a.votes || a.target.localeCompare(b.target, "cs"));
  // standardní pořadí (1,2,2,4): stejný počet hlasů = stejná příčka
  let rank = 0;
  arr.forEach((v, i) => { if (i > 0 && v.votes < arr[i - 1].votes) rank = i; v.rank = rank; });
  return arr;
}
// fixní pořadí hráčů: finalisté nahoře (dle pozice), pak dle vyřazení (později vyřazený výš)
function flowOrder(s) {
  const players = new Set();
  s.rounds.forEach(r => (r.blocs || []).forEach(b => b.members.forEach(m => players.add(m))));
  const elimAt = {};
  s.rounds.forEach(r => elimSet(r).forEach(nm => { if (elimAt[nm] == null) elimAt[nm] = r.n; }));
  const fin = {}; ((s.finale && s.finale.finalists) || []).forEach(f => fin[f.nick] = f.pos);
  return [...players].sort((a, b) => {
    const fa = fin[a] != null, fb = fin[b] != null;
    if (fa && fb) return fin[a] - fin[b];
    if (fa) return -1; if (fb) return 1;
    return (elimAt[b] || 99) - (elimAt[a] || 99);
  });
}

// ===== Přesuny mezi koly: alluvial mezi PŘEDCHOZÍM (vlevo) a AKTUÁLNÍM (vpravo) kolem =====
// Body = cíle hlasů (max 3-4). Čára = hráč (koho volil minule → koho volí teď).
// Barva = aktuální blok: na vyřazeného (nejvíc hlasů) = oranžová, jiný blok = jiná barva.
const FLOWPAL = ["#E8623A", "#1F9E92", "#E7AE3A", "#3E6FA3", "#9B5DE5"];
function flowTargetsOrdered(r) { // cíle kola; vyřazený (most_voted) první → dostane hlavní (oranžovou) barvu
  const rk = voteRanking(r), es = elimSet(r);
  const main = r.most_voted || [...es][0] || (rk[0] && rk[0].target);
  return [main, ...rk.map(x => x.target).filter(t => t !== main)].filter(Boolean);
}
function renderFlow(idx) {
  const svg = d3.select("#flowSvg"); svg.selectAll("*").remove();
  const W = svg.node().clientWidth, s = D.series[state.series];
  if (s.rounds.length < 2) { svg.attr("height", 70); svg.append("text").attr("x", 16).attr("y", 40).attr("fill", "#8A8073").attr("font-size", 14).text("Zatím málo kol."); return; }
  if (idx < 1) { svg.attr("height", 80); svg.append("text").attr("x", 16).attr("y", 44).attr("fill", "#8A8073").attr("font-size", 14).text("První kmenová rada po sloučení — přesun se ukáže od 2."); return; }
  const cur = s.rounds[idx], prev = s.rounds[idx - 1], prev2 = idx >= 2 ? s.rounds[idx - 2] : null;
  const Tcur = targetMap(cur), Tprev = targetMap(prev), T2 = prev2 ? targetMap(prev2) : {}, curElim = elimSet(cur);
  const rkCur = voteRanking(cur), rkPrev = voteRanking(prev), rk2 = prev2 ? voteRanking(prev2) : [];
  // LAJNY PODLE POŘADÍ (rank): rank 0 = vyhlasovaný (nahoře), 1 = 2. nejvíce hlasů, …
  // remíza = stejný rank → stejná vodorovná lajna (oba cíle na ní)
  const rankIn = (rk, t) => { const v = rk.find(x => x.target === t); return v ? v.rank : rk.length; };
  const maxRank = rk => rk.reduce((m, v) => Math.max(m, v.rank), 0);
  // FIXNÍ napříč celou sérií → okno neposkakuje při posouvání mezi radami:
  // L = max počet lajn (různých příček) přes všechna kola; maxNames = max hlasujících
  const L = Math.max(1, ...s.rounds.map(r => maxRank(voteRanking(r)) + 1));
  const maxNames = Math.max(...s.rounds.map(r => Object.keys(targetMap(r)).length));
  // barva = IDENTITA cíle (každý cíl vlastní barvu → remízoví na stejné lajně mají odlišné barvy).
  // pořadí v ranku je unikátní: vyhlasovaný = index 0 = oranžová, pak dle počtu hlasů.
  const colorByTarget = (rk, t) => { const i = rk.findIndex(x => x.target === t); return i < 0 || i >= FLOWPAL.length ? "#C2B7A2" : FLOWPAL[i]; };

  const top = 34, nameGap = 23;
  const names = Object.keys(Tcur).sort((a, b) =>
    (rankIn(rkCur, Tcur[a]) - rankIn(rkCur, Tcur[b])) ||
    (rankIn(rkPrev, Tprev[a]) - rankIn(rkPrev, Tprev[b])) || a.localeCompare(b, "cs"));
  const H = Math.max(maxNames * nameGap, (L - 1) * 80, 110);
  const laneY = r => top + (L <= 1 ? H / 2 : r * H / (L - 1));
  // remíza: víc cílů na jedné lajně → rozprostři je kolem lajny (každý vlastní koule)
  const tieOffset = (rk, t) => {
    const v = rk.find(x => x.target === t); if (!v) return 0;
    const peers = rk.filter(x => x.rank === v.rank);
    if (peers.length <= 1) return 0;
    return (peers.findIndex(x => x.target === t) - (peers.length - 1) / 2) * 26;
  };
  const targetY = (rk, t) => laneY(rankIn(rk, t)) + tieOffset(rk, t);
  const x2 = 64, xL = prev2 ? 196 : 150, xR = W - 140, xMid = (xL + xR) / 2;
  // jména: fixní rozestup, vycentrovaná na střed okna (rozestup se nemění s počtem)
  const nameY = {}; const nameBlock = (names.length - 1) * nameGap, nameTop = top + H / 2 - nameBlock / 2;
  names.forEach((p, j) => nameY[p] = nameTop + j * nameGap);
  const baseY = top + H + 16;
  svg.attr("height", baseY + 58);
  const g = svg.append("g");

  // svislé čáry sloupců (kmenových rad)
  [prev2 ? x2 : null, xL, xR].filter(v => v != null).forEach(x =>
    g.append("line").attr("x1", x).attr("x2", x).attr("y1", top - 14).attr("y2", baseY).attr("stroke", "#C2B7A2").attr("stroke-width", 1.5).attr("opacity", x === x2 ? 0.5 : 1));

  // ČERCHOVANÉ VODOROVNÉ lajny: jedna na každé pořadí (vyhlasovaný / 2. / 3. …) napříč radami
  for (let r = 0; r < L; r++)
    g.append("line").attr("x1", prev2 ? x2 : xL).attr("x2", xR).attr("y1", laneY(r)).attr("y2", laneY(r))
      .attr("stroke", "#D8CEBC").attr("stroke-dasharray", "2 5").attr("stroke-width", 1);

  // šedé kontextové čáry z předpředchozí rady (idx-2 → idx-1)
  if (prev2) Object.keys(T2).forEach(p => {
    if (Tprev[p] == null) return;
    const m = (x2 + xL) / 2, ya = targetY(rk2, T2[p]), yb = targetY(rkPrev, Tprev[p]);
    g.append("path").attr("d", `M${x2},${ya} C${m},${ya} ${m},${yb} ${xL},${yb}`)
      .attr("fill", "none").attr("stroke", "#C2B7A2").attr("stroke-width", 1.2).attr("opacity", 0.4);
  });
  // barva hráče = MINULÝ blok (kam hlasoval v předchozí radě) → vidět, jak se starý blok rozpadl
  // kdo minule nehlasoval (nově aktivní) = šedá; vyřazený v aktuální radě = čerchovaná čára
  const playerColor = p => Tprev[p] != null ? colorByTarget(rkPrev, Tprev[p]) : "#C2B7A2";
  names.forEach(p => {
    const col = playerColor(p), yN = nameY[p], hadPrev = Tprev[p] != null, elimNow = curElim.has(p);
    const yPrev = hadPrev ? targetY(rkPrev, Tprev[p]) : yN, yCur = targetY(rkCur, Tcur[p]);
    const m1 = (xL + xMid) / 2, m2 = (xMid + xR) / 2;
    // bez minulého hlasu → čára začíná až uprostřed (od jména), ne od levého uzlu
    const d = hadPrev
      ? `M${xL},${yPrev} C${m1},${yPrev} ${m1},${yN} ${xMid},${yN} S${m2},${yCur} ${xR},${yCur}`
      : `M${xMid},${yN} S${m2},${yCur} ${xR},${yCur}`;
    g.append("path").attr("d", d).attr("fill", "none").attr("stroke", col).attr("stroke-width", 2).attr("opacity", 0.55)
      .attr("stroke-dasharray", elimNow ? "5 4" : null)
      .append("title").text(`${p}: ${prev.n}.→ ${Tprev[p] || "—"}, ${cur.n}.→ ${Tcur[p]}${elimNow ? " (vyřazen)" : ""}`);
  });
  // jména uprostřed (krémové halo; barva = minulý blok, vyřazený červeně)
  names.forEach(p => g.append("text").attr("x", xMid).attr("y", nameY[p] + 3.5).attr("text-anchor", "middle")
    .attr("font-size", 11).attr("font-weight", 700).attr("stroke", "#F3EEE4").attr("stroke-width", 3.5).attr("paint-order", "stroke")
    .attr("fill", curElim.has(p) ? "#C0473E" : playerColor(p)).text(p + (curElim.has(p) ? " ✗" : "")));
  // záhlaví sloupců
  if (prev2) g.append("text").attr("x", x2).attr("y", 15).attr("text-anchor", "start").attr("font-weight", 700).attr("font-size", 10).attr("fill", "#B0A695").text(`${prev2.n}. KR`);
  g.append("text").attr("x", xL).attr("y", 15).attr("text-anchor", "middle").attr("font-weight", 800).attr("font-size", 12).attr("fill", "#8A8073").text(`${prev.n}. kmenová rada`);
  g.append("text").attr("x", xR).attr("y", 15).attr("text-anchor", "middle").attr("font-weight", 800).attr("font-size", 12).attr("fill", "#E8623A").text(`${cur.n}. kmenová rada`);
  // uzly cílů na své lajně (idx-2 šedě, idx-1 a idx barevně dle pořadí), velikost ~ hlasy
  if (prev2) rk2.forEach(v => g.append("circle").attr("cx", x2).attr("cy", targetY(rk2, v.target)).attr("r", 3 + v.votes * 0.7).attr("fill", "#C2B7A2").attr("opacity", 0.55).append("title").text(`${prev2.n}. KR · ${v.target}: ${v.votes}`));
  rkPrev.forEach(v => g.append("circle").attr("cx", xL).attr("cy", targetY(rkPrev, v.target)).attr("r", 4 + v.votes).attr("fill", colorByTarget(rkPrev, v.target)).attr("opacity", 0.72).append("title").text(`${prev.n}. · ${v.target}: ${v.votes}`));
  rkCur.forEach(v => g.append("circle").attr("cx", xR).attr("cy", targetY(rkCur, v.target)).attr("r", 4 + v.votes).attr("fill", colorByTarget(rkCur, v.target)).append("title").text(`${cur.n}. · ${v.target}: ${v.votes}`));
  // popis pod sloupcem: 1./2./3. nejvíc hlasů + (při duelu) zvlášť kdo reálně vypadl
  const labelFor = r => r === 0 ? "Nejvíc hlasů" : `${r + 1}. nejvíce hlasů`;
  [[prev, xL], [cur, xR]].forEach(([rd, x]) => {
    const rk = voteRanking(rd), byRank = {};
    rk.forEach(v => { (byRank[v.rank] = byRank[v.rank] || []).push(v); });
    let li = 0;
    Object.keys(byRank).map(Number).sort((a, b) => a - b).slice(0, 3).forEach(r => {
      const grp = byRank[r];
      g.append("text").attr("x", x).attr("y", baseY + 16 + li * 15).attr("text-anchor", "middle")
        .attr("font-size", 10.5).attr("font-weight", r === 0 ? 800 : 600).attr("fill", "#6B6256")
        .text(`${labelFor(r)}: ${grp.map(v => v.target).join(", ")} (${grp[0].votes})`);
      li++;
    });
    // duel: vypadl někdo jiný než nejvíc-hlasovaný (i ten, na koho se nehlasovalo)
    [...elimSet(rd)].filter(e => rk[0] && e !== rk[0].target).forEach(e => {
      g.append("text").attr("x", x).attr("y", baseY + 16 + li * 15).attr("text-anchor", "middle")
        .attr("font-size", 10.5).attr("font-weight", 800).attr("fill", "#C0473E").text(`✗ Vypadl (duel): ${e}`);
      li++;
    });
  });
}

// ===== Nádoba osudu: krev vs voda (empirie napříč sériemi + kumulativní šance na vodu dopředu) =====
function renderUrns(s) {
  const box = document.getElementById("urnBox");
  // empirie přes VŠECHNY série dohromady (post-merge)
  let krev = 0, voda = 0;
  Object.values(D.series).forEach(se => { if (se.urns) { krev += se.urns.krev; voda += se.urns.voda; } });
  const n = krev + voda, vodaPct = n ? voda / n * 100 : 0;
  const bg = D.urns_global || {};  // bayesovský odhad (Beta-Binomial)
  const u = s.urns || { seq: [], krev: 0, voda: 0, streak_krev: 0 };
  const sk = u.streak_krev;
  // kumulativní: P(aspoň 1 voda za K kol) při nezávislém losu 1/3
  const cum = K => (1 - Math.pow(2 / 3, K)) * 100;
  // tato série: barevná sekvence krev/voda
  const seqDots = u.seq.map(x => `<span style="display:inline-block;width:22px;height:22px;border-radius:5px;margin:2px;background:${x === "voda" ? "#3E6FA3" : "#C0473E"};" title="${x}"></span>`).join("");
  box.innerHTML = `
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:14px">
      <div style="flex:1;min-width:220px;background:#fff;border:1px solid #D8CEBC;border-radius:12px;padding:14px 16px">
        <div style="font-size:12px;font-weight:800;color:#8A8073;margin-bottom:10px">EMPIRIE — všechny série po sloučení</div>
        <div style="display:flex;height:30px;border-radius:7px;overflow:hidden;font-weight:800;font-size:13px;color:#fff">
          <div style="width:${n ? krev / n * 100 : 50}%;background:#C0473E;display:flex;align-items:center;justify-content:center">krev ${krev}</div>
          <div style="width:${n ? voda / n * 100 : 50}%;background:#3E6FA3;display:flex;align-items:center;justify-content:center">voda ${voda}</div>
        </div>
        <div style="margin-top:10px;font-size:13px;color:#2A2A28"><b>Odhad podílu vody: ${(bg.bayes_mean ?? vodaPct).toFixed ? (bg.bayes_mean ?? vodaPct).toFixed(0) : bg.bayes_mean} %</b>${bg.ci_lo != null ? ` <span style="color:#8A8073">(90% interval ${bg.ci_lo.toFixed(0)}–${bg.ci_hi.toFixed(0)} %)</span>` : ""}</div>
        <div style="margin-top:4px;font-size:11.5px;color:#8A8073;line-height:1.5">Bayesovský odhad (Beta-Binomial) z ${voda} vody : ${krev} krev, n=${n}. ${bg.p_gt_third != null ? `Pravděpodobnost, že podíl vody je vyšší než produkcí uváděná 1/3, je <b>${bg.p_gt_third.toFixed(0)} %</b>.` : ""} Vzorek je malý → interval je široký.</div>
      </div>
      <div style="flex:1;min-width:220px;background:#fff;border:1px solid #D8CEBC;border-radius:12px;padding:14px 16px">
        <div style="font-size:12px;font-weight:800;color:#8A8073;margin-bottom:10px">TATO SÉRIE — pořadí nádob</div>
        <div style="line-height:1.2">${seqDots || '<span style="color:#A89E8C;font-size:13px">zatím žádná data</span>'}</div>
        <div style="margin-top:10px;font-size:12px"><span style="display:inline-block;width:11px;height:11px;background:#C0473E;border-radius:3px;vertical-align:middle"></span> krev &nbsp; <span style="display:inline-block;width:11px;height:11px;background:#3E6FA3;border-radius:3px;vertical-align:middle"></span> voda</div>
      </div>
    </div>
    ${s.live ? `<div style="background:#fff;border:1px solid #D8CEBC;border-radius:12px;padding:14px 16px">
      <div style="font-size:12px;font-weight:800;color:#8A8073;margin-bottom:8px">PŘÍŠTÍ KMENOVÁ RADA — ${s.label}</div>
      <div style="display:flex;gap:8px;margin-bottom:7px;font-weight:800;font-size:13px;color:#fff">
        <div style="flex:2;background:#C0473E;border-radius:7px;padding:9px;text-align:center">🩸 krev 67 %</div>
        <div style="flex:1;background:#3E6FA3;border-radius:7px;padding:9px;text-align:center">💧 voda 33 %</div>
      </div>
      <div style="font-size:11.5px;color:#8A8073;line-height:1.5;margin-bottom:12px">Každý díl je <b>samostatný los</b> — produkce uvádí 1/3 na vodu. Že předtím padla krev, příští los <b>nijak nemění</b> (los nemá paměť).</div>

      <div style="border-top:1px dashed #E0D7C6;padding-top:11px">
        <div style="font-size:12px;font-weight:800;color:#8A8073;margin-bottom:4px">CO SE DÁ POČÍTAT: VZÁCNOST SÉRIE KRVE</div>
        <div style="font-size:12.5px;color:#2A2A28;margin-bottom:9px">${sk > 0
          ? `Teď běží série <b>${sk}× krev po sobě</b>. Jak nepravděpodobný je takový běh (počítáno od jeho začátku, los 1/3):`
          : `Naposledy padla voda — série krve zatím neběží. Obecně jak vzácný je běh K× krev po sobě:`}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${[1, 2, 3, 4, 5].map(K => { const on = K === sk, nx = K === sk + 1; return `<div style="flex:1;min-width:62px;text-align:center;background:${on ? "#C0473E" : nx ? "#F0D9D3" : "#F3EEE4"};border:${nx ? "1.5px dashed #C0473E" : "none"};border-radius:8px;padding:7px 4px">
            <div style="font-size:10.5px;font-weight:700;color:${on ? "#fff" : "#8A8073"}">${K}× krev${on ? " (teď)" : nx ? " (kdyby)" : ""}</div>
            <div style="font-size:15px;font-weight:800;color:${on ? "#fff" : "#C0473E"}">${(Math.pow(2 / 3, K) * 100).toFixed(0)} %</div></div>`; }).join("")}
        </div>
        <div style="margin-top:9px;font-size:11px;color:#A89E8C;line-height:1.5;font-style:italic">Čím delší série bez vody, tím vzácnější celý běh. <b>Ale příští díl má pořád 33 % na vodu</b> — „už dlouho nepadla, tak teď musí" je <a href="https://en.wikipedia.org/wiki/Gambler%27s_fallacy" target="_blank" rel="noopener" style="color:#1F9E92">gambler's fallacy</a>.</div>
      </div>
    </div>` : ""}`;
}

// ===== Finále: Pás přesunů — STEJNÝ alluvial jako "Přesuny mezi koly", ale přes CELOU sérii =====
// Sloupce = kmenovky, cíle na lajnách dle pořadí; hráč = souvislá křivka tekoucí mezi svými cíli.
// Rozdíl od renderFlow: barva per HRÁČ (ne per blok) + vypínání hráčů (zešednutí).
let flowHidden = new Set();
function renderFlowFull() {
  const svg = d3.select("#flowFullSvg"); svg.selectAll("*").remove();
  const W = svg.node().clientWidth, s = D.series[state.series];
  if (s.rounds.length < 2) return;
  const cmap = playerColors(s), cols = s.rounds, nC = cols.length;
  const Ts = cols.map(targetMap), rks = cols.map(voteRanking), elims = cols.map(elimSet);
  // lajny dle pořadí (rank) — fixní napříč sérií; remíza = offset kolem lajny
  const L = Math.max(1, ...rks.map(rk => rk.reduce((m, v) => Math.max(m, v.rank), 0) + 1));
  const top = 30, mL = 30, mR = 24, rowH = 78, rankH = 60;
  const H = Math.max((L - 1) * rowH, 90);
  const laneY = r => top + (L <= 1 ? H / 2 : r * H / (L - 1));
  const tie = (rk, t) => { const v = rk.find(x => x.target === t); if (!v) return 0; const ps = rk.filter(x => x.rank === v.rank); return ps.length <= 1 ? 0 : (ps.findIndex(x => x.target === t) - (ps.length - 1) / 2) * 24; };
  const yOf = (i, t) => t == null ? null : laneY(rks[i].find(x => x.target === t) ? rks[i].find(x => x.target === t).rank : L) + tie(rks[i], t);
  const baseY = top + H + 16;
  svg.attr("height", baseY + rankH + 10);
  const xOf = i => mL + (nC <= 1 ? 0 : i * (W - mL - mR) / (nC - 1));
  const g = svg.append("g");
  const colN = n => flowHidden.has(n) ? "#D8CEBC" : cmap[n];

  // čerchované vodorovné lajny (pořadí napříč celou sérií)
  for (let r = 0; r < L; r++) g.append("line").attr("x1", mL).attr("x2", W - mR).attr("y1", laneY(r)).attr("y2", laneY(r))
    .attr("stroke", "#E0D7C6").attr("stroke-dasharray", "2 5").attr("stroke-width", 1);
  // svislé čáry kmenovek + záhlaví + ranking pod sloupcem
  cols.forEach((r, i) => {
    const x = xOf(i);
    g.append("line").attr("x1", x).attr("x2", x).attr("y1", top - 12).attr("y2", baseY).attr("stroke", "#D8CEBC").attr("stroke-width", 1);
    g.append("text").attr("x", x).attr("y", 14).attr("text-anchor", "middle").attr("font-weight", 800).attr("fill", "#8A8073").attr("font-size", 11).text(`${r.n}.`);
    const byRank = {}; rks[i].forEach(v => (byRank[v.rank] = byRank[v.rank] || []).push(v));
    let li = 0;
    Object.keys(byRank).map(Number).sort((a, b) => a - b).slice(0, 3).forEach(rr => {
      const grp = byRank[rr], out = grp.some(v => elims[i].has(v.target));
      g.append("text").attr("x", x).attr("y", baseY + 14 + li * 14).attr("text-anchor", "middle").attr("font-size", 9).attr("font-weight", out ? 800 : 600).attr("fill", out ? "#C0473E" : "#8A8073")
        .text(`${out ? "✗" : (rr + 1) + "."} ${grp.map(v => v.target).join(",")}`);
      li++;
    });
    // duel: vypadl někdo jiný než nejvíc-hlasovaný
    [...elims[i]].filter(e => rks[i][0] && e !== rks[i][0].target).forEach(e => {
      g.append("text").attr("x", x).attr("y", baseY + 14 + li * 14).attr("text-anchor", "middle").attr("font-size", 9).attr("font-weight", 800).attr("fill", "#C0473E").text(`✗ duel: ${e}`);
      li++;
    });
  });
  // hráč = souvislá křivka přes kola, kde hlasoval (cíl→cíl mezi sousedními radami), barva per hráč
  cmap && Object.keys(cmap).forEach(n => {
    const pts = []; cols.forEach((r, i) => { if (Ts[i][n] != null) pts.push([xOf(i), yOf(i, Ts[i][n]), i]); });
    if (pts.length < 1) return;
    const hidden = flowHidden.has(n), col = colN(n);
    for (let k = 0; k < pts.length - 1; k++) {
      const [xa, ya] = pts[k], [xb, yb] = pts[k + 1], mx = (xa + xb) / 2;
      g.append("path").attr("d", `M${xa},${ya} C${mx},${ya} ${mx},${yb} ${xb},${yb}`).attr("fill", "none")
        .attr("stroke", col).attr("stroke-width", hidden ? 1.2 : 2.2).attr("opacity", hidden ? 0.35 : 0.7).append("title").text(n);
    }
    // uzly hráče v každé radě (✗ když v ní vypadl)
    pts.forEach(([x, y, i]) => {
      if (elims[i].has(n)) g.append("text").attr("x", x).attr("y", y + 5).attr("text-anchor", "middle").attr("font-size", 13).attr("font-weight", 800).attr("fill", hidden ? "#C2B7A2" : "#C0473E").text("✗");
      else g.append("circle").attr("cx", x).attr("cy", y).attr("r", 3.2).attr("fill", col).attr("opacity", hidden ? 0.4 : 1).append("title").text(n);
    });
  });
  // legenda s vypínáním hráčů (individuální barvy)
  const leg = d3.select("#flowFullLegend"); leg.html("");
  flowOrder(s).forEach(nm => {
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
  prevFin = isFin;
  document.getElementById("krLabel").textContent = isFin ? "Finále" : `${s.rounds[state.roundIdx].n}. kmenová rada po sloučení`;
  ["rankCard", "tmCard"].forEach(id => document.getElementById(id).style.display = isFin ? "none" : "");
  // Prázdné sekce skryj, dokud nejsou data (objeví se samy po pár kolech).
  const hasPairs = s.pairs && s.pairs.length, hasFlow = nR >= 2;
  document.getElementById("flowCard").style.display = (isFin || !hasFlow) ? "none" : "";
  document.getElementById("pairsCard").style.display = (isFin || !hasPairs) ? "none" : "";
  document.getElementById("finaleCard").style.display = isFin ? "" : "none";
  document.getElementById("flowFullCard").style.display = isFin ? "" : "none";
  // Nádoba osudu: ukázat vždy, když má série data (i živá V), ne jen ve finále
  const hasUrns = s.urns && (s.urns.krev + s.urns.voda) > 0;
  document.getElementById("urnCard").style.display = hasUrns ? "" : "none";
  if (hasUrns) renderUrns(s);
  const treeCard = document.getElementById("treeCard"), tmCard = document.getElementById("tmCard");
  treeCard.style.display = "";
  const wrap = treeCard.parentNode, tlCard = document.getElementById("tlCard");
  renderTimeline(state.series);
  renderPairs(s);
  const ridx = Math.min(state.roundIdx, nR - 1);
  const urnCard = document.getElementById("urnCard");
  if (isFin) {
    renderFinale(s); renderFlowFull();
    treeCard.querySelector("h2").textContent = "Finální strom aliancí";
    if (tlCard.nextSibling !== treeCard) wrap.insertBefore(treeCard, tlCard.nextSibling); // strom až za časovou osu
    // Nádoba osudu jako PŘEDPOSLEDNÍ dlaždice ve finále (těsně před stromem)
    if (hasUrns && treeCard.previousSibling !== urnCard) wrap.insertBefore(urnCard, treeCard);
    renderTree(s.rounds[nR - 1]);
    return;
  }
  // mimo finále: urnCard zpět na své místo (za finaleCard, kde je v HTML)
  if (hasUrns && urnCard.previousSibling !== document.getElementById("finaleCard")) wrap.insertBefore(urnCard, document.getElementById("flowFullCard"));
  if (tmCard.nextSibling !== treeCard) wrap.insertBefore(treeCard, tmCard.nextSibling); // zpět hned za treemapu
  treeCard.querySelector("h2").textContent = "Strom aliancí";
  DYN.forEach(id => renderCard(id, ridx));
}
let rsz; window.addEventListener("resize", () => { clearTimeout(rsz); rsz = setTimeout(() => render(false), 160); });
buildCardSliders();
setSeries(state.series);
