"""Instagram balíček po každém dílu — jeden příkaz vyrobí CSV + síťový PNG.

Postup: 1) přegeneruje docs/data.js z aktuálního xlsx  2) z něj vyrobí CSV (přezdívka,
koho hlasoval, šance na výhru)  3) síťový graf 1080×1080 PNG. Bere nejnovější odehrané
kolo dané série, takže stačí spustit po doplnění kola do Excelu.

Použití:  python make_instagram.py [V|IV|III] [kr]   (default V, poslední kolo)
Výstupy:  ../V_KR<n>_instagram.csv  a  ../sit_hlasu_V_KR<n>.png
"""
import csv, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)            # složka Survivor (o úroveň výš)
DATA_JS = os.path.join(HERE, "docs", "data.js")


def regen_data():
    """Přegeneruje docs/data.js z aktuálních xlsx (čerstvá data před exportem)."""
    r = subprocess.run([sys.executable, os.path.join(HERE, "make_dashboard_data.py")],
                       capture_output=True, text=True, cwd=HERE)
    if r.returncode != 0:
        print("⚠️  make_dashboard_data.py selhal:\n", r.stderr[-800:]); sys.exit(1)
    print("✓ data.js přegenerováno")


def load_round(series, kr):
    txt = open(DATA_JS, encoding="utf-8").read()
    D = json.loads(txt[txt.find("{"):txt.rfind("}") + 1])
    s = D["series"][series]
    r = next((x for x in s["rounds"] if x["kr"] == kr), s["rounds"][-1]) if kr else s["rounds"][-1]
    return s, r


def make_csv(series, r):
    fn = os.path.join(ROOT, f"{series}_KR{r['kr']}_instagram.csv")
    with open(fn, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Přezdívka", "Koho hlasoval", "Šance na výhru (%)"])
        for x in r["ranking"]:          # jen aktivní, už seřazené dle šance
            w.writerow([x["nick"], x.get("voted") or "—", f'{x["btw"]:.1f}'])
    print("✓ CSV  ->", os.path.basename(fn), f"({len(r['ranking'])} hráčů)")
    return fn


def make_png(series, kr):
    args = [sys.executable, os.path.join(HERE, "make_network_png.py"), series]
    if kr:
        args.append(str(kr))
    r = subprocess.run(args, capture_output=True, text=True, cwd=HERE)
    if r.returncode != 0:
        print("⚠️  PNG generátor selhal:\n", r.stderr[-800:]); return
    print("✓ PNG  ->", r.stdout.strip().split("-> ")[-1])


def main():
    series = sys.argv[1] if len(sys.argv) > 1 else "V"
    kr = int(sys.argv[2]) if len(sys.argv) > 2 else None
    print(f"=== Instagram balíček: Survivor {series}{' KR' + str(kr) if kr else ' (poslední kolo)'} ===")
    regen_data()
    s, r = load_round(series, kr)
    print(f"  kolo KR{r['kr']} ({r['n']}. kmenová rada) · {len(r['ranking'])} aktivních hráčů")
    make_csv(series, r)
    make_png(series, kr)
    print("Hotovo. Soubory jsou ve složce Survivor.")


if __name__ == "__main__":
    main()
