"""Síťový graf hlasování → čtverec 1080×1080 PNG pro Instagram (brand Lush Island).
Uzly = hráči (velikost ~ šance na výhru, barva = hlasovací blok), šipky = kdo na koho hlasoval,
vyřazený přeškrtnutý. Data se berou z docs/data.js (poslední odehrané kolo dané série).

Použití:  python make_network_png.py [V|IV|III] [kr]   (default V, poslední kolo)
"""
import json, os, sys, math
import numpy as np
import networkx as nx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import FancyArrowPatch

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_JS = os.path.join(HERE, "docs", "data.js")

# --- brand Lush Island ---
BG = "#DAD2C4"; INK = "#2A2A28"; INK2 = "#6B6256"; ORANGE = "#E8623A"; TEAL = "#1F9E92"
PAL = ["#E8623A", "#1F9E92", "#E7AE3A", "#3E6FA3", "#9B5DE5", "#C0473E"]
ELIM = "#9A9082"

# font Archivo (stažený) s fallbackem
FONT = None
for cand in ["/tmp/Archivo.ttf", os.path.join(HERE, "Archivo.ttf")]:
    if os.path.exists(cand):
        fm.fontManager.addfont(cand); FONT = fm.FontProperties(fname=cand); break
def font(sz, weight="bold"):
    if FONT:
        f = FONT.copy(); f.set_size(sz); f.set_weight(weight); return f
    return fm.FontProperties(family="DejaVu Sans", size=sz, weight=weight)


def load_round(series, kr=None):
    txt = open(DATA_JS, encoding="utf-8").read()
    D = json.loads(txt[txt.find("{"):txt.rfind("}") + 1])
    s = D["series"][series]
    rounds = s["rounds"]
    r = next((x for x in rounds if x["kr"] == kr), rounds[-1]) if kr else rounds[-1]
    return s, r


def main():
    series = sys.argv[1] if len(sys.argv) > 1 else "V"
    kr = int(sys.argv[2]) if len(sys.argv) > 2 else None
    s, r = load_round(series, kr)
    blocs = r["blocs"]            # [{target, members}]
    rank = {x["nick"]: x["btw"] for x in r["ranking"]}
    elim = set((r.get("eliminated") or "").replace(", ", ",").split(",")) - {""}
    most = r.get("most_voted")

    # graf: hrana hlasující -> cíl; barva uzlu dle bloku, v němž hlasoval
    G = nx.DiGraph()
    node_block = {}
    targets = [b["target"] for b in blocs]
    for bi, b in enumerate(blocs):
        for m in b["members"]:
            node_block[m] = bi
            G.add_edge(m, b["target"])
    for t in targets:
        G.add_node(t)
        node_block.setdefault(t, targets.index(t))
    nodes = list(G.nodes())

    # layout: deterministický (seed), pak mírně roztáhnout
    pos = nx.spring_layout(G, k=1.5, iterations=300, seed=7)
    # normalizace do [-1,1]
    xs = np.array([pos[n][0] for n in nodes]); ys = np.array([pos[n][1] for n in nodes])
    xs = (xs - xs.mean()) / (np.abs(xs).max() + 1e-9)
    ys = (ys - ys.mean()) / (np.abs(ys).max() + 1e-9)
    pos = {n: (xs[i], ys[i]) for i, n in enumerate(nodes)}

    # --- kreslení 1080×1080 ---
    fig = plt.figure(figsize=(10.8, 10.8), dpi=100)
    fig.patch.set_facecolor(BG)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_facecolor(BG)
    ax.set_xlim(-1.32, 1.32); ax.set_ylim(-1.5, 1.42); ax.axis("off")

    # nadpis (dvě části vedle sebe — měřím šířku přes renderer)
    label = {"III": "Survivor III", "IV": "Survivor IV", "V": "Survivor V"}[series]
    fig.canvas.draw()
    t1 = ax.text(-1.28, 1.34, "SURVIVOR ", font=font(34, "black"), color=INK, va="top")
    bb = t1.get_window_extent(renderer=fig.canvas.get_renderer())
    inv = ax.transData.inverted()
    x_end = inv.transform((bb.x1, bb.y0))[0]
    ax.text(x_end, 1.34, "SÍŤ HLASŮ", font=font(34, "black"), color=ORANGE, va="top")
    ax.text(-1.28, 1.17, f"{label} · {r['n']}. kmenová rada · šipka = kdo na koho hlasoval",
            font=font(13.5, "semibold"), color=INK2, va="top")

    R = 0.135  # vztažný poloměr uzlu
    rad = {n: R * (0.62 + 1.5 * math.sqrt(rank.get(n, 3) / 100.0)) for n in nodes}

    # hrany (šipky) — od okraje uzlu k okraji cíle
    for u, v in G.edges():
        x1, y1 = pos[u]; x2, y2 = pos[v]
        dx, dy = x2 - x1, y2 - y1; dist = math.hypot(dx, dy) or 1
        ux, uy = dx / dist, dy / dist
        sx, sy = x1 + ux * rad[u], y1 + uy * rad[u]
        ex, ey = x2 - ux * rad[v], y2 - uy * rad[v]
        col = ELIM if u in elim else PAL[node_block[u] % len(PAL)]
        ax.add_patch(FancyArrowPatch((sx, sy), (ex, ey), arrowstyle="-|>", mutation_scale=26,
                     lw=3.2, color=col, alpha=0.45 if u in elim else 0.9, shrinkA=0, shrinkB=0,
                     connectionstyle="arc3,rad=0.12", zorder=1, capstyle="round"))

    # uzly
    for n in nodes:
        x, y = pos[n]; rr = rad[n]
        is_elim = n in elim
        col = ELIM if is_elim else PAL[node_block[n] % len(PAL)]
        ax.scatter([x], [y], s=(rr * 1000) ** 2 * 0.9, c=col, zorder=3,
                   edgecolors="#F7F3EB", linewidths=2.5, alpha=0.92 if not is_elim else 0.6)
        # jméno
        txtcol = "#fff" if not is_elim else "#5A5248"
        ax.text(x, y, n, font=font(15.5 if not is_elim else 14, "bold"), color=txtcol,
                ha="center", va="center", zorder=4)
        # šance na výhru pod uzlem
        if not is_elim:
            ax.text(x, y - rr - 0.045, f"{rank.get(n, 0):.0f}%", font=font(12.5, "bold"),
                    color=INK, ha="center", va="top", zorder=4)
        else:
            ax.plot([x - rr * 0.9, x + rr * 0.9], [y, y], color="#5A5248", lw=2.5, zorder=5)
            ax.text(x, y - rr - 0.045, "vyřazen(a)", font=font(11, "bold"),
                    color=ELIM, ha="center", va="top", zorder=4)

    # patička
    ax.text(0, -1.46, "@survivor.predikce · síťový model · velikost uzlu = šance na výhru",
            font=font(12.5, "semibold"), color=INK2, ha="center", va="bottom")

    out = os.path.join(os.path.dirname(HERE), f"V_sit_hlasu_{series}_KR{r['kr']}.png" if False
                       else f"sit_hlasu_{series}_KR{r['kr']}.png")
    out = os.path.join(os.path.dirname(HERE), f"sit_hlasu_{series}_KR{r['kr']}.png")
    fig.savefig(out, dpi=100, facecolor=BG)
    plt.close(fig)
    print("OK ->", out, "(1080×1080)")


if __name__ == "__main__":
    main()
