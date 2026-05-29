"""Načítání Survivor dat z .xlsx (viz schéma v README).

    from survivor_data import load_series, get_active, get_post_merge_tcs
    data = load_series('IV')   # 'III' | 'IV' | 'V'
"""
import os
import openpyxl

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SERIES_FILES = {
    "III": "survivor_3_data.xlsx",
    "IV": "survivor_4_data.xlsx",
    "V": "survivor_5_data.xlsx",
}
POST_MERGE_START = {"III": 1, "IV": 13, "V": 1}
POST_MERGE_TCS = {"III": list(range(1, 9)), "IV": list(range(13, 21)), "V": [1]}


def load_series(series):
    wb = openpyxl.load_workbook(os.path.join(DATA_DIR, SERIES_FILES[series]), data_only=True)
    d = {"players": [], "episodes": {}, "votes": {}, "nadoby": {}, "porota": []}

    ws = wb["Hráči"]; h = [c.value for c in ws[1]]
    nick_c = h.index("Přezdívka") if "Přezdívka" in h else (h.index("Jméno") if "Jméno" in h else 1)
    name_c = h.index("Plné jméno") if "Plné jméno" in h else nick_c
    pos_c = h.index("Finální pozice") if "Finální pozice" in h else 3
    jur_c = h.index("V porotě?") if "V porotě?" in h else 4
    kmen_c = h.index("Kmen před sloučením") if "Kmen před sloučením" in h else None
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] is None or r[name_c] is None:
            continue
        d["players"].append({"nick": r[nick_c], "name": r[name_c],
                             "final_pos": r[pos_c] if pos_c < len(r) else None,
                             "in_jury": (r[jur_c] == "ano") if jur_c < len(r) else False,
                             "kmen": (r[kmen_c] if kmen_c is not None and kmen_c < len(r) else None)})

    n2n = {p["nick"]: p["name"] for p in d["players"]}
    n2n.update({p["name"]: p["name"] for p in d["players"]})
    norm = lambda x: n2n.get(x, x)

    if "Epizody" in wb.sheetnames:
        for r in wb["Epizody"].iter_rows(min_row=2, values_only=True):
            if r[0] is None:
                continue
            d["episodes"][r[0]] = {"immunity": norm(r[2]) if len(r) > 2 and r[2] else None}

    ws = wb["Nádoby a duely"]; h = [c.value for c in ws[1]]; has_day = "Den" in (h or [])
    for r in ws.iter_rows(min_row=2, values_only=True):
        if r[0] is None:
            continue
        elim = r[6] if has_day else r[5]
        most = r[2] if has_day else r[1]
        d["nadoby"][r[0]] = {"most_voted": norm(most) if most else None,
                             "eliminated": norm(elim) if elim else None}

    for r in wb["Hlasy"].iter_rows(min_row=2, values_only=True):
        if r[0] is None or r[1] is None or r[2] is None:
            continue
        d["votes"].setdefault(r[0], []).append((norm(r[1]), norm(r[2])))

    if "Porota" in wb.sheetnames:
        for r in wb["Porota"].iter_rows(min_row=2, values_only=True):
            if r[0] and r[1]:
                d["porota"].append((norm(r[0]), norm(r[1])))
    return d


def get_post_merge_tcs(series):
    return POST_MERGE_TCS.get(series, [])


def get_active(data, up_to_tc, post_merge_start):
    elim = set()
    for t in range(post_merge_start, up_to_tc):
        e = data["nadoby"].get(t, {}).get("eliminated")
        if e:
            elim.add(e)
    return [p["name"] for p in data["players"] if p["name"] not in elim]
