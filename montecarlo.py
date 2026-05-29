"""Monte Carlo dopředná simulace série → rozdělení vítěze.

CO dělá: od daného stavu opakovaně dohraje sérii. Každé kolo: náhodná individuální imunita,
vyřazení navzorkováno z hazardu (menšinový co-voting blok + terčovost), přepočet sítě mezi
zbylými; finále (poslední 2) rozhodne softmax betweenness centrality. Sečte se, jak často kdo
vyhraje → P(výhra) s nejistotou.

ZJIŠTĚNÍ (validace na III+IV): dopředná simulace dává skutečnému vítězi ~úroveň náhody
  (III ~11–20 %, IV ~10–15 %, srovnatelné s uniform) a NEPŘEKONÁVÁ statický centralitní model.
  Důvod: nepredikovatelná je *cesta* (pořadí vyřazení); její simulace naředí signál, který
  statická centralita „kdo hru ovládá teď" už nese (ta dává vítěze na #1 od půlky hry).
  → MC NEpoužívat jako bodový prediktor. Je užitečné jen k vyjádření NEJISTOTY (pásma),
    a jako poctivý důkaz, že forward dynamika je šum. Hlavní predikce zůstává statický betweenness.

Vyžaduje: numpy, networkx. Spuštění: python montecarlo.py
"""
import itertools, numpy as np, networkx as nx
import networkx.algorithms.community as nxcom
from survivor_data import load_series, get_active, get_post_merge_tcs, POST_MERGE_START

ALPHA_MINORITY = 0.43   # z hazard modelu: menšinový blok → vyšší riziko
BETA_TARGET = 0.15      # mírný vliv terčovosti (in-degree)


def _dir_graph(d, up_to, start):
    G = nx.DiGraph()
    for tc in range(start, up_to + 1):
        for v, t in d["votes"].get(tc, []):
            if G.has_edge(v, t): G[v][t]["weight"] += 1
            else: G.add_edge(v, t, weight=1)
    return G


def _covote_graph(d, up_to, start):
    G = nx.Graph()
    for tc in range(start, up_to + 1):
        bt = {}
        for v, t in d["votes"].get(tc, []):
            bt.setdefault(t, []).append(v)
        for t, vs in bt.items():
            for a, b in itertools.combinations(vs, 2):
                if G.has_edge(a, b): G[a][b]["weight"] += 1
                else: G.add_edge(a, b, weight=1)
    return G


def win_distribution(series, start_tc, n_sims=2000, seed=0):
    """P(výhra) pro každého hráče aktivního po kole start_tc, simulací do finále."""
    d = load_series(series); start = POST_MERGE_START[series]
    DG = _dir_graph(d, start_tc, start); CO = _covote_graph(d, start_tc, start)
    indeg = {p: sum(DG[u][p]["weight"] for u in DG.predecessors(p)) for p in DG.nodes}
    btw_full = nx.betweenness_centrality(DG.to_undirected()) if DG.number_of_edges() else {}
    init = tuple(get_active(d, start_tc + 1, start))
    if len(init) < 2:
        return {}
    rng = np.random.default_rng(seed); mcache = {}

    def minority(active):
        key = frozenset(active)
        if key in mcache:
            return mcache[key]
        H = CO.subgraph(active)
        if H.number_of_edges() == 0:
            r = {x: 0 for x in active}
        else:
            cs = sorted(nxcom.louvain_communities(H, weight="weight", seed=1), key=lambda s: -len(s))
            mx = len(cs[0]); m = {}
            for c in cs:
                for x in c:
                    m[x] = 0 if len(c) == mx else 1
            r = {x: m.get(x, 1) for x in active}
        mcache[key] = r; return r

    wins = {}
    for _ in range(n_sims):
        act = list(init)
        while len(act) > 2:
            immune = act[rng.integers(len(act))]
            cands = [p for p in act if p != immune]
            mm = minority(tuple(act))
            iv = np.array([indeg.get(p, 0) for p in cands], float)
            iz = (iv - iv.mean()) / (iv.std() or 1)
            w = np.exp(ALPHA_MINORITY * np.array([mm[p] for p in cands]) + BETA_TARGET * iz)
            elim = cands[rng.choice(len(cands), p=w / w.sum())]
            act.remove(elim)
        sc = np.array([btw_full.get(p, 0) for p in act])
        e = np.exp(4 * (sc - sc.max())); pr = e / e.sum()
        win = act[rng.choice(len(act), p=pr)]
        wins[win] = wins.get(win, 0) + 1
    return {k: v / n_sims for k, v in sorted(wins.items(), key=lambda x: -x[1])}


if __name__ == "__main__":
    for s in ["III", "IV"]:
        tcs = get_post_merge_tcs(s)
        wp = win_distribution(s, tcs[len(tcs) // 2])
        print(f"\n{s} — MC P(výhra) od půlky hry:")
        for name, p in list(wp.items())[:5]:
            print(f"  {name:<24}{p*100:5.1f}%")
