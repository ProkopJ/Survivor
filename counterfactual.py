"""Kontrafaktuál „bez váz osudu" (no-duel) — kdo by vyhrál v alternativním vesmíru?

V CZ&SK Survivoru jde nejvíc-hlasovaný do duelu (vázy osudu) a může přežít. Tady ptáme:
co kdyby duely neexistovaly a nejvíc-hlasovaný prostě odešel?

ČÁST A — faktická divergence (žádná simulace):
  Porovná most_voted vs eliminated. Najde, kdy duel zachránil eventuálního VÍTĚZE.
  Zjištění (III, IV): v OBOU sériích byl vítěz zachráněn duelem přesně v kole, kdy dostal
  nejvíc hlasů (Mikýř kolo 3, Pavel kolo 17) → bez duelů by ani jeden nevyhrál.

ČÁST B — alternativní vesmír (Monte Carlo):
  Od kola záchrany odebere vítěze a dohraje sérii bez duelů (nejvíc-hlasovaný odchází,
  vzorkováno z hazardu: menšinový blok + terčovost), finále dle centrality.
  Zjištění: alternativní vítěz je vysoce NEJISTÝ — rozdělení je ~uniform (žádný jasný
  nástupce). Odebrání vítěze otevře závod; nepredikovatelnost vyřazení to dorovná.
  Nejobhajitelnější jediný tip = runner-up, kterého vítěz porazil (Nikola III / Michael IV),
  ale je to slabá sázka, ne predikce.

Vyžaduje: numpy, networkx. Spuštění: python counterfactual.py
"""
import itertools, numpy as np, networkx as nx
import networkx.algorithms.community as nxcom
from survivor_data import load_series, get_active, get_post_merge_tcs, POST_MERGE_START


def factual_divergence(series):
    """Vrátí seznam (kolo, most_voted, eliminated) kde se liší + zda šlo o vítěze."""
    d = load_series(series)
    win = [p["name"] for p in d["players"] if str(p["final_pos"]) == "1"][0]
    out = []
    for tc in get_post_merge_tcs(series):
        nd = d["nadoby"].get(tc, {})
        mv, el = nd.get("most_voted"), (nd.get("eliminated") or [])
        if mv and el and mv not in el:
            out.append((tc, mv, ", ".join(el), mv == win))
    return win, out


def _dir(d, up, st):
    G = nx.DiGraph()
    for tc in range(st, up + 1):
        for v, t in d["votes"].get(tc, []):
            if G.has_edge(v, t): G[v][t]["weight"] += 1
            else: G.add_edge(v, t, weight=1)
    return G


def _covote(d, up, st):
    G = nx.Graph()
    for tc in range(st, up + 1):
        bt = {}
        for v, t in d["votes"].get(tc, []):
            bt.setdefault(t, []).append(v)
        for t, vs in bt.items():
            for a, b in itertools.combinations(vs, 2):
                if G.has_edge(a, b): G[a][b]["weight"] += 1
                else: G.add_edge(a, b, weight=1)
    return G


def alternate_universe(series, n_sims=2000, seed=0):
    """MC: odeber vítěze v kole jeho záchrany, dohraj bez duelů → rozdělení alt. vítěze."""
    d = load_series(series); st = POST_MERGE_START[series]
    win = [p["name"] for p in d["players"] if str(p["final_pos"]) == "1"][0]
    saves = [tc for tc in get_post_merge_tcs(series)
             if d["nadoby"].get(tc, {}).get("most_voted") == win
             and win not in (d["nadoby"][tc].get("eliminated") or [])]
    if not saves:
        return win, None, {}
    R = saves[0]
    DG = _dir(d, R, st); CO = _covote(d, R, st)
    indeg = {p: sum(DG[u][p]["weight"] for u in DG.predecessors(p)) for p in DG.nodes}
    btw = nx.betweenness_centrality(DG.to_undirected()) if DG.number_of_edges() else {}
    init = [p for p in get_active(d, R, st) if p != win]
    rng = np.random.default_rng(seed); cache = {}

    def minority(a):
        k = frozenset(a)
        if k in cache: return cache[k]
        H = CO.subgraph(a)
        if H.number_of_edges() == 0:
            r = {x: 0 for x in a}
        else:
            cs = sorted(nxcom.louvain_communities(H, weight="weight", seed=1), key=lambda z: -len(z))
            mx = len(cs[0]); m = {}
            for c in cs:
                for x in c: m[x] = 0 if len(c) == mx else 1
            r = {x: m.get(x, 1) for x in a}
        cache[k] = r; return r

    wins = {}
    for _ in range(n_sims):
        act = list(init)
        while len(act) > 2:
            im = act[rng.integers(len(act))]; cd = [p for p in act if p != im]
            mm = minority(tuple(act))
            iv = np.array([indeg.get(p, 0) for p in cd], float); iz = (iv - iv.mean()) / (iv.std() or 1)
            w = np.exp(0.43 * np.array([mm[p] for p in cd]) + 0.15 * iz)
            el = cd[rng.choice(len(cd), p=w / w.sum())]; act.remove(el)
        sc = np.array([btw.get(p, 0) for p in act]); e = np.exp(4 * (sc - sc.max())); pr = e / e.sum()
        wn = act[rng.choice(len(act), p=pr)]; wins[wn] = wins.get(wn, 0) + 1
    return win, R, dict(sorted(((k, v / n_sims) for k, v in wins.items()), key=lambda x: -x[1]))


if __name__ == "__main__":
    for s in ["III", "IV"]:
        win, divs = factual_divergence(s)
        print(f"\n=== {s} — faktická divergence (vítěz {win.split()[0]}) ===")
        for tc, mv, el, isw in divs:
            tag = "  <-- VÍTĚZ zachráněn duelem" if isw else ""
            print(f"  kolo {tc}: nejvíc hlasů {mv.split()[0]}, ale vypadl {el.split()[0]}{tag}")
        w, R, dist = alternate_universe(s)
        if R:
            print(f"  Alternativní vesmír (bez {w.split()[0]} od kola {R}) — nejistý, top:")
            for k, p in list(dist.items())[:5]:
                print(f"    {k.split()[0]:<12}{p*100:4.1f}%")
