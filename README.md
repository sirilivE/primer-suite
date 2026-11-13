# Primer Suite

Primer design, primer-binding check and multiplex primer-dimer analysis.
One code base runs as a **web app** (any modern browser, can even be opened as a local file)
and as an **offline desktop application** (Windows / macOS / Linux via Electron).
All calculations run locally; no sequence data leaves the computer.

**[User guide](docs/USER_GUIDE.md)** — installation, step-by-step use of every tab, parameter reference, interpretation of results and troubleshooting.

## Features

| Tab | What it does |
| --- | --- |
| **Primer Design** | Primer3-style design of primer pairs for a template (optionally around a target region). Filters on length, Tm, GC%, GC clamp, poly-X runs, 3′ stability, self-dimer, hairpin, cross-dimer and uniqueness; ranks pairs by penalty; shows product, structures, export CSV/JSON. |
| **Binding Check** | Scans both strands of a template for every binding site of one or more primers (up to N mismatches, IUPAC codes supported). Reports position, mismatch positions, 3′-end mismatches, estimated Tm, alignment, a binding map and all predicted PCR products (including unintended and single-primer products). |
| **Multiplex Dimers** | For a set of primers to be used in one tube: full pairwise cross-dimer ΔG matrix (heat-map), 3′-end dimer detection, hairpins, self-dimers, Tm spread, a per-primer count of how many times it forms a problematic dimer, a sorted list of interactions with alignments, and a suggested split into compatible pools. |
| **Settings** | Reaction conditions (Na⁺, Mg²⁺, dNTP, primer concentration, ΔG temperature) used for all Tm/ΔG values, the organism background-sequence library manager, and a quick single-primer analyser. |

### Input options

* **Files** – every template and primer box has an *Open file…* button. Supported: FASTA (single or multi-record), GenBank (`.gb/.gbk`, sequence taken from `ORIGIN`), plain text, and `name,sequence` CSV/TSV lists for primers.
* **NCBI accession** – type an accession (e.g. `NM_001101.5`) and press *Fetch from NCBI* to download the FASTA record (internet required; everything else works offline).
* **Organism** – choose the organism (human, mouse, rat, zebrafish, fly, worm, Arabidopsis, rice, yeast, E. coli, B. subtilis, S. aureus, P. aeruginosa, M. tuberculosis, P. falciparum, SARS-CoV-2, custom). The choice is shared by all tabs and
  * offers a typical GC range for design (*Apply GC range*),
  * owns a **background sequence library**: load genome/transcriptome/plasmid FASTA or GenBank files under *Settings → Organisms*. They are stored inside the app/browser (IndexedDB) so they stay available offline.
  * **Primer Design** screens every result pair against that library (≤ 2 mismatches, last 3 bases of the 3′ end matched, products ≤ 4 kb) and marks pairs with off-target products or extra binding sites.
  * **Binding Check** can scan the library records in addition to the pasted template.
  Whole mammalian genomes are too large to scan in a browser; use transcript sets, single chromosomes or gene regions.

Results flow between tabs: a designed pair can be sent straight to the binding check or added to the multiplex set.

## Run the web version

```bash
node serve.js            # then open http://localhost:8080
```

or double-click `start-web.bat` (Windows) / `start-web.sh` (Linux, macOS), or simply open `src/index.html` in a browser (no server needed), or copy the `src/` folder to any static web host.

## Run / build the desktop version

```bash
npm install              # downloads Electron (one time, needs internet)
npm start                # run the desktop app
npm run dist:win         # build Windows installer + portable .exe  (dist/)
npm run dist:linux       # AppImage + .deb
npm run dist:mac         # .dmg (run on macOS)
```

The built application is fully offline. Packages are written to `dist/`:

* `Primer Suite-1.0.0-win.zip` – Windows: unzip anywhere and run `Primer Suite.exe` (no installation). Built with `npm run dist:win -- zip` on any OS.
* `Primer Suite Setup 1.0.0.exe` – Windows installer, built with `npm run dist:win` on Windows (or on Linux with 32-bit wine installed).
* `Primer Suite-1.0.0.AppImage` and `primer-suite_1.0.0_amd64.deb` – Linux.
* `npm run dist:mac` on macOS produces a `.dmg`.

`dist/` and `node_modules/` are not committed; download or rebuild them.

## Tests

```bash
npm test
```

## Methods

* **Tm** – nearest-neighbour model, SantaLucia (1998) unified parameters; salt correction
  0.368·(N−1)·ln[Na⁺]; Mg²⁺ converted to a Na⁺ equivalent as 120·√([Mg²⁺]−[dNTP]) (von Ahsen 2001).
* **Dimers** – every antiparallel ungapped alignment of two primers is scored: stems (≥ 2 bp) with
  nearest-neighbour ΔG + duplex initiation + internal-loop penalties (SantaLucia & Hicks 2004).
  Both the most stable structure and the most stable structure that involves a 3′-terminal base are reported.
* **Hairpins** – all stem/loop combinations (loop ≥ 3 nt) with stacking + hairpin-loop penalties.
* **Binding** – exhaustive scan with mismatches; Tm of mismatched sites estimated from matched stacks only.
* **Multiplex** – pairwise matrix; severity thresholds are user-adjustable
  (defaults: warn ≤ −6, fail ≤ −9, 3′-end dimer ≤ −5, hairpin ≤ −3 kcal/mol, Tm spread > 5 °C).

## Project layout

```
src/engine.js     shared algorithms (browser global + CommonJS)
src/index.html    UI markup
src/style.css     styles (light/dark)
src/app.js        UI logic
electron/main.js  desktop wrapper
serve.js          zero-dependency static server for the web version
test/             engine tests (node)
```
