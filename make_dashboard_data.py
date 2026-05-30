"""Generuje docs/data.js pro Survivor Dashboard — snapshoty VŠECH odehraných kol.
Spuštění po každém díle:  python make_dashboard_data.py
(IV se načte z xlsx; pokud chybí, z data/survivor_4_data.json.)
"""
import itertools, json, math, os, numpy as np, networkx as nx
from scipy.cluster.hierarchy import linkage, dendrogram, set_link_color_palette, fcluster
from scipy.spatial.distance import squareform
from survivor_data import load_series, get_active, get_post_merge_tcs, POST_MERGE_START
from collections import Counter

OUT = os.environ.get("DASH_OUT", os.path.join(os.path.dirname(__file__), "docs", "data.js"))
PAL = ["#1F9E92", "#E8623A", "#E7AE3A", "#3E6FA3"]; MUTED = "#C2B7A2"; REN = {"Johana N.": "Johy"}
WINNERS = {"IV": "Pavel Tóth", "III": 'Martin "Mikyř" Mikyska', "V": None}

def load_any(series):
    try:
        return load_series(series)
    except Exception:
        jp = os.path.join(os.path.dirname(__file__), "data", f"survivor_{ {'III':3,'IV':4,'V':5}[series] }_data.json")
        j = json.load(open(jp, encoding="utf-8"))
        names = [p[0] for p in j["players"]]; fn = [n.split()[0] for n in names]; cnt = Counter(fn)
        nk = {n: (n.split()[0] if cnt[n.split()[0]] == 1 else n.split()[0] + " " + n.split()[-1][0] + ".") for n in names}
        return {"players": [{"name": n, "nick": nk[n], "final_pos": p[1], "kmen": None} for n, p in zip(names, j["players"])],
                "votes": {int(k): [(a, b) for a, b in v] for k, v in j["votes"].items()},
                "nadoby": {int(k): {"eliminated": ([nd.get("vyrazeny")] if nd.get("vyrazeny") else []), "most_voted": nd.get("nejvic")} for k, nd in j["nadoby"].items()},
                "porota": [(a, b) for a, b in j.get("porota", [])]}

def softmax(s, T=2.0):
    if not s or max(s.values()) == 0:
        n = len(s) or 1; return {k: 1 / n for k in s}
    vm = max(s.values()); e = {k: math.exp(T * (v - vm)) for k, v in s.items()}; Z = sum(e.values())
    return {k: v / Z for k, v in e.items()}

def build_dir(d, start, up):
    G = nx.DiGraph()
    for tc in range(start, up + 1):
        for v, t in d["votes"].get(tc, []):
            G.add_edge(v, t, weight=G[v][t]["weight"] + 1 if G.has_edge(v, t) else 1)
    return G

def cent(G, active):
    UG = G.to_undirected().subgraph(active)
    if len(UG.nodes) < 2 or UG.number_of_edges() == 0:
        return {n: 0 for n in active}, {n: 0 for n in active}
    try: eig = nx.eigenvector_centrality_numpy(UG)
    except Exception:
        try: eig = nx.eigenvector_centrality(nx.Graph(UG), max_iter=2000)
        except Exception: eig = {n: 0 for n in active}
    btw = nx.betweenness_centrality(UG)
    return {n: eig.get(n, 0) for n in active}, {n: btw.get(n, 0) for n in active}

def tree(d, start, upto, disp, elim):
    voters = sorted({v for tc in range(start, upto + 1) for v, _ in d["votes"].get(tc, [])})
    N = len(voters)
    if N < 2: return None
    idx = {n: i for i, n in enumerate(voters)}; same = np.zeros((N, N)); both = np.zeros((N, N))
    for tc in range(start, upto + 1):
        vt = {v: t for v, t in d["votes"].get(tc, [])}
        for a, b in itertools.combinations(list(vt), 2):
            i, j = idx[a], idx[b]; both[i, j] += 1; both[j, i] += 1
            if vt[a] == vt[b]: same[i, j] += 1; same[j, i] += 1
    Dm = np.zeros((N, N))
    for i in range(N):
        for j in range(i + 1, N): Dm[i, j] = Dm[j, i] = 1 - (same[i, j] + 1) / (both[i, j] + 2)
    Z = linkage(squareform(Dm, checks=False), method="average")
    dn = dendrogram(Z, no_plot=True, labels=voters)
    order = dn["leaves"]; slot = {orig: i for i, orig in enumerate(order)}
    dmax = max(Z[:, 2]) or 1.0; ymax = 10 * N
    xd = lambda dd: round(1 - dd / dmax, 4); yl = lambda ic: round(ic / ymax, 4)
    nx_ = {}; nd_ = {}; lc_ = {}
    for i in range(N):
        nx_[i] = 5 + 10 * slot[i]; nd_[i] = 0.0; lc_[i] = 0 if voters[i] in elim else 1
    for k in range(len(Z)):
        c1 = int(Z[k][0]); c2 = int(Z[k][1]); nid = N + k
        nx_[nid] = (nx_[c1] + nx_[c2]) / 2.0; nd_[nid] = Z[k][2]; lc_[nid] = lc_[c1] + lc_[c2]
    total_live = sum(1 for i in range(N) if voters[i] not in elim)
    # hlasovací skupiny tohoto kola → pokrytí větví stromu (vrstva na černé)
    groups_raw = {}
    for v, t in d["votes"].get(upto, []):
        groups_raw.setdefault(t, []).append(v)
    glist = sorted(groups_raw.items(), key=lambda x: -len(x[1]))
    gmem = [set(m) for _, m in glist]
    nnode = N + len(Z)
    mc = [[0] * nnode for _ in gmem]
    for gi, ms in enumerate(gmem):
        for i in range(N):
            if voters[i] in ms: mc[gi][i] = 1
    for k in range(len(Z)):
        nid = N + k; c1 = int(Z[k][0]); c2 = int(Z[k][1])
        for gi in range(len(gmem)): mc[gi][nid] = mc[gi][c1] + mc[gi][c2]
    gtot = [sum(mc[gi][i] for i in range(N)) for gi in range(len(gmem))]
    cov = lambda c: [gi for gi in range(len(gmem)) if mc[gi][c] > 0 and gtot[gi] - mc[gi][c] > 0]
    links = []
    for k in range(len(Z)):
        c1 = int(Z[k][0]); c2 = int(Z[k][1]); nid = N + k; hp = nd_[nid]
        xm = nx_[nid]
        for c in (c1, c2):
            arm = 1 if (lc_[c] > 0 and total_live - lc_[c] > 0) else 0
            bl = cov(c)
            links.append({"k": arm, "bl": bl, "p": [[xd(nd_[c]), yl(nx_[c])], [xd(hp), yl(nx_[c])]]})
            links.append({"k": arm, "bl": bl, "p": [[xd(hp), yl(nx_[c])], [xd(hp), yl(xm)]]})
    leaves = [{"l": disp(nm), "e": nm in elim, "y": yl(5 + 10 * i)} for i, nm in enumerate(dn["ivl"])]
    return {"leaves": leaves, "links": links}

def build_series(series):
    d = load_any(series); start = POST_MERGE_START[series]
    nickmap = {p["name"]: p["nick"] for p in d["players"]}
    disp = lambda nm: REN.get(nickmap.get(nm, nm), nickmap.get(nm, nm))
    kmen = {p["name"]: (p.get("kmen") or "?") for p in d["players"]}
    played = sorted(tc for tc in d["votes"] if tc >= start and d["votes"][tc])
    rounds = []; prev = {}
    timeline_players = {}
    for ridx, tc in enumerate(played):
        nidx = ridx + 1
        active = get_active(d, tc + 1, start)
        G = build_dir(d, start, tc)
        eig, btw = cent(G, active)
        prim = softmax(btw); sec = softmax({n: eig[n] + btw[n] for n in active})
        voted = {v: t for v, t in d["votes"].get(tc, [])}
        order = sorted(active, key=lambda n: -prim[n])
        ranking = []
        for n in order:
            dn_ = disp(n); pct = round(prim[n] * 100, 1)
            ranking.append({"nick": dn_, "voted": disp(voted[n]) if voted.get(n) else None,
                            "kmen": kmen[n], "btw": pct, "eigbtw": round(sec[n] * 100, 1),
                            "delta": round(pct - prev.get(dn_, pct), 1)})
            prev[dn_] = pct
            timeline_players.setdefault(dn_, {})[nidx] = pct
        blocs = {}
        for v, t in d["votes"].get(tc, []):
            blocs.setdefault(disp(t), []).append(disp(v))
        elim = {e for t in range(start, tc + 1) for e in (d["nadoby"].get(t, {}).get("eliminated") or [])}
        _el = d["nadoby"].get(tc, {}).get("eliminated") or []
        rounds.append({"kr": tc, "n": nidx, "eliminated": (", ".join(disp(e) for e in _el) if _el else None),
                       "most_voted": disp(d["nadoby"].get(tc, {}).get("most_voted")) if d["nadoby"].get(tc, {}).get("most_voted") else None,
                       "ranking": ranking,
                       "blocs": [{"target": k, "members": v} for k, v in sorted(blocs.items(), key=lambda x: -len(x[1]))],
                       "tree": tree(d, start, tc, disp, elim)})
    sm = {}; bo = {}
    for tc in played:
        vt = {v: t for v, t in d["votes"].get(tc, [])}
        for a, b in itertools.combinations(sorted(vt), 2):
            bo[(a, b)] = bo.get((a, b), 0) + 1
            if vt[a] == vt[b]: sm[(a, b)] = sm.get((a, b), 0) + 1
    pairs = [{"a": disp(a), "b": disp(b), "ag": round(sm.get((a, b), 0) / bo[(a, b)] * 100), "n": bo[(a, b)]} for (a, b) in bo if bo[(a, b)] >= 3]
    pairs = sorted(pairs, key=lambda x: (-x["ag"], -x["n"]))[:9]
    ns = [r["n"] for r in rounds]
    timeline = {"rounds": ns, "players": {nm: [series_pct.get(k) for k in ns] for nm, series_pct in timeline_players.items()}}
    fin = None
    if series != "V" and played:
        from collections import Counter
        finalists = get_active(d, played[-1] + 1, start)
        jc = Counter(t for _, t in d.get("porota", []))
        def fpos(n):
            fp = [p["final_pos"] for p in d["players"] if p["name"] == n]
            return int(fp[0]) if fp and str(fp[0]).isdigit() else 99
        order = sorted(finalists, key=lambda n: (-jc.get(n, 0), fpos(n)))
        fin = {"finalists": [{"nick": disp(n), "pos": i + 1, "jury": jc.get(n, 0)} for i, n in enumerate(order)],
               "winner": disp(order[0]) if order else disp_win(WINNERS[series], nickmap)}
    # Nádoba osudu (krev/voda): sekvence post-merge kol + počty + běžící série bez vody
    urn_seq = [d["nadoby"].get(tc, {}).get("nadoba") for tc in played]
    urn_seq = [u for u in urn_seq if u in ("krev", "voda")]
    krev = urn_seq.count("krev"); voda = urn_seq.count("voda")
    streak_krev = 0  # kolik kol po sobě od konce padla krev (bez vody)
    for u in reversed(urn_seq):
        if u == "krev": streak_krev += 1
        else: break
    urns = {"seq": urn_seq, "krev": krev, "voda": voda, "streak_krev": streak_krev}
    return {"label": {"III": "Survivor III (2024)", "IV": "Survivor IV (2025)", "V": "Survivor V (2026)"}[series],
            "live": series == "V", "winner": (disp_win(WINNERS[series], nickmap)),
            "rounds": rounds, "timeline": timeline, "finale": fin, "pairs": pairs, "urns": urns}

def disp_win(w, nickmap):
    if not w: return None
    n = nickmap.get(w, w); return REN.get(n, n)

DATA = {"series_order": ["V", "IV", "III"], "series": {s: build_series(s) for s in ["V", "IV", "III"]}}
open(OUT, "w", encoding="utf-8").write("window.SURVIVOR = " + json.dumps(DATA, ensure_ascii=False) + ";")
print("OK ->", OUT)
for s in ["V", "IV", "III"]:
    ss = DATA["series"][s]; print(f"  {s}: {len(ss['rounds'])} kol; favorit KR1: {ss['rounds'][0]['ranking'][0]['nick']} {ss['rounds'][0]['ranking'][0]['btw']}%")
