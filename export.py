"""Per-díl export — spustíš po každé kmenové radě, vyplivne DATA pro Canvu (žádné obrázky).

    python export.py            # série V, poslední vyplněné kolo
    python export.py III        # jiná série

Výstup (do out/):
  • {S}_KR{n}_ranking.csv/.json/.xlsx — pořadí, hráč, koho hlasoval, kmen, aliance,
      šance na výhru (betweenness i eig+btw), syrové btw a eig koeficienty
  • {S}_KR{n}_treemap_betweenness.csv/.xlsx — Aliance | Kmen | Hráč | Šance(btw %)
  • {S}_KR{n}_treemap_eigbtw.csv/.xlsx       — Aliance | Kmen | Hráč | Šance(eig+btw %)
    (v Canvě graf stromové mapy: Skupina = Aliance NEBO Kmen, Velikost = Šance)
"""
import sys, os, csv, json
import networkx as nx
import openpyxl
from survivor_data import load_series, get_active, POST_MERGE_START
from survivor_model import betweenness_scores, winner_scores, centralities, alliances, softmax, ranked

OUT_DIR = os.path.join(os.path.dirname(__file__), "out")


def build_graph(data, up_to_tc, start):
    G = nx.DiGraph()
    for tc in range(start, up_to_tc + 1):
        for voter, target in data["votes"].get(tc, []):
            if G.has_edge(voter, target):
                G[voter][target]["weight"] += 1
            else:
                G.add_edge(voter, target, weight=1)
    return G


def _save_xlsx(path, header, rows, widths):
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(header)
    for r in rows:
        ws.append(list(r))
    for col, w in zip("ABCDEFGHIJ", widths):
        ws.column_dimensions[col].width = w
    wb.save(path)


def _save_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)


def export(series="V"):
    data = load_series(series)
    start = POST_MERGE_START[series]
    voted = [tc for tc, v in data["votes"].items() if v]
    if not voted:
        print(f"{series}: žádné hlasy — vyplň aspoň 1 kolo."); return
    last = max(voted)
    active = get_active(data, last + 1, start)
    G = build_graph(data, last, start)

    nick = {p["name"]: p["nick"] for p in data["players"]}
    kmen = {p["name"]: (p.get("kmen") or "?") for p in data["players"]}
    vote_target = {v: t for v, t in data["votes"].get(last, [])}     # koho hlasoval v posledním kole

    eig, btw = centralities(G, active)
    block = alliances(G, active)
    prim = softmax(betweenness_scores(G, active))   # PRIMÁRNÍ
    sec = softmax(winner_scores(G, active))         # SEKUNDÁRNÍ
    order = [n for n, _ in ranked(prim)]

    os.makedirs(OUT_DIR, exist_ok=True)
    base = os.path.join(OUT_DIR, f"{series}_KR{last}")

    # ---- žebříček (vše) ----
    head = ["Pořadí", "Hráč", "Koho hlasoval", "Kmen", "Aliance",
            "Šance betweenness (%)", "Šance eig+btw (%)", "btw koeficient", "eig koeficient"]
    rows = [[i + 1, nick[n], nick.get(vote_target.get(n), "—"), kmen[n], block.get(n, "—"),
             round(prim[n] * 100, 1), round(sec[n] * 100, 1), round(btw[n], 4), round(eig[n], 4)]
            for i, n in enumerate(order)]
    _save_csv(base + "_ranking.csv", head, rows)
    _save_xlsx(base + "_ranking.xlsx", head, rows, [7, 12, 14, 11, 12, 22, 20, 14, 14])
    json.dump({"serie": series, "kolo": last,
               "ranking": [dict(zip(["poradi", "hrac", "koho_hlasoval", "kmen", "aliance",
                                     "sance_betweenness_pct", "sance_eig_btw_pct", "btw_koef", "eig_koef"], r))
                           for r in rows]},
              open(base + "_ranking.json", "w"), ensure_ascii=False, indent=2)

    # ---- treemapy (jedna na metriku) ----
    thead = ["Aliance", "Kmen", "Hráč", "Šance na výhru (%)"]
    for metric, probs in [("betweenness", prim), ("eigbtw", sec)]:
        trows = [[block.get(n, "—"), kmen[n], nick[n], round(probs[n] * 100, 1)]
                 for n in sorted(order, key=lambda n: (block.get(n, "—"), -probs[n]))]
        _save_csv(f"{base}_treemap_{metric}.csv", thead, trows)
        _save_xlsx(f"{base}_treemap_{metric}.xlsx", thead, trows, [12, 11, 14, 20])

    print(f"OK ({series}, kolo {last}) → out/{series}_KR{last}_*  (ranking + 2 treemapy)")
    for r in rows[:3]:
        print(f"  {r[0]}. {r[1]:<12} {r[4]:<8} btw {r[5]}%  eig+btw {r[6]}%")


if __name__ == "__main__":
    export(sys.argv[1] if len(sys.argv) > 1 else "V")
