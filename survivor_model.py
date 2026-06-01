"""Survivor model — finální verze.

ROZHODNUTÍ (po robustní kontrole na sériích III+IV, leave-one-season-out):
  • PRIMÁRNÍ model  = betweenness centralita  (jednodušší, lépe kalibrovaný, generalizuje OOS).
  • SEKUNDÁRNÍ model = eigenvector + betweenness (bohatší rozlišení; přesnost zatím nepotvrzena).
  Rozhoduje se s víc sezónami.

Opravy: robustní eigenvector (scipy → fallback iterativní → varování; jinak tichá degradace na nuly),
        neutrální tie-break (řazení podle jména, ne podle pořadí řádků v datech).
"""
import math, warnings, networkx as nx
import networkx.algorithms.community as nxcom

def _undirected_active(G, active):
    return G.to_undirected().subgraph(active)

def centralities(G, active):
    """Syrové koeficienty (eigenvector, betweenness) na podgrafu aktivních."""
    UG = _undirected_active(G, active)
    if len(UG.nodes) < 2 or UG.number_of_edges() == 0:
        return {n: 0.0 for n in active}, {n: 0.0 for n in active}
    eig = _eigenvector(UG); btw = nx.betweenness_centrality(UG)
    return {n: eig.get(n, 0.0) for n in active}, {n: btw.get(n, 0.0) for n in active}

def alliances(G, active):
    """Detekce aliancí (bloků) z hlasovací sítě — community detection (greedy modularity).
    Vrací {hráč: 'Blok A'|'Blok B'|...}. Po málo kolech je dělení hrubé."""
    UG = _undirected_active(G, active)
    if UG.number_of_edges() == 0:
        return {n: "—" for n in active}
    comms = sorted(nxcom.greedy_modularity_communities(UG), key=lambda s: -len(s))
    label = {}
    for i, c in enumerate(comms):
        for n in c:
            label[n] = f"Blok {chr(65 + i)}"
    for n in active:
        label.setdefault(n, "—")
    return label

def _eigenvector(UG):
    try:
        return nx.eigenvector_centrality_numpy(UG)
    except Exception:
        try:
            return nx.eigenvector_centrality(nx.Graph(UG), max_iter=2000)
        except Exception:
            warnings.warn("Eigenvector selhal — jen betweenness.")
            return {n: 0.0 for n in UG.nodes}

def betweenness_scores(G, active):
    """PRIMÁRNÍ model."""
    UG = _undirected_active(G, active)
    if len(UG.nodes) < 2 or UG.number_of_edges() == 0:
        return {n: 0.0 for n in active}
    btw = nx.betweenness_centrality(UG)
    return {n: btw.get(n, 0.0) for n in active}

def winner_scores(G, active):
    """SEKUNDÁRNÍ model = eigenvector + betweenness (kompatibilní s originálem)."""
    UG = _undirected_active(G, active)
    if len(UG.nodes) < 2 or UG.number_of_edges() == 0:
        return {n: 0.0 for n in active}
    eig = _eigenvector(UG); btw = nx.betweenness_centrality(UG)
    return {n: eig.get(n, 0.0) + btw.get(n, 0.0) for n in active}

def ranked(scores):
    return sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))

def softmax(scores, T=2.0):
    # T = teplota (ostrost). T=2 = konzervativní odhady — záměrně pokorné, ne "věštba".
    # Kalibrace na III+IV ukázala, že vyšší/rostoucí T má nižší log-loss, ale 50-100 %
    # na favorita po pár kolech je u live show přehnané → držíme konzervativní T=2.
    if not scores or max(scores.values()) == 0:
        n = len(scores) or 1
        return {k: 1.0 / n for k in scores}
    vmax = max(scores.values())
    e = {k: math.exp(T * (v - vmax)) for k, v in scores.items()}
    Z = sum(e.values())
    return {k: v / Z for k, v in e.items()}
