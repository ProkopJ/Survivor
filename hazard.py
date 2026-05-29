"""Diskrétní časový hazard model vyřazení (Bayesovská logistická regrese).

PROČ: hráči postupně vypadávají → totály (např. „kolik hlasů dostal") jsou zkreslené
expozicí (délkou hry). Survival/hazard rámec to řeší: panel „hráč × kolo dokud je ve hře",
cíl = vypadl v tomto kole (0/1), vítěz/finalisté přirozeně cenzorovaní (samé 0).
Imunní hráč je v daném kole mimo riziko (vynechán). Kovariáty se měří z dat PŘED kolem
(žádný leak z výsledku kola). Odhad: MAP se slabými priory N(0,2) + Laplaceova aproximace
(Hessian) → kredibilní intervaly. To je „bayesovský panel" vhodný pro málo dat — NE ARMA.

ZJIŠTĚNÍ (III+IV, 112 hráč-kol, 16 vyřazení) — exploračně, n je malé:
  • Per-kolo vyřazení je z předkolových rysů celkově ~nepredikovatelné
    (LOSO hit@1 ≈ náhoda; centralita i recv-rate mají CI přes nulu).
  • NEJSILNĚJŠÍ rys = „byl v menšinovém co-voting bloku" (minority_blok_prev):
    koef ~ +0.43 (hraničně signifikantní), menšina ~27 % vs většina ~11 % riziko vyřazení.
  • Pozor: detekce bloků je v raných kolech nestabilní → rys je tam zašuměný.
Hlavní prediktivní síla projektu zůstává u VÍTĚZE (kumulativní centralita), ne u per-kolo hazardu.

Vyžaduje: numpy, scipy, networkx. Spuštění:  python hazard.py
"""
import itertools, numpy as np, networkx as nx
import networkx.algorithms.community as nxcom
from collections import Counter
from scipy.optimize import minimize
from survivor_data import load_series, get_active, get_post_merge_tcs, POST_MERGE_START

COVARIATES = ["btw_prev", "recvrate_prev", "loyalty_prev", "minority_blok_prev"]


def _covote_graph(data, up_to, start, active):
    G = nx.Graph(); G.add_nodes_from(active)
    for tc in range(start, up_to + 1):
        by_target = {}
        for v, t in data["votes"].get(tc, []):
            if v in active:
                by_target.setdefault(t, []).append(v)
        for t, voters in by_target.items():
            for a, b in itertools.combinations(voters, 2):
                if G.has_edge(a, b): G[a][b]["weight"] += 1
                else: G.add_edge(a, b, weight=1)
    return G


def _minority(data, up_to, start, active):
    """1 = hráč je v menšinovém co-voting bloku (Louvain), 0 = ve většinovém."""
    G = _covote_graph(data, up_to, start, active)
    if G.number_of_edges() == 0:
        return {n: 0 for n in active}
    comms = sorted(nxcom.louvain_communities(G, weight="weight", seed=1), key=lambda s: -len(s))
    biggest = len(comms[0]); m = {}
    for c in comms:
        for n in c:
            m[n] = 0 if len(c) == biggest else 1
    return {n: m.get(n, 1) for n in active}


def build_panel(series):
    data = load_series(series); start = POST_MERGE_START[series]
    rows = []; recv = Counter(); cast = Counter(); with_maj = Counter()
    for tc in get_post_merge_tcs(series):
        at_risk = set(get_active(data, tc, start))
        immune = data["episodes"].get(tc, {}).get("immunity")
        Gd = nx.DiGraph()
        for t in range(start, tc):
            for v, tg in data["votes"].get(t, []):
                if Gd.has_edge(v, tg): Gd[v][tg]["weight"] += 1
                else: Gd.add_edge(v, tg, weight=1)
        btw = nx.betweenness_centrality(Gd.to_undirected().subgraph(at_risk)) if Gd.number_of_nodes() else {}
        mino = _minority(data, tc - 1, start, at_risk)
        elim = data["nadoby"].get(tc, {}).get("eliminated")
        for n in at_risk:
            if n == immune:
                continue
            ra = sum(1 for t in range(start, tc) if n in set(get_active(data, t, start)))
            rr = recv[n] / ra if ra > 0 else 0.0
            loy = (with_maj[n] + 1) / (cast[n] + 2)
            rows.append({"series": series, "tc": tc, "name": n, "y": 1 if n == elim else 0,
                         "btw_prev": btw.get(n, 0.0), "recvrate_prev": rr,
                         "loyalty_prev": loy, "minority_blok_prev": mino[n]})
        maj = data["nadoby"].get(tc, {}).get("most_voted")
        for v, t in data["votes"].get(tc, []):
            recv[t] += 1; cast[v] += 1
            if t == maj: with_maj[v] += 1
    return rows


def fit_bayes_logistic(rows, prior_sd=2.0):
    X = np.array([[r[c] for c in COVARIATES] for r in rows], float)
    y = np.array([r["y"] for r in rows], float)
    mu, sd = X.mean(0), X.std(0); sd[sd == 0] = 1
    Xd = np.hstack([np.ones((len(X), 1)), (X - mu) / sd])
    prec = np.diag([1 / 25.0] + [1 / prior_sd**2] * len(COVARIATES))

    def neg_logpost(b):
        z = Xd @ b; p = 1 / (1 + np.exp(-z))
        ll = np.sum(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12))
        return -ll + 0.5 * b @ prec @ b

    b = minimize(neg_logpost, np.zeros(Xd.shape[1]), method="BFGS").x
    p = 1 / (1 + np.exp(-(Xd @ b))); W = p * (1 - p)
    cov = np.linalg.inv(Xd.T @ (Xd * W[:, None]) + prec); se = np.sqrt(np.diag(cov))
    return ["intercept"] + COVARIATES, b, se


if __name__ == "__main__":
    rows = build_panel("III") + build_panel("IV")
    names, b, se = fit_bayes_logistic(rows)
    print(f"Panel: {len(rows)} hráč-kol, {sum(r['y'] for r in rows)} vyřazení\n")
    print(f"{'kovariáta':<20}{'odhad':>8}{'90% CI':>18}")
    for i, nm in enumerate(names):
        lo, hi = b[i] - 1.645 * se[i], b[i] + 1.645 * se[i]
        star = "  *" if not (lo < 0 < hi) else ""
        print(f"{nm:<20}{b[i]:>8.2f}  [{lo:>6.2f},{hi:>6.2f}]{star}")
    mino = [r for r in rows if r["minority_blok_prev"] == 1]
    majo = [r for r in rows if r["minority_blok_prev"] == 0]
    print(f"\nMenšinový blok: {sum(r['y'] for r in mino)}/{len(mino)} vyřazeno "
          f"| Většinový: {sum(r['y'] for r in majo)}/{len(majo)} vyřazeno")
