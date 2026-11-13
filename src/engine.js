/*
 * Primer Suite engine — shared by the web app and the Electron desktop app.
 * Pure JavaScript, no dependencies. Works as a browser global (PrimerEngine)
 * and as a CommonJS module (require('./engine')).
 *
 * Thermodynamics: SantaLucia (1998) unified nearest-neighbour parameters,
 * salt correction after SantaLucia (1998) with Mg2+/dNTP conversion after
 * von Ahsen et al. (2001). Loop penalties after SantaLucia & Hicks (2004).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrimerEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  const IUPAC = { A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
  const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N' };
  const MASK = { A: 1, C: 2, G: 4, T: 8, R: 5, Y: 10, S: 6, W: 9, K: 12, M: 3, B: 14, D: 13, H: 11, V: 7, N: 15 };

  // Nearest-neighbour ΔH (kcal/mol), ΔS (cal/K·mol); key = top strand 5'→3' dinucleotide
  const NN = {
    AA: [-7.9, -22.2], TT: [-7.9, -22.2],
    AT: [-7.2, -20.4],
    TA: [-7.2, -21.3],
    CA: [-8.5, -22.7], TG: [-8.5, -22.7],
    GT: [-8.4, -22.4], AC: [-8.4, -22.4],
    CT: [-7.8, -21.0], AG: [-7.8, -21.0],
    GA: [-8.2, -22.2], TC: [-8.2, -22.2],
    CG: [-10.6, -27.2],
    GC: [-9.8, -24.4],
    GG: [-8.0, -19.9], CC: [-8.0, -19.9]
  };
  const INIT_GC = [0.1, -2.8];
  const INIT_AT = [2.3, 4.1];
  const R_GAS = 1.987; // cal/K·mol

  const DEFAULT_COND = { na: 50, mg: 1.5, dntp: 0.8, oligo: 250, temp: 37 }; // mM, mM, mM, nM, °C

  // ------------------------------------------------------------ sequence utils
  function cleanSeq(s) {
    return String(s || '').toUpperCase().replace(/U/g, 'T').replace(/[^ACGTRYSWKMBDHVN]/g, '');
  }

  function revcomp(seq) {
    let out = '';
    for (let i = seq.length - 1; i >= 0; i--) out += COMP[seq[i]] || 'N';
    return out;
  }

  function gcContent(seq) {
    if (!seq.length) return 0;
    let gc = 0;
    for (const b of seq) if (b === 'G' || b === 'C' || b === 'S') gc++;
    return (100 * gc) / seq.length;
  }

  // a (top) pairs with b (bottom) if any expansion of a complements any expansion of b
  function isComplementary(a, b) {
    const ma = MASK[a], mb = MASK[COMP[b]];
    return !!(ma && mb && (ma & mb));
  }
  // probe base (may be degenerate) covers template base
  function matchesBase(probe, tmpl) {
    const mp = MASK[probe], mt = MASK[tmpl];
    return !!(mp && mt && (mp & mt));
  }

  function isGenBank(text) { return /^LOCUS\s/m.test(text) && /^ORIGIN/m.test(text); }

  /** Parse one or more sequence records from FASTA, GenBank or plain text. */
  function parseRecords(text) {
    text = String(text || '');
    const recs = [];
    if (isGenBank(text)) {
      for (const chunk of text.split(/^\/\/\s*$/m)) {
        const o = chunk.search(/^ORIGIN/m);
        if (o < 0) continue;
        const loc = chunk.match(/^LOCUS\s+(\S+)/m), def = chunk.match(/^DEFINITION\s+(.+)/m), org = chunk.match(/^\s+ORGANISM\s+(.+)/m);
        const seq = cleanSeq(chunk.slice(o).replace(/^ORIGIN.*$/m, '').replace(/[0-9]/g, ''));
        if (seq) recs.push({ name: loc ? loc[1] : 'record' + (recs.length + 1), description: def ? def[1].trim() : '', organism: org ? org[1].trim() : '', seq });
      }
      return recs;
    }
    if (text.indexOf('>') >= 0) {
      let cur = null;
      for (const ln of text.split(/\r?\n/)) {
        if (ln.startsWith('>')) { cur = { name: ln.slice(1).trim() || 'record' + (recs.length + 1), description: '', seq: '' }; recs.push(cur); continue; }
        if (ln.startsWith(';')) continue;
        if (!cur) { cur = { name: 'record1', description: '', seq: '' }; recs.push(cur); }
        cur.seq += cleanSeq(ln);
      }
      return recs.filter(r => r.seq.length);
    }
    const seq = cleanSeq(text);
    return seq ? [{ name: null, description: '', seq }] : [];
  }

  /** Parse template text (first record of FASTA/GenBank, or plain). [ ] marks a target region. */
  function parseTemplate(text) {
    text = String(text || '');
    if (isGenBank(text)) {
      const recs = parseRecords(text);
      const r = recs[0] || { name: null, seq: '' };
      return { name: r.name, seq: r.seq, target: null, records: recs.length };
    }
    const lines = text.split(/\r?\n/);
    let name = null, records = 0;
    const body = [];
    for (const ln of lines) {
      if (ln.startsWith('>')) { records++; if (records > 1) break; name = ln.slice(1).trim(); continue; }
      if (ln.startsWith(';')) continue;
      body.push(ln);
    }
    const raw = body.join('');
    let target = null;
    const open = raw.indexOf('['), close = raw.indexOf(']');
    if (open >= 0 && close > open) {
      const before = cleanSeq(raw.slice(0, open)).length;
      const inside = cleanSeq(raw.slice(open + 1, close)).length;
      if (inside > 0) target = { start: before + 1, end: before + inside };
    }
    return { name, seq: cleanSeq(raw.replace(/[\[\]]/g, '')), target, records: Math.max(1, records) };
  }

  /** Parse a primer list: FASTA, "name seq", "name,seq", "name<TAB>seq", or bare sequences. */
  function parsePrimerList(text) {
    const out = [];
    const lines = String(text || '').split(/\r?\n/);
    let pendingName = null;
    let auto = 1;
    for (let ln of lines) {
      ln = ln.trim();
      if (!ln) continue;
      if (ln.startsWith('>')) { pendingName = ln.slice(1).trim() || null; continue; }
      if (ln.startsWith('#') || ln.startsWith(';')) continue;
      const tokens = ln.split(/[\s,;\t]+/).filter(Boolean);
      let seqTok = null, nameToks = [];
      // the last token that looks like a sequence is the sequence
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (/^[ACGTUacgtuRYSWKMBDHVNryswkmbdhvn]+$/.test(tokens[i]) && tokens[i].length >= 6) { seqTok = tokens[i]; nameToks = tokens.slice(0, i).concat(tokens.slice(i + 1)); break; }
      }
      if (!seqTok) continue;
      let name = pendingName || nameToks.join(' ') || ('Primer' + auto);
      pendingName = null;
      auto++;
      out.push({ name, seq: cleanSeq(seqTok) });
    }
    return out;
  }

  // ------------------------------------------------------------ thermodynamics
  function expand(b) { return IUPAC[b] || ''; }

  const stackCache = {};
  function stackHS(d) {
    if (stackCache[d]) return stackCache[d];
    const e1 = expand(d[0]), e2 = expand(d[1]);
    if (!e1 || !e2) return null;
    let h = 0, s = 0, n = 0;
    for (const x of e1) for (const y of e2) { const p = NN[x + y]; h += p[0]; s += p[1]; n++; }
    return (stackCache[d] = [h / n, s / n]);
  }
  function initHS(base) {
    const m = MASK[base] || 15;
    const strong = (m & 6) !== 0, weak = (m & 9) !== 0;
    if (strong && !weak) return INIT_GC;
    if (weak && !strong) return INIT_AT;
    return [(INIT_GC[0] + INIT_AT[0]) / 2, (INIT_GC[1] + INIT_AT[1]) / 2];
  }
  function naEquivalent(cond) {
    const mgFree = Math.max(0, (cond.mg || 0) - (cond.dntp || 0));
    return (cond.na || 0) / 1000 + (120 * Math.sqrt(mgFree)) / 1000; // molar
  }
  function saltDS(dS, nPairs, cond) {
    const na = Math.max(naEquivalent(cond), 1e-4);
    return dS + 0.368 * Math.max(0, nPairs - 1) * Math.log(na);
  }
  function withCond(c) { return Object.assign({}, DEFAULT_COND, c || {}); }

  /**
   * Nearest-neighbour thermodynamics of a primer (optionally with a per-base match mask
   * so that only matched stacks contribute — used for mismatched binding sites).
   */
  function thermo(seq, cond, matchMask) {
    cond = withCond(cond);
    seq = cleanSeq(seq);
    const n = seq.length;
    const res = { length: n, gc: gcContent(seq), dH: 0, dS: 0, tm: NaN, dG: NaN, stacks: 0 };
    if (n < 2) return res;
    let dH = 0, dS = 0, stacks = 0;
    for (let i = 0; i < n - 1; i++) {
      if (matchMask && !(matchMask[i] && matchMask[i + 1])) continue;
      const p = stackHS(seq[i] + seq[i + 1]);
      if (!p) continue;
      dH += p[0]; dS += p[1]; stacks++;
    }
    if (stacks === 0) return res;
    let first = 0, last = n - 1;
    if (matchMask) { while (first < n && !matchMask[first]) first++; while (last >= 0 && !matchMask[last]) last--; }
    const i1 = initHS(seq[first]), i2 = initHS(seq[last]);
    dH += i1[0] + i2[0]; dS += i1[1] + i2[1];
    const selfComp = !matchMask && seq === revcomp(seq);
    if (selfComp) dS += -1.4;
    const dSc = saltDS(dS, stacks + 1, cond);
    const ct = ((cond.oligo || 250) * 1e-9) / (selfComp ? 1 : 4);
    const tm = (dH * 1000) / (dSc + R_GAS * Math.log(ct)) - 273.15;
    const dG = dH - ((273.15 + (cond.temp || 37)) * dSc) / 1000;
    return Object.assign(res, { dH, dS: dSc, tm, dG, stacks });
  }

  // Loop penalties (kcal/mol at 37 °C)
  const HP_LOOP = { 3: 3.5, 4: 3.5, 5: 3.3, 6: 4.0, 7: 4.2, 8: 4.3, 9: 4.5, 10: 4.6, 12: 5.0, 14: 5.1, 16: 5.3, 18: 5.5, 20: 5.7, 25: 6.1, 30: 6.3 };
  function hairpinLoopDG(n) {
    if (n < 3) return Infinity;
    if (HP_LOOP[n] !== undefined) return HP_LOOP[n];
    if (n > 30) return 6.3 + 1.75 * R_GAS * 310.15 * Math.log(n / 30) / 1000;
    const keys = Object.keys(HP_LOOP).map(Number).sort((a, b) => a - b);
    let lo = keys[0], hi = keys[keys.length - 1];
    for (const k of keys) { if (k < n) lo = k; if (k > n) { hi = k; break; } }
    return HP_LOOP[lo] + (HP_LOOP[hi] - HP_LOOP[lo]) * (n - lo) / (hi - lo);
  }
  const INT_LOOP = { 2: 0.8, 3: 3.2, 4: 3.6, 5: 4.0, 6: 4.4, 7: 4.6, 8: 4.8, 9: 4.9, 10: 4.9 };
  function internalLoopDG(n) {
    if (n <= 10) return INT_LOOP[Math.max(2, n)];
    return 4.9 + 1.08 * Math.log(n / 10);
  }

  /**
   * Score an ungapped antiparallel alignment given per-column top-strand bases and a
   * pairing flag. Runs of ≥2 consecutive pairs are stems; the most stable contiguous set
   * of stems (with internal-loop penalties between them) is returned.
   */
  function scoreColumns(top, paired, cond) {
    const T = 273.15 + (cond.temp || 37);
    const runs = [];
    let i = 0;
    while (i < top.length) {
      if (paired[i]) {
        let j = i;
        while (j + 1 < top.length && paired[j + 1]) j++;
        if (j - i + 1 >= 2) runs.push([i, j]);
        i = j + 1;
      } else i++;
    }
    if (!runs.length) return null;
    const rH = [], rS = [];
    for (const [a, b] of runs) {
      let h = 0, s = 0;
      for (let c = a; c < b; c++) { const p = stackHS(top[c] + top[c + 1]); if (p) { h += p[0]; s += p[1]; } }
      rH.push(h); rS.push(s);
    }
    let best = null;
    for (let a = 0; a < runs.length; a++) {
      let H = 0, S = 0, loop = 0, bp = 0;
      for (let b = a; b < runs.length; b++) {
        H += rH[b]; S += rS[b]; bp += runs[b][1] - runs[b][0] + 1;
        if (b > a) loop += internalLoopDG(2 * (runs[b][0] - runs[b - 1][1] - 1));
        const i1 = initHS(top[runs[a][0]]), i2 = initHS(top[runs[b][1]]);
        const dH = H + i1[0] + i2[0];
        const dS = saltDS(S + i1[1] + i2[1], bp, cond);
        const dG = dH - (T * dS) / 1000 + loop;
        if (!best || dG < best.dG) best = { dG, dH, dS, bp, loop, runs: runs.slice(a, b + 1), from: runs[a][0], to: runs[b][1] };
      }
    }
    return best;
  }

  function inRuns(col, runs) { return runs.some(r => col >= r[0] && col <= r[1]); }

  /** ΔG of one contiguous stem alone (stacks + initiation + salt). */
  function stemDG(top, run, cond) {
    const T = 273.15 + (cond.temp || 37);
    let h = 0, sv = 0;
    for (let c = run[0]; c < run[1]; c++) { const p = stackHS(top[c] + top[c + 1]); if (p) { h += p[0]; sv += p[1]; } }
    const i1 = initHS(top[run[0]]), i2 = initHS(top[run[1]]);
    return h + i1[0] + i2[0] - (T * saltDS(sv + i1[1] + i2[1], run[1] - run[0] + 1, cond)) / 1000;
  }

  function depictColumns(top, bot, paired, runs) {
    let t = '', m = '', b = '';
    for (let c = 0; c < top.length; c++) {
      t += top[c] || ' ';
      b += bot[c] || ' ';
      m += paired[c] && inRuns(c, runs) ? '|' : ' ';
    }
    return "5'-" + t + "-3'\n   " + m + "   \n3'-" + b + "-5'";
  }

  /** Cross-dimer (or self-dimer when a === b) analysis. */
  function dimer(a, b, cond) {
    cond = withCond(cond);
    a = cleanSeq(a); b = cleanSeq(b);
    const la = a.length, lb = b.length;
    const brev = b.split('').reverse().join('');
    let best = null, bestEnd3 = null, bestEnd3Full = null;
    for (let s = -(lb - 1); s <= la - 1; s++) {
      const c0 = Math.min(0, s), c1 = Math.max(la - 1, s + lb - 1);
      const ncol = c1 - c0 + 1;
      const top = new Array(ncol), bot = new Array(ncol), paired = new Array(ncol);
      let any = false;
      for (let c = c0; c <= c1; c++) {
        const ia = c, ib = c - s;
        const ta = ia >= 0 && ia < la ? a[ia] : null;
        const tb = ib >= 0 && ib < lb ? brev[ib] : null;
        top[c - c0] = ta; bot[c - c0] = tb;
        const p = !!(ta && tb && isComplementary(ta, tb));
        paired[c - c0] = p; if (p) any = true;
      }
      if (!any) continue;
      const sc = scoreColumns(top, paired, cond);
      if (!sc) continue;
      const topEndCol = la - 1 - c0;    // 3' end of a
      const botEndCol = s - c0;         // 3' end of b (brev[0])
      const end3Top = inRuns(topEndCol, sc.runs);
      const end3Bottom = inRuns(botEndCol, sc.runs);
      let sDG = null, sBp = 0;
      for (const col of [end3Top ? topEndCol : -1, end3Bottom ? botEndCol : -1]) {
        if (col < 0) continue;
        const run = sc.runs.find(r => col >= r[0] && col <= r[1]);
        const g = stemDG(top, run, cond);
        if (sDG === null || g < sDG) { sDG = g; sBp = run[1] - run[0] + 1; }
      }
      const res = {
        dG: round(sc.dG), bp: sc.bp, offset: s, end3: end3Top || end3Bottom, end3Top, end3Bottom,
        stemDG: sDG === null ? null : round(sDG), stemBp: sBp,
        depiction: depictColumns(top, bot, paired, sc.runs)
      };
      if (!best || res.dG < best.dG) best = res;
      if (res.end3) {
        if (!bestEnd3 || res.stemDG < bestEnd3.stemDG || (res.stemDG === bestEnd3.stemDG && res.dG < bestEnd3.dG)) bestEnd3 = res;
        if (!bestEnd3Full || res.dG < bestEnd3Full.dG) bestEnd3Full = res;
      }
    }
    // end3: 3'-anchored structure with the most stable 3' stem (stemDG = that stem alone, dG = whole structure)
    // end3Full: 3'-anchored structure with the most stable overall ΔG
    return { dG: best ? best.dG : 0, bp: best ? best.bp : 0, best, end3: bestEnd3, end3Full: bestEnd3Full };
  }

  /** Hairpin analysis of a single oligo. */
  function hairpin(seq, cond) {
    cond = withCond(cond);
    const s = cleanSeq(seq), n = s.length;
    const T = 273.15 + (cond.temp || 37);
    let best = null;
    for (let k = 4; k <= 2 * n - 6; k++) {
      const iMin = Math.max(0, k - (n - 1)), iMax = Math.floor((k - 4) / 2);
      if (iMax < iMin) continue;
      const cols = iMax - iMin + 1;
      const top = new Array(cols), paired = new Array(cols);
      let any = false;
      for (let i = iMin; i <= iMax; i++) {
        top[i - iMin] = s[i];
        const p = isComplementary(s[i], s[k - i]);
        paired[i - iMin] = p; if (p) any = true;
      }
      if (!any) continue;
      // runs
      const runs = [];
      let c = 0;
      while (c < cols) {
        if (paired[c]) { let j = c; while (j + 1 < cols && paired[j + 1]) j++; if (j - c + 1 >= 2) runs.push([c, j]); c = j + 1; } else c++;
      }
      if (!runs.length) continue;
      const rH = [], rS = [];
      for (const [a, b] of runs) {
        let h = 0, sv = 0;
        for (let q = a; q < b; q++) { const p = stackHS(top[q] + top[q + 1]); if (p) { h += p[0]; sv += p[1]; } }
        rH.push(h); rS.push(sv);
      }
      for (let bIdx = 0; bIdx < runs.length; bIdx++) {
        const iIn = runs[bIdx][1] + iMin, jIn = k - iIn, loopLen = jIn - iIn - 1;
        const hpLoop = hairpinLoopDG(loopLen);
        let H = 0, S = 0, loop = 0, bp = 0;
        for (let a = bIdx; a >= 0; a--) {
          H += rH[a]; S += rS[a]; bp += runs[a][1] - runs[a][0] + 1;
          if (a < bIdx) loop += internalLoopDG(2 * (runs[a + 1][0] - runs[a][1] - 1));
          const dG = H - (T * saltDS(S, bp, cond)) / 1000 + loop + hpLoop;
          if (!best || dG < best.dG) {
            const used = runs.slice(a, bIdx + 1).map(r => [r[0] + iMin, r[1] + iMin]);
            best = { dG, bp, loop: loopLen, k, runs: used, stemStart: used[0][0], stemEnd: k - used[0][0] };
          }
        }
      }
    }
    if (!best) return { dG: 0, bp: 0, loop: 0, end3: false, dotBracket: '.'.repeat(n), depiction: '' };
    const db = new Array(n).fill('.');
    for (const [a, b] of best.runs) for (let i = a; i <= b; i++) { db[i] = '('; db[best.k - i] = ')'; }
    const end3 = db[n - 1] === ')';
    // two-line depiction: 5' arm over 3' arm (reversed)
    const half = Math.floor(best.k / 2);
    const armTop = s.slice(0, half + 1), armBot = s.slice(half + 1).split('').reverse().join('');
    const padTop = Math.max(0, n - 1 - best.k), padBot = Math.max(0, best.k - (n - 1));
    const mid = [];
    for (let i = 0; i <= half; i++) mid.push(db[i] === '(' ? '|' : ' ');
    const depiction = "5'-" + ' '.repeat(padTop) + armTop + "\n   " + ' '.repeat(padTop) + mid.join('') + "\n3'-" + ' '.repeat(padBot) + armBot;
    return { dG: round(best.dG), bp: best.bp, loop: best.loop, end3, dotBracket: db.join(''), depiction };
  }

  // ------------------------------------------------------------------- quality
  function maxHomopolymer(seq) {
    let best = 0, cur = 0;
    for (let i = 0; i < seq.length; i++) { cur = i > 0 && seq[i] === seq[i - 1] ? cur + 1 : 1; if (cur > best) best = cur; }
    return best;
  }
  function maxDinucRepeat(seq) {
    let best = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      const d = seq.slice(i, i + 2);
      if (d[0] === d[1]) continue;
      let n = 1, j = i + 2;
      while (j + 1 < seq.length && seq.slice(j, j + 2) === d) { n++; j += 2; }
      if (n > best) best = n;
    }
    return best;
  }
  function gcLast5(seq) { return gcContent(seq.slice(-5)) * 5 / 100; }

  /** Full single-primer report. */
  function analyzePrimer(seq, cond) {
    cond = withCond(cond);
    seq = cleanSeq(seq);
    const th = thermo(seq, cond);
    const sd = dimer(seq, seq, cond);
    const hp = hairpin(seq, cond);
    const end5 = seq.length >= 5 ? thermo(seq.slice(-5), cond).dG : NaN;
    return {
      seq, length: seq.length, gc: round(th.gc, 1), tm: round(th.tm, 1), dG: round(th.dG),
      selfDimer: sd, hairpin: hp, end3Stability: round(end5),
      homopolymer: maxHomopolymer(seq), dinucRepeat: maxDinucRepeat(seq), gcClamp: gcLast5(seq)
    };
  }

  // ------------------------------------------------------------------- binding
  /** Find all binding sites of a primer on both strands of a template (≤ maxMismatch). */
  function findBindingSites(template, primer, opts) {
    opts = opts || {};
    const cond = withCond(opts.cond);
    const maxMm = opts.maxMismatch == null ? 3 : opts.maxMismatch;
    const limit = opts.maxSites || 500;
    const T = cleanSeq(template), P = cleanSeq(primer);
    const n = P.length, L = T.length;
    const sites = [];
    if (n < 6 || L < n) return sites;
    const scan = (probe, strand) => {
      for (let p = 0; p <= L - n; p++) {
        let mm = 0;
        const mask = new Array(n);
        // check 3' end first for early exit (3' end is at the right for '+', left for '-')
        for (let q = 0; q < n; q++) {
          const i = strand === '+' ? n - 1 - q : q;
          const ok = matchesBase(probe[i], T[p + i]);
          mask[i] = ok;
          if (!ok && ++mm > maxMm) break;
        }
        if (mm > maxMm) continue;
        const pmask = strand === '+' ? mask : mask.slice().reverse();
        const th = thermo(P, cond, pmask);
        const mismatchPositions = [];
        let end3Mismatches = 0;
        for (let i = 0; i < n; i++) if (!pmask[i]) { mismatchPositions.push(i + 1); if (i >= n - 5) end3Mismatches++; }
        sites.push({
          strand, start: p + 1, end: p + n, length: n, mismatches: mm, mismatchPositions, end3Mismatches,
          end3Match: !!pmask[n - 1], tm: isNaN(th.tm) ? null : round(th.tm, 1), dG: isNaN(th.dG) ? null : round(th.dG),
          templateSeq: T.slice(p, p + n), probe, mask: pmask
        });
        if (sites.length >= limit) return;
      }
    };
    scan(P, '+');
    if (sites.length < limit) scan(revcomp(P), '-');
    sites.sort((x, y) => x.mismatches - y.mismatches || (y.tm || -999) - (x.tm || -999) || x.start - y.start);
    return sites;
  }

  /** Predict PCR products from binding sites of one or more primers. */
  function predictAmplicons(template, primerSites, opts) {
    opts = opts || {};
    const maxSize = opts.maxSize || 5000;
    const T = cleanSeq(template);
    const fw = [], rv = [];
    for (const ps of primerSites) for (const s of ps.sites) (s.strand === '+' ? fw : rv).push({ primer: ps.primer, site: s });
    const products = [];
    for (const f of fw) for (const r of rv) {
      if (r.site.start <= f.site.start || r.site.end <= f.site.end) continue;
      const size = r.site.end - f.site.start + 1;
      if (size > maxSize) continue;
      products.push({
        forward: f.primer, forwardSite: f.site, reverse: r.primer, reverseSite: r.site,
        start: f.site.start, end: r.site.end, size,
        mismatches: f.site.mismatches + r.site.mismatches,
        perfect: f.site.mismatches === 0 && r.site.mismatches === 0,
        end3ok: f.site.end3Match && r.site.end3Match,
        seq: T.slice(f.site.start - 1, r.site.end)
      });
    }
    products.sort((a, b) => a.mismatches - b.mismatches || a.size - b.size);
    return products;
  }

  // -------------------------------------------------------------------- design
  const DESIGN_DEFAULTS = {
    productMin: 100, productMax: 1000,
    lenMin: 18, lenOpt: 20, lenMax: 27,
    tmMin: 57, tmOpt: 60, tmMax: 63, maxTmDiff: 5,
    gcMin: 30, gcMax: 70,
    maxPolyX: 4, maxDinuc: 4, gcClamp: true, maxGcEnd: 3,
    maxSelfDG: -8, maxHairpinDG: -3, maxPairDG: -8, maxEnd3DG: -9,
    uniqueEnd: true, numReturn: 10, candidateCap: 200,
    targetStart: null, targetEnd: null
  };

  function penaltyOf(c, P) {
    let pen = Math.abs(c.tm - P.tmOpt) * 1.0 + Math.abs(c.length - P.lenOpt) * 0.5;
    pen += Math.max(0, Math.abs(c.gc - 50) - 10) * 0.05;
    pen += Math.max(0, -3 - c.selfDG) * 0.3;
    pen += Math.max(0, -2 - c.hairpinDG) * 0.3;
    if (c.selfEnd3 && c.selfEnd3.stemDG < -3) pen += 1.0;
    if (c.gcEnd > 3) pen += 1.0;
    if (c.gcEnd === 0) pen += 0.5;
    return pen;
  }

  function evaluateCandidate(seq, P, cond) {
    if (!/^[ACGT]+$/.test(seq)) return null;
    if (maxHomopolymer(seq) > P.maxPolyX) return null;
    if (maxDinucRepeat(seq) > P.maxDinuc) return null;
    const gc = gcContent(seq);
    if (gc < P.gcMin || gc > P.gcMax) return null;
    const gcEnd = gcLast5(seq);
    if (P.gcClamp && gcEnd < 1) return null;
    if (gcEnd > P.maxGcEnd) return null;
    const th = thermo(seq, cond);
    if (th.tm < P.tmMin || th.tm > P.tmMax) return null;
    const end3 = thermo(seq.slice(-5), cond).dG;
    if (end3 < P.maxEnd3DG) return null;
    const hp = hairpin(seq, cond);
    if (hp.dG < P.maxHairpinDG) return null;
    const sd = dimer(seq, seq, cond);
    if (sd.dG < P.maxSelfDG) return null;
    if (sd.end3 && sd.end3.stemDG < P.maxSelfDG / 2) return null;
    if (sd.end3Full && sd.end3Full.dG < P.maxSelfDG * 0.75) return null;
    const c = { seq, length: seq.length, tm: th.tm, gc, gcEnd, selfDG: sd.dG, selfEnd3: sd.end3, selfDimer: sd, hairpinDG: hp.dG, hairpin: hp, end3Stability: end3 };
    c.penalty = penaltyOf(c, P);
    return c;
  }

  function countOccurrences(hay, needle) {
    let n = 0, idx = 0;
    while ((idx = hay.indexOf(needle, idx)) !== -1) { n++; idx++; if (n > 1) break; }
    return n;
  }

  /** Design primer pairs for a template. Coordinates in results are 1-based inclusive. */
  function designPrimers(template, params, progress) {
    const P = Object.assign({}, DESIGN_DEFAULTS, params || {});
    const cond = withCond(P.cond);
    const T = cleanSeq(template), L = T.length, RC = revcomp(T);
    const warnings = [];
    if (L < P.productMin) return { pairs: [], warnings: ['Template shorter than the minimum product size.'], stats: {} };
    let t0 = P.targetStart ? P.targetStart - 1 : null, t1 = P.targetEnd ? P.targetEnd - 1 : null;
    if ((t0 !== null && t1 === null) || (t0 === null && t1 !== null)) { t0 = t1 = null; warnings.push('Target region needs both start and end; ignored.'); }
    if (t0 !== null && (t0 < 0 || t1 >= L || t1 < t0)) { t0 = t1 = null; warnings.push('Target region is outside the template; ignored.'); }
    const hasTarget = t0 !== null;
    // left primers: start positions
    const leftStartMin = hasTarget ? Math.max(0, t1 - P.productMax + 1) : 0;
    const leftStartMax = hasTarget ? t0 - P.lenMin : L - P.productMin;
    const lefts = [];
    let examined = 0;
    for (let s = leftStartMin; s <= leftStartMax; s++) {
      for (let len = P.lenMin; len <= P.lenMax; len++) {
        const e = s + len - 1;
        if (e >= L) break;
        if (hasTarget && e >= t0) break;
        examined++;
        const c = evaluateCandidate(T.slice(s, s + len), P, cond);
        if (c) { c.start = s + 1; c.end = e + 1; c.strand = '+'; lefts.push(c); }
      }
      if (progress && s % 500 === 0) progress('left', s - leftStartMin, leftStartMax - leftStartMin + 1);
    }
    // right primers on the reverse complement; rc index r ↔ template index L-1-r
    const rights = [];
    const rightEndMin = hasTarget ? t1 + P.lenMin : P.productMin - 1; // template end coordinate (0-based) of right primer
    const rightEndMax = hasTarget ? Math.min(L - 1, t0 + P.productMax - 1) : L - 1;
    for (let e = rightEndMin; e <= rightEndMax; e++) {
      for (let len = P.lenMin; len <= P.lenMax; len++) {
        const s = e - len + 1;
        if (s < 0) break;
        if (hasTarget && s <= t1) break;
        examined++;
        const rcStart = L - 1 - e;
        const c = evaluateCandidate(RC.slice(rcStart, rcStart + len), P, cond);
        if (c) { c.start = s + 1; c.end = e + 1; c.strand = '-'; rights.push(c); }
      }
      if (progress && e % 500 === 0) progress('right', e - rightEndMin, rightEndMax - rightEndMin + 1);
    }
    lefts.sort((a, b) => a.penalty - b.penalty);
    rights.sort((a, b) => a.penalty - b.penalty);
    // uniqueness of the 3' end (12-mer) on either strand
    const uniq = arr => {
      if (!P.uniqueEnd) return arr.slice(0, P.candidateCap);
      const out = [];
      for (const c of arr) {
        const tail = c.seq.slice(-12);
        if (countOccurrences(T, tail) + countOccurrences(RC, tail) > 1) continue;
        out.push(c);
        if (out.length >= P.candidateCap) break;
      }
      return out;
    };
    const L1 = uniq(lefts), R1 = uniq(rights);
    // pairing
    const pairs = [];
    const memo = new Map();
    for (const l of L1) {
      for (const r of R1) {
        const size = r.end - l.start + 1;
        if (size < P.productMin || size > P.productMax) continue;
        if (r.start <= l.end) continue;
        const tmDiff = Math.abs(l.tm - r.tm);
        if (tmDiff > P.maxTmDiff) continue;
        const key = l.seq + '|' + r.seq;
        let cd = memo.get(key);
        if (!cd) { cd = dimer(l.seq, r.seq, cond); memo.set(key, cd); }
        if (cd.dG < P.maxPairDG) continue;
        if (cd.end3 && cd.end3.stemDG < P.maxPairDG / 2) continue;
        if (cd.end3Full && cd.end3Full.dG < P.maxPairDG * 0.75) continue;
        let pen = l.penalty + r.penalty + tmDiff * 1.0 + Math.max(0, -4 - cd.dG) * 0.5;
        if (cd.end3 && cd.end3.stemDG < -3) pen += 2.0;
        pairs.push({ left: l, right: r, size, tmDiff, pairDimer: cd, penalty: pen });
      }
    }
    pairs.sort((a, b) => a.penalty - b.penalty);
    // diversify: avoid returning the same 3' ends repeatedly
    const chosen = [], seen = new Set();
    for (const p of pairs) {
      const k1 = 'L' + p.left.end, k2 = 'R' + p.right.start;
      if (seen.has(k1) && seen.has(k2)) continue;
      seen.add(k1); seen.add(k2);
      chosen.push(p);
      if (chosen.length >= P.numReturn) break;
    }
    const fmt = c => ({
      seq: c.seq, start: c.start, end: c.end, length: c.length, strand: c.strand,
      tm: round(c.tm, 1), gc: round(c.gc, 1), selfDimerDG: round(c.selfDG), selfDimer: c.selfDimer,
      hairpinDG: round(c.hairpinDG), hairpin: c.hairpin, end3Stability: round(c.end3Stability), gcEnd: c.gcEnd, penalty: round(c.penalty, 2)
    });
    const out = chosen.map((p, i) => ({
      rank: i + 1,
      left: fmt(p.left), right: fmt(p.right),
      product: { size: p.size, start: p.left.start, end: p.right.end, seq: T.slice(p.left.start - 1, p.right.end), gc: round(gcContent(T.slice(p.left.start - 1, p.right.end)), 1) },
      tmDiff: round(p.tmDiff, 1), pairDimerDG: p.pairDimer.dG, pairDimer: p.pairDimer, penalty: round(p.penalty, 2)
    }));
    if (!out.length) {
      if (!lefts.length) warnings.push('No acceptable forward primers — relax Tm/GC/length limits or the target region.');
      if (!rights.length) warnings.push('No acceptable reverse primers — relax Tm/GC/length limits or the target region.');
      if (lefts.length && rights.length) warnings.push('Forward and reverse candidates exist but no pair fits the product size / Tm difference / dimer limits.');
    }
    return { pairs: out, warnings, stats: { examined, leftCandidates: lefts.length, rightCandidates: rights.length, leftUsed: L1.length, rightUsed: R1.length, pairsEvaluated: pairs.length, templateLength: L, target: hasTarget ? { start: t0 + 1, end: t1 + 1 } : null } };
  }

  // ----------------------------------------------------------------- multiplex
  const MULTIPLEX_DEFAULTS = { warnDG: -6, failDG: -9, end3DG: -5, hairpinDG: -3, tmSpreadWarn: 5 };

  /** Pairwise dimer analysis of a primer set (multiplex compatibility). */
  function analyzeMultiplex(primers, opts) {
    const O = Object.assign({}, MULTIPLEX_DEFAULTS, opts || {});
    const cond = withCond(O.cond);
    const n = primers.length;
    const info = primers.map(p => {
      const a = analyzePrimer(p.seq, cond);
      return Object.assign({ name: p.name }, a);
    });
    const matrix = [], end3Matrix = [], interactions = [];
    for (let i = 0; i < n; i++) { matrix.push(new Array(n).fill(0)); end3Matrix.push(new Array(n).fill(false)); }
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        const d = i === j ? info[i].selfDimer : dimer(primers[i].seq, primers[j].seq, cond);
        matrix[i][j] = matrix[j][i] = d.dG;
        const e3Stem = d.end3 ? d.end3.stemDG : null;
        const e3Full = d.end3Full ? d.end3Full.dG : null;
        const e3 = !!((e3Stem !== null && e3Stem <= O.end3DG) || (e3Full !== null && e3Full <= O.warnDG));
        end3Matrix[i][j] = end3Matrix[j][i] = e3;
        let severity = 'ok';
        if (d.dG <= O.failDG || (e3 && (e3Stem <= O.failDG / 1.5 || e3Full <= O.failDG))) severity = 'fail';
        else if (d.dG <= O.warnDG || e3) severity = 'warn';
        if (severity !== 'ok') {
          const e3Struct = e3 && e3Stem <= O.end3DG ? d.end3 : d.end3Full;
          interactions.push({ i, j, a: primers[i].name, b: primers[j].name, type: i === j ? 'self-dimer' : 'cross-dimer', dG: d.dG, bp: d.bp, end3: e3, end3StemDG: e3Stem, end3DG: e3Struct ? e3Struct.dG : null, depiction: d.best ? d.best.depiction : '', end3Depiction: e3Struct ? e3Struct.depiction : '', severity });
        }
      }
    }
    interactions.sort((x, y) => (x.severity === y.severity ? x.dG - y.dG : x.severity === 'fail' ? -1 : 1));
    // per-primer issue counts ("how many times" each primer forms a problematic dimer)
    for (let i = 0; i < n; i++) {
      const partners = interactions.filter(x => x.i === i || x.j === i);
      info[i].dimerCount = partners.length;
      info[i].dimerPartners = partners.map(x => (x.i === i ? x.b : x.a));
      info[i].worstDG = partners.length ? Math.min(...partners.map(x => x.dG)) : 0;
      info[i].flags = [];
      if (info[i].hairpin.dG <= O.hairpinDG) info[i].flags.push('hairpin');
      if (info[i].selfDimer.dG <= O.warnDG) info[i].flags.push('self-dimer');
      if (end3Matrix[i][i]) info[i].flags.push("3'-self-dimer");
    }
    const tms = info.map(x => x.tm).filter(x => !isNaN(x));
    const tm = tms.length ? { min: Math.min(...tms), max: Math.max(...tms), spread: round(Math.max(...tms) - Math.min(...tms), 1) } : { min: NaN, max: NaN, spread: NaN };
    // greedy pooling: primers with a failing or 3'-end interaction go to different pools
    const conflict = (i, j) => i !== j && interactions.some(x => ((x.i === i && x.j === j) || (x.i === j && x.j === i)) && (x.severity === 'fail' || x.end3));
    const order = info.map((x, i) => i).sort((a, b) => info[b].dimerCount - info[a].dimerCount);
    const pools = [];
    for (const i of order) {
      let placed = false;
      for (const pool of pools) { if (!pool.some(j => conflict(i, j))) { pool.push(i); placed = true; break; } }
      if (!placed) pools.push([i]);
    }
    pools.forEach(p => p.sort((a, b) => a - b));
    const fails = interactions.filter(x => x.severity === 'fail').length;
    const warns = interactions.filter(x => x.severity === 'warn').length;
    const summary = {
      primers: n, fails, warns, tmSpread: tm.spread, tmSpreadOk: !(tm.spread > O.tmSpreadWarn),
      verdict: fails ? 'incompatible' : warns || tm.spread > O.tmSpreadWarn ? 'caution' : 'compatible',
      poolsNeeded: pools.length
    };
    return { primers: info, matrix, end3Matrix, interactions, tm, pools, summary, thresholds: O };
  }

  // ----------------------------------------------------------------- organisms
  const ORGANISMS = [
    { id: 'none', name: 'Not specified', gc: [30, 70] },
    { id: 'human', name: 'Homo sapiens (human)', taxid: 9606, gc: [35, 65] },
    { id: 'mouse', name: 'Mus musculus (mouse)', taxid: 10090, gc: [35, 65] },
    { id: 'rat', name: 'Rattus norvegicus (rat)', taxid: 10116, gc: [35, 65] },
    { id: 'zebrafish', name: 'Danio rerio (zebrafish)', taxid: 7955, gc: [30, 60] },
    { id: 'drosophila', name: 'Drosophila melanogaster (fruit fly)', taxid: 7227, gc: [35, 65] },
    { id: 'celegans', name: 'Caenorhabditis elegans', taxid: 6239, gc: [30, 60] },
    { id: 'arabidopsis', name: 'Arabidopsis thaliana', taxid: 3702, gc: [30, 60] },
    { id: 'rice', name: 'Oryza sativa (rice)', taxid: 4530, gc: [35, 70] },
    { id: 'yeast', name: 'Saccharomyces cerevisiae (yeast)', taxid: 4932, gc: [30, 60] },
    { id: 'ecoli', name: 'Escherichia coli', taxid: 562, gc: [40, 65] },
    { id: 'bsubtilis', name: 'Bacillus subtilis', taxid: 1423, gc: [35, 60] },
    { id: 'saureus', name: 'Staphylococcus aureus', taxid: 1280, gc: [25, 55] },
    { id: 'paeruginosa', name: 'Pseudomonas aeruginosa', taxid: 287, gc: [50, 75] },
    { id: 'mtb', name: 'Mycobacterium tuberculosis', taxid: 1773, gc: [50, 75] },
    { id: 'plasmodium', name: 'Plasmodium falciparum', taxid: 5833, gc: [20, 50] },
    { id: 'sarscov2', name: 'SARS-CoV-2', taxid: 2697049, gc: [30, 60] },
    { id: 'custom', name: 'Other / custom', gc: [30, 70] }
  ];

  /**
   * Screen primers against background sequence records (an organism library).
   * A site counts when ≤ maxMismatch mismatches and the last `end3Matched` 3' bases match.
   */
  function screenSpecificity(primers, records, opts) {
    opts = opts || {};
    const maxMismatch = opts.maxMismatch == null ? 2 : opts.maxMismatch;
    const end3Matched = opts.end3Matched == null ? 3 : opts.end3Matched;
    const maxSize = opts.maxSize || 4000;
    const perPrimer = primers.map(p => ({ primer: p, sites: [] }));
    const products = [];
    for (const rec of records) {
      const per = primers.map((p, i) => {
        const sites = findBindingSites(rec.seq, p.seq, { maxMismatch, cond: opts.cond, maxSites: opts.maxSites || 100 })
          .filter(s => s.mask.slice(-end3Matched).every(Boolean));
        for (const s of sites) perPrimer[i].sites.push(Object.assign({ record: rec.name }, s));
        return { primer: p, sites };
      });
      for (const a of predictAmplicons(rec.seq, per, { maxSize })) products.push(Object.assign({ record: rec.name }, a));
    }
    return { primers: perPrimer, products, records: records.length, bases: records.reduce((n, r) => n + r.seq.length, 0) };
  }

  // --------------------------------------------------------------------- misc
  function round(x, d) { if (x === null || x === undefined || isNaN(x)) return x; const m = Math.pow(10, d == null ? 2 : d); return Math.round(x * m) / m; }

  return {
    version: '1.0.0',
    DEFAULT_COND, DESIGN_DEFAULTS, MULTIPLEX_DEFAULTS,
    ORGANISMS,
    cleanSeq, revcomp, gcContent, parseTemplate, parseRecords, parsePrimerList, isComplementary, matchesBase, screenSpecificity,
    thermo, dimer, hairpin, analyzePrimer,
    findBindingSites, predictAmplicons,
    designPrimers, analyzeMultiplex,
    hairpinLoopDG, internalLoopDG, round
  };
});
