"""Walk-forward validace modelu + živý snapshot.

    python backtest.py

Pro každé post-merge kolo postaví graf z hlasů NASBÍRANÝCH DO TÉ DOBY a spočítá pořadí
aktivních hráčů. Ukáže, v kterém kole se model „zaměřil" na skutečného vítěze.
"""
import networkx as nx
from survivor_data import load_series, get_active, get_post_merge_tcs, POST_MERGE_START
from survivor_model import betweenness_scores, winner_scores, softmax, ranked


def build_graph(data, up_to_tc, start):
    G = nx.DiGraph()
    for tc in range(start, up_to_tc + 1):
        for voter, target in data["votes"].get(tc, []):
            if G.has_edge(voter, target):
                G[voter][target]["weight"] += 1
            else:
                G.add_edge(voter, target, weight=1)
    return G


def winner_id(data):
    # vítěz jako interní ID (graf i ranking pracují s ID)
    return [p["id"] for p in data["players"] if str(p["final_pos"]) == "1"][0]


def walkforward(series, scorer=betweenness_scores):
    data = load_series(series)
    start = POST_MERGE_START[series]
    win = winner_id(data)
    nick = {p["id"]: p["nick"] for p in data["players"]}
    print(f"\n=== Survivor {series} — walk-forward (vítěz: {nick.get(win, win)}) ===")
    first_top = None
    for tc in get_post_merge_tcs(series):
        active = get_active(data, tc + 1, start)
        if len(active) < 2:
            continue
        scores = scorer(build_graph(data, tc, start), active)
        order = [n for n, _ in ranked(scores)]
        wr = order.index(win) + 1 if win in order else 0
        if wr == 1 and first_top is None:
            first_top = tc
        top3 = ", ".join(f"{nick.get(n, n)}#{i+1}" for i, n in enumerate(order[:3]))
        print(f"  kolo {tc:>2}: {top3:<40} vítěz #{wr}")
    print(f"  -> vítěz poprvé #1 v kole {first_top}")


def live_snapshot(series="V", scorer=betweenness_scores):
    data = load_series(series)
    start = POST_MERGE_START[series]
    voted = [tc for tc, v in data["votes"].items() if v]
    if not voted:
        print(f"\n{series}: žádné hlasy — vyplň aspoň 1 kolo."); return
    last = max(voted)
    active = get_active(data, last + 1, start)
    probs = softmax(scorer(build_graph(data, last, start), active))
    nick = {p["id"]: p["nick"] for p in data["players"]}
    print(f"\n=== Survivor {series} — živý snapshot (po kole {last}) ===")
    for i, (n, p) in enumerate(ranked(probs), 1):
        print(f"  {i:>2}. {nick.get(n, n):<14}{p*100:>5.1f}%")


if __name__ == "__main__":
    walkforward("III")
    walkforward("IV")
    # live_snapshot("V")   # odkomentuj, až budeš mít data V
