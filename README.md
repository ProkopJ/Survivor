# Survivor — síťový model predikce vítěze

Predikce vítěze reality show **Survivor Česko & Slovensko** ze sítě hlasování na kmenových radách.
Metodika je otevřená — tohle je celý model i s jeho validací, včetně chyb, na které jsme cestou narazili.

📊 Predikce po každém díle: Instagram **@survivor.predikce** · *Predikce, ne spoiler.*

---

## Jak to funguje

Po sloučení kmenů se z každé kmenové rady zaznamenává, **kdo na koho hlasoval**. Z těchto hlasů
se staví vážený graf a počítá se centralita hráčů. Myšlenka: kdo je v hlasovací síti centrální,
ten hru ovládá a má největší šanci dojít k výhře.

**Skóre hráče** se počítá na neorientovaném grafu jen mezi aktivními (nevyřazenými) hráči:

- **Primární model — betweenness centralita.** Měří, jak moc hráč „přemosťuje" mezi částmi sítě.
- **Sekundární model — eigenvector + betweenness.** Bohatší rozlišení; v jednotlivých sériích mění
  čísla, ale jeho přínos k *přesnosti* zatím není potvrzený (viz validace).

Pravděpodobnosti vítězství = `softmax(skóre, T=4)`. Predikce vyřazení (kdo dostane nejvíc hlasů)
se odvozuje z in-degree, ale je **málo spolehlivá** — viz níže.

```python
from survivor_model import betweenness_scores, winner_scores, softmax, ranked
scores = betweenness_scores(G, active)   # primární
probs  = softmax(scores)                 # % na výhru
for name, p in ranked(probs):
    print(name, round(p*100, 1))
```

## Validace (poctivě, včetně limitů)

Testováno na dvou kompletních sériích (III, IV). **Série IV je in-sample** (model na ní vznikl),
takže skutečným testem je held-out série III. `n = 2` = nízká statistická síla — ber jako náznak.

- **Není to náhoda.** I na „těžkých" kolech (≥6 hráčů, kde malý vzorek nepomáhá) označí model
  vítěze jako #1 výrazně častěji než náhoda (permutační test, p ≈ 0.001).
- **Signál je „od půlky hry".** V prvních kolech po sloučení model vítěze ještě nevidí; zaměří se
  na něj zhruba od poloviny a pak ho drží. Není to věštec od prvního kola.
- **Betweenness vs eig+btw (leave-one-season-out).** Na obou sériích zvlášť i v křížové validaci
  vychází samotná betweenness stejně nebo lépe a má lépe kalibrované pravděpodobnosti (nižší log-loss).
  Proto je primární. Eigenvector ponecháváme „na zkoušku" do dalších sezón.
- **Predikce vyřazení je slabá** (in-degree ~0–25 % trefa) → prezentovat jen jako nízkou jistotu.
- **Marketingová teze „hlasy proti → respekt poroty → výhra" se v datech nepotvrdila**
  (korelace in-degree a umístění ≈ 0). Hezký příběh, ne doložený vztah.

## Důležité při spuštění

`eigenvector_centrality_numpy` v networkx **vyžaduje scipy**. Když scipy chybí, funkce spadne a
(v původní verzi) se to tiše spolklo → eigenvector vracel nuly a model se **bez varování**
degradoval na betweenness-only. Tato verze má fallback (numpy → iterativní → varování).
**Nainstaluj `scipy`.**

## Spuštění

```bash
pip install -r requirements.txt
python backtest.py          # walk-forward backtest III a IV + výpis
```

Skripty čekají data v `data/` (viz schéma níže). Vlastní data nejsou v repu — doplň je a model
poběží na tvých sériích.

## Schéma dat (`.xlsx`, listy)

- **Hráči** — `Přezdívka`, `Plné jméno`, `Finální pozice`, `V porotě?`
- **Epizody** — kolo, den, `Individuální imunita`
- **Hlasy** — `kolo`, `Hlasující`, `Cíl hlasu` (kdo na koho)
- **Nádoby a duely** — kolo, nejvíc hlasů, … , `Vyřazený`
- **Porota** — `Porotce`, `Hlasoval pro`

## Soubory

| soubor | co dělá |
|---|---|
| `survivor_model.py` | skóre (betweenness / eig+btw), softmax, řazení |
| `survivor_data.py` | načítání dat z `.xlsx` |
| `backtest.py` | walk-forward validace + živý snapshot |

## Licence

MIT — používej volně s uvedením autora. © 2026 Prokop Jeřábek.
