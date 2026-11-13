/* Primer Suite UI — vanilla JS, no build step. Works from file://, a static server, or Electron. */
(function () {
  'use strict';
  const E = window.PrimerEngine;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (id, def) => { const v = parseFloat($(id).value); return isNaN(v) ? def : v; };
  const f1 = x => (x == null || isNaN(x) ? '—' : Number(x).toFixed(1));
  const f2 = x => (x == null || isNaN(x) ? '—' : Number(x).toFixed(2));
  const fmtBp = n => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' Mb' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' kb' : n + ' bp');
  const fire = id => $(id).dispatchEvent(new Event('input'));
  const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#9333ea', '#ea580c'];

  const EXAMPLE_TEMPLATE = `>EGFP_expression_cassette
TTGACGGCTAGCTCAGTCCTAGGTACAGTGCTAGCATGAAAGCTTGGCATTCCGGTACTGTTGGTAAAGCCACC
ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA
GCGGCCGCTTCGAGCAGACATGATAAGATACATTGATGAGTTTGGACAAACCACAACTAGAATGCAGTGAAAAAAATGCTTTATTTGTGAAATTTGTGATGCTATTGCTTTATTTGTAACCATTATAAGCTGCAATAAACAAGTT`;
  const EXAMPLE_BINDING_PRIMERS = `EGFP_F   ATGGTGAGCAAGGGCGAGGAG
EGFP_R   TTACTTGTACAGCTCGTCCATGC
EGFP_mid GACCACATGAAGCAGCACGAC
SV40pA_R AACTTGTTTATTGCAGCTTATAATGG`;
  const EXAMPLE_MULTIPLEX = `EGFP_F    ATGGTGAGCAAGGGCGAGGAG
EGFP_R    TTACTTGTACAGCTCGTCCATGC
Actin_F   CATGTACGTTGCTATCCAGGC
Actin_R   CTCCTTAATGTCACGCACGAT
GAPDH_F   GAAGGTGAAGGTCGGAGTC
GAPDH_R   GAAGATGGTGATGGGATTTC
Bad_F     GTCGACCTGCAGGCATGCAAGCT
Bad_R     AGCTTGCATGCCTGCAGGTCGAC`;

  // ------------------------------------------------------------------ utils
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600); }
  function copyText(text, label) {
    const done = () => toast((label || 'Copied') + ' to clipboard');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } ta.remove(); }
  function download(name, content, type) {
    const blob = new Blob([content], { type: type || 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csv(rows) { return rows.map(r => r.map(v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n'); }
  function showModal(title, html) { $('modal-title').textContent = title; $('modal-body').innerHTML = html; $('modal').hidden = false; }
  $('modal-close').onclick = () => ($('modal').hidden = true);
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('modal').hidden = true; });
  function badgeDG(dg, warn, fail) { const cls = dg <= fail ? 'bad' : dg <= warn ? 'warn' : 'ok'; return `<span class="badge ${cls}">${f2(dg)}</span>`; }
  function busy(btnId, statusId, msg, fn) {
    const b = $(btnId), s = $(statusId); b.disabled = true; s.textContent = msg;
    setTimeout(() => {
      const t0 = performance.now();
      try { fn(); s.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(2)} s`; }
      catch (err) { console.error(err); s.textContent = 'Error: ' + err.message; }
      b.disabled = false;
    }, 30);
  }
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

  // ---------------------------------------------------------------- files
  function readFiles(fileList) {
    return Promise.all(Array.from(fileList).map(f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ name: f.name, text: r.result }); r.onerror = () => rej(r.error); r.readAsText(f); })));
  }
  /** Normalise any supported file into text the textareas understand (GenBank → FASTA). */
  function fileToTemplateText(file) {
    const recs = E.parseRecords(file.text);
    if (!recs.length) return '';
    if (/^LOCUS\s/m.test(file.text)) return recs.map(r => `>${r.name}${r.description ? ' ' + r.description : ''}\n${r.seq}`).join('\n');
    return file.text;
  }
  function fileToPrimerText(file) {
    const recs = E.parseRecords(file.text);
    if (/^LOCUS\s/m.test(file.text) || (file.text.indexOf('>') >= 0)) return recs.map(r => `${r.name.split(/\s+/)[0]}\t${r.seq}`).join('\n');
    return file.text; // name seq / csv / tsv lines are parsed by parsePrimerList
  }
  function hookFile(btnId, inputId, handler) {
    $(btnId).onclick = () => { $(inputId).value = ''; $(inputId).click(); };
    $(inputId).addEventListener('change', async () => { if (!$(inputId).files.length) return; try { handler(await readFiles($(inputId).files)); } catch (e) { toast('Could not read file: ' + e.message); } });
  }
  hookFile('d-open', 'd-file', files => { $('d-template').value = fileToTemplateText(files[0]); fire('d-template'); toast(`Loaded ${files[0].name}`); });
  hookFile('b-open', 'b-file', files => { $('b-template').value = files.map(fileToTemplateText).join('\n'); fire('b-template'); toast(`Loaded ${files.map(f => f.name).join(', ')}`); });
  hookFile('b-popen', 'b-pfile', files => { const cur = $('b-primers').value.trim(); $('b-primers').value = (cur ? cur + '\n' : '') + files.map(fileToPrimerText).join('\n'); fire('b-primers'); });
  hookFile('m-popen', 'm-pfile', files => { const n = mAppendText(files.map(fileToPrimerText).join('\n')); toast(`${n} primer${n === 1 ? '' : 's'} added from file`); });

  // NCBI fetch (online only)
  async function fetchAccession(accId, taId, btnId) {
    const acc = $(accId).value.trim();
    if (!acc) { toast('Enter an accession number'); return; }
    const b = $(btnId); b.disabled = true; b.textContent = 'Fetching…';
    try {
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${encodeURIComponent(acc)}&rettype=fasta&retmode=text`;
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      if (!text.startsWith('>')) throw new Error('no FASTA record returned (check the accession)');
      $(taId).value = text.trim(); fire(taId); toast('Sequence loaded from NCBI');
    } catch (e) { toast('NCBI fetch failed: ' + e.message + (navigator.onLine === false ? ' (offline)' : '')); }
    b.disabled = false; b.textContent = 'Fetch from NCBI';
  }
  $('d-fetch').onclick = () => fetchAccession('d-acc', 'd-template', 'd-fetch');
  $('b-fetch').onclick = () => fetchAccession('b-acc', 'b-template', 'b-fetch');
  $('d-acc').addEventListener('keydown', e => { if (e.key === 'Enter') $('d-fetch').click(); });
  $('b-acc').addEventListener('keydown', e => { if (e.key === 'Enter') $('b-fetch').click(); });

  // --------------------------------------------------------------- settings
  const COND_KEYS = { na: 's-na', mg: 's-mg', dntp: 's-dntp', oligo: 's-oligo', temp: 's-temp' };
  function loadCond() {
    let c = Object.assign({}, E.DEFAULT_COND);
    try { const s = lsGet('ps.cond'); if (s) c = Object.assign(c, JSON.parse(s)); } catch (e) { /* ignore */ }
    for (const k in COND_KEYS) $(COND_KEYS[k]).value = c[k];
    return c;
  }
  function currentCond() { const c = {}; for (const k in COND_KEYS) c[k] = num(COND_KEYS[k], E.DEFAULT_COND[k]); return c; }
  $('s-save').onclick = () => { lsSet('ps.cond', JSON.stringify(currentCond())); $('s-status').textContent = 'Saved'; toast('Conditions saved'); };
  $('s-reset').onclick = () => { try { localStorage.removeItem('ps.cond'); } catch (e) { /* ignore */ } loadCond(); $('s-status').textContent = 'Defaults restored'; };
  loadCond();

  // ------------------------------------------------------------------- tabs
  function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    lsSet('ps.tab', name);
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab-btn').forEach(b => (b.onclick = () => showTab(b.dataset.tab)));

  // ------------------------------------------------------------ persistence
  const PERSIST = ['d-template', 'd-tstart', 'd-tend', 'd-num', 'd-pmin', 'd-pmax', 'd-tmdiff', 'd-lmin', 'd-lopt', 'd-lmax', 'd-tmin', 'd-topt', 'd-tmax', 'd-gcmin', 'd-gcmax', 'd-polyx', 'd-selfdg', 'd-hpdg', 'd-pairdg',
    'b-template', 'b-primers', 'b-mm', 'b-maxprod', 'b-maxsites', 'm-warn', 'm-fail', 'm-end3', 'm-hp', 'm-tmspread'];
  for (const id of PERSIST) {
    const el = $(id);
    const v = lsGet('ps.' + id); if (v !== null) el.value = v;
    el.addEventListener('input', () => lsSet('ps.' + id, el.value));
  }
  for (const id of ['d-clamp', 'd-unique', 'd-spec', 'b-bg']) {
    const el = $(id);
    const v = lsGet('ps.' + id); if (v !== null) el.checked = v === '1';
    el.addEventListener('change', () => lsSet('ps.' + id, el.checked ? '1' : '0'));
  }

  function templateInfo(taId, infoId) {
    const upd = () => {
      const recs = E.parseRecords($(taId).value);
      const total = recs.reduce((n, r) => n + r.seq.length, 0);
      const t = E.parseTemplate($(taId).value);
      $(infoId).textContent = recs.length > 1 ? `${recs.length} records, ${fmtBp(total)} total` : `${fmtBp(total)}` + (t.name ? ` · ${t.name}` : '') + (t.target ? ` · target ${t.target.start}–${t.target.end}` : '');
    };
    $(taId).addEventListener('input', upd); upd();
  }
  templateInfo('d-template', 'd-template-info');
  templateInfo('b-template', 'b-template-info');
  const primerCount = (taId, infoId) => { const upd = () => { const n = E.parsePrimerList($(taId).value).length; $(infoId).textContent = `${n} primer${n === 1 ? '' : 's'}`; }; $(taId).addEventListener('input', upd); upd(); };
  primerCount('b-primers', 'b-primers-info');

  $('d-example').onclick = () => { $('d-template').value = EXAMPLE_TEMPLATE; $('d-tstart').value = 300; $('d-tend').value = 500; $('d-pmin').value = 200; $('d-pmax').value = 500; ['d-template', 'd-tstart', 'd-tend', 'd-pmin', 'd-pmax'].forEach(fire); };
  $('d-clear').onclick = () => { $('d-template').value = ''; fire('d-template'); };
  $('b-example').onclick = () => { $('b-template').value = EXAMPLE_TEMPLATE; $('b-primers').value = EXAMPLE_BINDING_PRIMERS; ['b-template', 'b-primers'].forEach(fire); };
  $('b-clear').onclick = () => { $('b-template').value = ''; $('b-primers').value = ''; ['b-template', 'b-primers'].forEach(fire); };
  $('m-example').onclick = () => { mSetRows(E.parsePrimerList(EXAMPLE_MULTIPLEX)); };
  $('m-clear').onclick = () => { mSetRows([]); };

  // ============================================================= ORGANISMS
  const ORG_SELECTS = ['d-organism', 'b-organism', 's-organism'];
  let organism = lsGet('ps.organism') || 'none';
  const orgById = id => E.ORGANISMS.find(o => o.id === id) || E.ORGANISMS[0];
  for (const id of ORG_SELECTS) {
    const sel = $(id);
    sel.innerHTML = E.ORGANISMS.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
    sel.value = organism;
    sel.addEventListener('change', () => setOrganism(sel.value));
  }
  function setOrganism(id) {
    organism = id; lsSet('ps.organism', id);
    for (const s of ORG_SELECTS) $(s).value = id;
    refreshLibraryViews();
  }

  // IndexedDB-backed library of background sequences, keyed by organism
  const LIB = {
    db: null, mem: {}, // mem fallback when IndexedDB is unavailable
    open() {
      if (this.db) return Promise.resolve(this.db);
      if (!window.indexedDB) return Promise.resolve(null);
      return new Promise(res => {
        const r = indexedDB.open('primer-suite', 1);
        r.onupgradeneeded = () => { const st = r.result.createObjectStore('library', { keyPath: 'id', autoIncrement: true }); st.createIndex('organism', 'organism'); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => res(null);
      });
    },
    async all(org) {
      const db = await this.open();
      if (!db) return this.mem[org] || [];
      return new Promise(res => { const req = db.transaction('library').objectStore('library').index('organism').getAll(org); req.onsuccess = () => res(req.result); req.onerror = () => res([]); });
    },
    async add(items) {
      const db = await this.open();
      if (!db) { for (const it of items) { it.id = Date.now() + Math.random(); (this.mem[it.organism] = this.mem[it.organism] || []).push(it); } return; }
      return new Promise((res, rej) => { const tx = db.transaction('library', 'readwrite'); const st = tx.objectStore('library'); for (const it of items) st.add(it); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    },
    async remove(id, org) {
      const db = await this.open();
      if (!db) { this.mem[org] = (this.mem[org] || []).filter(x => x.id !== id); return; }
      return new Promise(res => { const tx = db.transaction('library', 'readwrite'); tx.objectStore('library').delete(id); tx.oncomplete = res; tx.onerror = res; });
    },
    async clear(org) { const items = await this.all(org); for (const it of items) await this.remove(it.id, org); }
  };
  const libCache = {};
  async function libraryFor(org) { if (!libCache[org]) libCache[org] = await LIB.all(org); return libCache[org]; }
  function invalidateLib(org) { delete libCache[org]; }

  async function refreshLibraryViews() {
    const org = orgById(organism);
    const items = await libraryFor(organism);
    const total = items.reduce((n, r) => n + r.length, 0);
    const summary = items.length ? `${items.length} background record${items.length === 1 ? '' : 's'} (${fmtBp(total)}) loaded for ${org.name}` : `No background sequences loaded for ${org.name}${organism === 'none' ? '' : ' — add FASTA/GenBank files under Settings → Organisms'}`;
    $('d-organism-info').textContent = summary + ` · typical GC ${org.gc[0]}–${org.gc[1]} %`;
    $('b-organism-info').textContent = summary;
    const list = $('s-lib-list');
    if (!items.length) { list.innerHTML = `<div class="muted">${esc(summary)}.</div>`; return; }
    const byFile = {};
    for (const it of items) (byFile[it.fileName] = byFile[it.fileName] || []).push(it);
    let html = `<div class="muted" style="margin-bottom:6px">${esc(summary)}${total > 50e6 ? ' — large library: specificity screening may take a while' : ''}</div><div class="tablewrap" style="max-height:260px"><table><thead><tr><th>File</th><th>Record</th><th class="num">Length</th><th></th></tr></thead><tbody>`;
    for (const it of items) html += `<tr><td>${esc(it.fileName)}</td><td>${esc(it.name)}</td><td class="num">${fmtBp(it.length)}</td><td><button class="btn small ghost" data-rm="${it.id}">remove</button></td></tr>`;
    html += `</tbody></table></div>`;
    list.innerHTML = html;
    list.querySelectorAll('button[data-rm]').forEach(b => (b.onclick = async () => { await LIB.remove(isNaN(+b.dataset.rm) ? b.dataset.rm : +b.dataset.rm, organism); invalidateLib(organism); refreshLibraryViews(); }));
  }
  hookFile('s-lib-add', 's-lib-file', async files => {
    const items = [];
    for (const f of files) for (const r of E.parseRecords(f.text)) items.push({ organism, fileName: f.name, name: r.name || f.name, description: r.description || '', seq: r.seq, length: r.seq.length, added: Date.now() });
    if (!items.length) { toast('No sequences found in the selected file(s)'); return; }
    try { await LIB.add(items); } catch (e) { toast('Could not store sequences: ' + e.message); return; }
    invalidateLib(organism); await refreshLibraryViews();
    toast(`Added ${items.length} record${items.length === 1 ? '' : 's'} to ${orgById(organism).name}`);
  });
  $('s-lib-clear').onclick = async () => { if (!confirm(`Remove all background sequences stored for ${orgById(organism).name}?`)) return; await LIB.clear(organism); invalidateLib(organism); refreshLibraryViews(); };
  $('d-gcapply').onclick = () => { const o = orgById(organism); $('d-gcmin').value = o.gc[0]; $('d-gcmax').value = o.gc[1]; fire('d-gcmin'); fire('d-gcmax'); toast(`GC range set to ${o.gc[0]}–${o.gc[1]} % for ${o.name}`); };
  refreshLibraryViews();

  // ------------------------------------------------- cross-feature shortcuts
  function sendToBinding(templateText, primers) {
    $('b-template').value = templateText; $('b-primers').value = primers.map(p => `${p.name}\t${p.seq}`).join('\n');
    ['b-template', 'b-primers'].forEach(fire);
    showTab('binding'); runBinding();
  }
  function addToMultiplex(primers) {
    mAddRows(primers);
    toast(`${primers.length} primer${primers.length > 1 ? 's' : ''} added to the multiplex set`);
  }

  // ================================================================ DESIGN
  function designParams() {
    const t = E.parseTemplate($('d-template').value);
    const p = {
      productMin: num('d-pmin', 100), productMax: num('d-pmax', 1000), numReturn: num('d-num', 10), maxTmDiff: num('d-tmdiff', 5),
      lenMin: num('d-lmin', 18), lenOpt: num('d-lopt', 20), lenMax: num('d-lmax', 27),
      tmMin: num('d-tmin', 57), tmOpt: num('d-topt', 60), tmMax: num('d-tmax', 63),
      gcMin: num('d-gcmin', 30), gcMax: num('d-gcmax', 70), maxPolyX: num('d-polyx', 4),
      maxSelfDG: num('d-selfdg', -8), maxHairpinDG: num('d-hpdg', -3), maxPairDG: num('d-pairdg', -8),
      gcClamp: $('d-clamp').checked, uniqueEnd: $('d-unique').checked, cond: currentCond()
    };
    const ts = parseInt($('d-tstart').value, 10), te = parseInt($('d-tend').value, 10);
    if (!isNaN(ts) && !isNaN(te)) { p.targetStart = ts; p.targetEnd = te; }
    else if (t.target) { p.targetStart = t.target.start; p.targetEnd = t.target.end; }
    return { template: t, params: p };
  }
  $('d-run').onclick = () => {
    const { template, params } = designParams();
    if (template.seq.length < 40) { toast('Please paste a template sequence'); return; }
    busy('d-run', 'd-status', 'Designing…', () => {
      const r = E.designPrimers(template.seq, params);
      renderDesign(template, params, r);
      if ($('d-spec').checked) screenDesign(r);
    });
  };
  function primerRow(label, p) {
    return `<tr><td><b>${label}</b></td><td class="seq">${p.seq}</td><td class="num">${p.start}–${p.end}</td><td class="num">${p.length}</td><td class="num">${f1(p.tm)}</td><td class="num">${f1(p.gc)}</td><td class="num">${badgeDG(p.selfDimerDG, -5, -8)}</td><td class="num">${badgeDG(p.hairpinDG, -2, -3)}</td><td class="num">${f2(p.end3Stability)}</td></tr>`;
  }
  function renderDesign(template, params, r) {
    const box = $('d-results');
    const s = r.stats;
    const org = orgById(organism);
    let html = `<div class="row between wrap"><div class="muted">Template ${s.templateLength} bp${template.records > 1 ? ' (first of ' + template.records + ' records)' : ''}${s.target ? `, target ${s.target.start}–${s.target.end}` : ''}${organism !== 'none' ? ' · ' + esc(org.name) : ''} · ${s.examined.toLocaleString()} windows examined · ${s.leftCandidates} forward / ${s.rightCandidates} reverse candidates · ${s.pairsEvaluated.toLocaleString()} pairs scored</div>
      <div class="row"><button class="btn small" id="d-csv">Export CSV</button><button class="btn small" id="d-json">Export JSON</button><button class="btn small" id="d-mpall">All pairs → multiplex check</button></div></div><div id="d-spec-status" class="muted"></div>`;
    for (const w of r.warnings) html += `<div class="warnbox">${esc(w)}</div>`;
    if (!r.pairs.length) html += `<div class="empty">No primer pairs found.</div>`;
    r.pairs.forEach((p, i) => {
      html += `<div class="card">
        <div class="head"><h3>Pair ${p.rank} <span class="badge neutral">penalty ${f2(p.penalty)}</span> <span id="spec-${i}"></span></h3>
          <div class="stats"><span>Product <b>${p.product.size} bp</b> (${p.product.start}–${p.product.end}, GC ${f1(p.product.gc)}%)</span><span>ΔTm <b>${f1(p.tmDiff)} °C</b></span><span>Pair dimer ΔG ${badgeDG(p.pairDimerDG, -5, -8)}</span>${p.pairDimer.end3 ? `<span>3′ stem ΔG ${badgeDG(p.pairDimer.end3.stemDG, -3, -5)}</span>` : ''}</div></div>
        <div class="tablewrap"><table><thead><tr><th></th><th>Sequence 5′→3′</th><th class="num">Position</th><th class="num">Len</th><th class="num">Tm °C</th><th class="num">GC %</th><th class="num">Self ΔG</th><th class="num">Hairpin ΔG</th><th class="num">3′ ΔG (5 nt)</th></tr></thead>
        <tbody>${primerRow('Forward', p.left)}${primerRow('Reverse', p.right)}</tbody></table></div>
        <div class="actions">
          <button class="btn small" data-act="product" data-i="${i}">Show product</button>
          <button class="btn small" data-act="binding" data-i="${i}">Check binding</button>
          <button class="btn small" data-act="multiplex" data-i="${i}">Add to multiplex</button>
          <button class="btn small ghost" data-act="copy" data-i="${i}">Copy primers</button>
          <button class="btn small ghost" data-act="fasta" data-i="${i}">Copy FASTA</button>
        </div>
        <div id="specd-${i}"></div>
        <details><summary>Structures</summary>
          <div class="muted">Forward self-dimer (${f2(p.left.selfDimerDG)} kcal/mol)</div><pre class="align">${esc(p.left.selfDimer.best ? p.left.selfDimer.best.depiction : 'none')}</pre>
          <div class="muted">Reverse self-dimer (${f2(p.right.selfDimerDG)} kcal/mol)</div><pre class="align">${esc(p.right.selfDimer.best ? p.right.selfDimer.best.depiction : 'none')}</pre>
          <div class="muted">Cross-dimer (${f2(p.pairDimerDG)} kcal/mol)</div><pre class="align">${esc(p.pairDimer.best ? p.pairDimer.best.depiction : 'none')}</pre>
          <div class="muted">Hairpins: forward ${f2(p.left.hairpinDG)} · reverse ${f2(p.right.hairpinDG)} kcal/mol</div>
          ${p.left.hairpin.depiction ? `<pre class="align">${esc(p.left.hairpin.depiction)}</pre>` : ''}${p.right.hairpin.depiction ? `<pre class="align">${esc(p.right.hairpin.depiction)}</pre>` : ''}
        </details></div>`;
    });
    box.innerHTML = html;
    const name = (template.name || 'template').replace(/[^\w.-]+/g, '_').slice(0, 30);
    const pairPrimers = p => [{ name: `${name}_P${p.rank}_F`, seq: p.left.seq }, { name: `${name}_P${p.rank}_R`, seq: p.right.seq }];
    box.querySelectorAll('button[data-act]').forEach(b => {
      b.onclick = () => {
        const p = r.pairs[+b.dataset.i];
        if (b.dataset.act === 'product') showProduct(p);
        else if (b.dataset.act === 'binding') sendToBinding($('d-template').value, pairPrimers(p));
        else if (b.dataset.act === 'multiplex') addToMultiplex(pairPrimers(p));
        else if (b.dataset.act === 'copy') copyText(`${p.left.seq}\n${p.right.seq}`, 'Primer pair');
        else if (b.dataset.act === 'fasta') copyText(pairPrimers(p).map(x => `>${x.name}\n${x.seq}`).join('\n'), 'FASTA');
      };
    });
    if ($('d-csv')) $('d-csv').onclick = () => {
      const rows = [['rank', 'penalty', 'product_size', 'product_start', 'product_end', 'tm_diff', 'pair_dimer_dG', 'fwd_seq', 'fwd_start', 'fwd_end', 'fwd_len', 'fwd_tm', 'fwd_gc', 'fwd_self_dG', 'fwd_hairpin_dG', 'rev_seq', 'rev_start', 'rev_end', 'rev_len', 'rev_tm', 'rev_gc', 'rev_self_dG', 'rev_hairpin_dG', 'offtarget_products', 'offtarget_sites', 'product_seq']];
      for (const p of r.pairs) rows.push([p.rank, p.penalty, p.product.size, p.product.start, p.product.end, p.tmDiff, p.pairDimerDG, p.left.seq, p.left.start, p.left.end, p.left.length, p.left.tm, p.left.gc, p.left.selfDimerDG, p.left.hairpinDG, p.right.seq, p.right.start, p.right.end, p.right.length, p.right.tm, p.right.gc, p.right.selfDimerDG, p.right.hairpinDG, p.specificity ? p.specificity.offTargetProducts : '', p.specificity ? p.specificity.sites : '', p.product.seq]);
      download(`${name}_primers.csv`, csv(rows), 'text/csv');
    };
    if ($('d-json')) $('d-json').onclick = () => download(`${name}_primers.json`, JSON.stringify({ template: template.name, organism: org.name, params, result: r }, null, 2), 'application/json');
    if ($('d-mpall')) $('d-mpall').onclick = () => { if (r.pairs.length) addToMultiplex(r.pairs.flatMap(pairPrimers)); };
  }
  /** Specificity screening of design results against the organism library (runs pair by pair to keep the UI responsive). */
  async function screenDesign(r) {
    const status = $('d-spec-status');
    if (!r.pairs.length) return;
    const lib = await libraryFor(organism);
    if (!lib.length) { status.textContent = organism === 'none' ? 'Specificity screening skipped: no organism selected.' : `Specificity screening skipped: no background sequences loaded for ${orgById(organism).name} (Settings → Organisms).`; return; }
    const cond = currentCond();
    const records = lib.map(x => ({ name: x.name, seq: x.seq }));
    const total = records.reduce((n, x) => n + x.seq.length, 0);
    let i = 0;
    const step = () => {
      if (i >= r.pairs.length) { status.textContent = `Specificity screened against ${records.length} background record${records.length === 1 ? '' : 's'} (${fmtBp(total)}) of ${orgById(organism).name}: ≤ 2 mismatches, 3′ last 3 nt matched, products ≤ 4 kb.`; return; }
      status.textContent = `Screening pair ${i + 1} of ${r.pairs.length} against ${fmtBp(total)} of background sequence…`;
      const p = r.pairs[i];
      const sc = E.screenSpecificity([{ name: 'F', seq: p.left.seq }, { name: 'R', seq: p.right.seq }], records, { cond, maxMismatch: 2, end3Matched: 3, maxSize: 4000 });
      const intended = sc.products.filter(x => x.seq === p.product.seq).length;
      const off = sc.products.length - intended;
      const sites = sc.primers.reduce((n, x) => n + x.sites.length, 0);
      p.specificity = { offTargetProducts: off, intendedProducts: intended, sites, products: sc.products, primerSites: sc.primers };
      const cls = off > 0 ? 'bad' : sites > 2 ? 'warn' : 'ok';
      const label = off > 0 ? `${off} off-target product${off > 1 ? 's' : ''}` : sites ? `${sites} background site${sites > 1 ? 's' : ''}, no off-target product` : 'no background hits';
      $('spec-' + i).innerHTML = `<span class="badge ${cls}" title="Background screening: ${intended} intended, ${off} off-target products; ${sites} binding sites">${label}</span>`;
      if (sites || sc.products.length) {
        let d = `<details><summary>Background hits (${sites} sites, ${sc.products.length} products)</summary>`;
        if (sc.products.length) {
          d += `<div class="tablewrap" style="max-height:220px"><table><thead><tr><th>Record</th><th>Primers</th><th class="num">Start</th><th class="num">End</th><th class="num">Size</th><th class="num">Mismatches</th><th></th></tr></thead><tbody>`;
          for (const x of sc.products) d += `<tr><td>${esc(x.record)}</td><td>${x.forward.name}+${x.reverse.name}</td><td class="num">${x.start}</td><td class="num">${x.end}</td><td class="num">${x.size}</td><td class="num">${x.mismatches}</td><td>${x.seq === p.product.seq ? '<span class="badge ok">intended</span>' : '<span class="badge bad">off-target</span>'}</td></tr>`;
          d += `</tbody></table></div>`;
        }
        d += `<div class="tablewrap" style="max-height:220px"><table><thead><tr><th>Primer</th><th>Record</th><th>Strand</th><th class="num">Start</th><th class="num">End</th><th class="num">Mismatches</th><th>Positions</th></tr></thead><tbody>`;
        for (const pp of sc.primers) for (const s of pp.sites) d += `<tr><td>${pp.primer.name === 'F' ? 'Forward' : 'Reverse'}</td><td>${esc(s.record)}</td><td>${s.strand}</td><td class="num">${s.start}</td><td class="num">${s.end}</td><td class="num">${s.mismatches}</td><td>${s.mismatchPositions.join(', ') || '—'}</td></tr>`;
        d += `</tbody></table></div></details>`;
        $('specd-' + i).innerHTML = d;
      }
      i++;
      setTimeout(step, 0);
    };
    step();
  }
  function showProduct(p) {
    const seq = p.product.seq, L = p.left.length, R = p.right.length;
    const body = `<dl class="kv"><dt>Size</dt><dd>${p.product.size} bp</dd><dt>Coordinates</dt><dd>${p.product.start}–${p.product.end}</dd><dt>GC</dt><dd>${f1(p.product.gc)} %</dd><dt>Forward</dt><dd class="seq">${p.left.seq}</dd><dt>Reverse</dt><dd class="seq">${p.right.seq}</dd></dl>
      <div class="seqview"><span class="highlight-l">${seq.slice(0, L)}</span>${seq.slice(L, seq.length - R)}<span class="highlight-r">${seq.slice(seq.length - R)}</span></div>
      <div class="actions"><button class="btn small" id="prod-copy">Copy product sequence</button></div>`;
    showModal(`Product of pair ${p.rank}`, body);
    $('prod-copy').onclick = () => copyText(seq, 'Product sequence');
  }

  // =============================================================== BINDING
  async function runBinding() {
    let recs = E.parseRecords($('b-template').value).map((r, i) => ({ name: r.name || 'Template', seq: r.seq, background: false }));
    const primers = E.parsePrimerList($('b-primers').value);
    if (!primers.length) { toast('Please enter at least one primer'); return; }
    if ($('b-bg').checked) {
      const lib = await libraryFor(organism);
      if (!lib.length) toast(`No background sequences loaded for ${orgById(organism).name}`);
      recs = recs.concat(lib.map(x => ({ name: `${x.name} [${x.fileName}]`, seq: x.seq, background: true })));
    }
    recs = recs.filter(r => r.seq.length >= 10);
    if (!recs.length) { toast('Please paste a template sequence'); return; }
    busy('b-run', 'b-status', 'Scanning…', () => {
      const cond = currentCond();
      const opts = { maxMismatch: num('b-mm', 3), maxSites: num('b-maxsites', 200), cond };
      const infos = primers.map(p => E.analyzePrimer(p.seq, cond));
      const results = recs.map(rec => {
        const per = primers.map(p => ({ primer: p, sites: E.findBindingSites(rec.seq, p.seq, opts) }));
        return { rec, per, amps: E.predictAmplicons(rec.seq, per, { maxSize: num('b-maxprod', 5000) }) };
      });
      renderBinding(primers, infos, results);
    });
  }
  $('b-run').onclick = runBinding;

  function siteAlignment(site, primerSeq) {
    const n = site.length;
    let marks = '';
    for (let i = 0; i < n; i++) marks += (site.strand === '+' ? site.mask[i] : site.mask[n - 1 - i]) ? '|' : ' ';
    if (site.strand === '+') return `template 5'-${site.templateSeq}-3'  (${site.start}–${site.end}, + strand)\n            ${marks}\nprimer   5'-${primerSeq}-3'  (identical to top strand; anneals to bottom strand)`;
    return `template 5'-${site.templateSeq}-3'  (${site.start}–${site.end}, − strand)\n            ${marks}\nprimer   3'-${primerSeq.split('').reverse().join('')}-5'  (anneals to top strand; 3′ end at left)`;
  }
  function renderBinding(primers, infos, results) {
    const box = $('b-results');
    const multi = results.length > 1;
    const totalSites = results.reduce((n, r) => n + r.per.reduce((m, p) => m + p.sites.length, 0), 0);
    const totalAmps = results.reduce((n, r) => n + r.amps.length, 0);
    const allAmps = [];
    let html = `<div class="row between wrap"><div class="muted">${results.length} sequence${multi ? 's' : ''} (${fmtBp(results.reduce((n, r) => n + r.rec.seq.length, 0))}) · ${primers.length} primer${primers.length > 1 ? 's' : ''} · ${totalSites} binding site${totalSites === 1 ? '' : 's'} · ${totalAmps} predicted product${totalAmps === 1 ? '' : 's'}</div>
      <div class="row"><button class="btn small" id="b-csv">Export sites CSV</button><button class="btn small" id="b-mp">Primers → multiplex check</button></div></div>`;
    // primer summary
    html += `<div class="tablewrap"><table><thead><tr><th></th><th>Primer</th><th>Sequence 5′→3′</th><th class="num">Len</th><th class="num">Tm °C</th><th class="num">GC %</th><th class="num">Self-dimer ΔG</th><th class="num">Hairpin ΔG</th><th class="num">Sites</th><th class="num">Perfect sites</th></tr></thead><tbody>`;
    primers.forEach((p, pi) => {
      const sites = results.flatMap(r => r.per[pi].sites);
      html += `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${PALETTE[pi % PALETTE.length]}"></i></td><td><b>${esc(p.name)}</b></td><td class="seq">${p.seq}</td><td class="num">${infos[pi].length}</td><td class="num">${f1(infos[pi].tm)}</td><td class="num">${f1(infos[pi].gc)}</td><td class="num">${badgeDG(infos[pi].selfDimer.dG, -6, -9)}</td><td class="num">${badgeDG(infos[pi].hairpin.dG, -2, -3)}</td><td class="num">${sites.length}</td><td class="num">${sites.filter(s => s.mismatches === 0).length}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    results.forEach((res, ri) => {
      const L = res.rec.seq.length;
      html += `<div class="card"><div class="head"><h3>${esc(res.rec.name)} ${res.rec.background ? '<span class="badge neutral">background</span>' : ''}</h3><div class="stats"><span><b>${fmtBp(L)}</b></span><span><b>${res.per.reduce((n, p) => n + p.sites.length, 0)}</b> sites</span><span><b>${res.amps.length}</b> products</span></div></div>`;
      html += `<div class="map"><div class="lab" style="left:0">+ strand ▶</div><div class="axis"></div>`;
      res.per.forEach((p, pi) => {
        for (const s of p.sites) {
          const left = ((s.start - 1) / L) * 100, width = Math.max(0.3, (s.length / L) * 100);
          html += `<div class="site ${s.strand === '+' ? 'plus' : 'minus'} ${s.mismatches ? 'mm' : ''}" style="left:${left}%;width:${width}%;background:${PALETTE[pi % PALETTE.length]}" title="${esc(p.primer.name)} ${s.strand} ${s.start}–${s.end}, ${s.mismatches} mismatch(es)"></div>`;
        }
      });
      for (let k = 0; k <= 4; k++) html += `<div class="tick" style="left:${k * 25}%">${Math.round((k * L) / 4).toLocaleString()}</div>`;
      html += `</div>`;
      if (ri === 0) html += `<div class="legend">${primers.map((p, i) => `<span><i style="background:${PALETTE[i % PALETTE.length]}"></i>${esc(p.name)}</span>`).join('')}<span>upper row = + strand, lower row = − strand, faded = mismatched</span></div>`;
      if (res.amps.length) {
        html += `<h3>Predicted products</h3><div class="tablewrap"><table><thead><tr><th>Forward</th><th>Reverse</th><th class="num">Start</th><th class="num">End</th><th class="num">Size</th><th class="num">Mismatches</th><th>3′ ends</th><th>Status</th><th></th></tr></thead><tbody>`;
        res.amps.forEach(a => {
          const idx = allAmps.push({ a, rec: res.rec }) - 1;
          html += `<tr><td>${esc(a.forward.name)}</td><td>${esc(a.reverse.name)}</td><td class="num">${a.start}</td><td class="num">${a.end}</td><td class="num"><b>${a.size}</b></td><td class="num">${a.mismatches}</td><td>${a.end3ok ? '<span class="badge ok">matched</span>' : '<span class="badge warn">mismatch</span>'}</td><td>${a.perfect ? '<span class="badge ok">perfect</span>' : '<span class="badge warn">mismatched</span>'}${a.forward === a.reverse ? ' <span class="badge neutral">single-primer</span>' : ''}</td><td><button class="btn small ghost" data-amp="${idx}">View</button></td></tr>`;
        });
        html += `</tbody></table></div>`;
      } else html += `<div class="muted">No forward/reverse site combination within the size limit.</div>`;
      const nSites = res.per.reduce((n, p) => n + p.sites.length, 0);
      if (nSites) {
        html += `<details ${multi ? '' : 'open'}><summary>Binding sites (${nSites})</summary><div class="tablewrap"><table><thead><tr><th>Primer</th><th>Strand</th><th class="num">Start</th><th class="num">End</th><th class="num">Mismatches</th><th>Positions (from 5′)</th><th class="num">3′ (last 5)</th><th>3′ base</th><th class="num">Est. Tm</th><th>Alignment</th></tr></thead><tbody>`;
        res.per.forEach(p => p.sites.forEach(s => {
          html += `<tr><td><b>${esc(p.primer.name)}</b></td><td>${s.strand === '+' ? '+ (forward)' : '− (reverse)'}</td><td class="num">${s.start}</td><td class="num">${s.end}</td><td class="num">${s.mismatches === 0 ? '<span class="badge ok">0</span>' : s.mismatches}</td><td>${s.mismatchPositions.join(', ') || '—'}</td><td class="num">${s.end3Mismatches}</td><td>${s.end3Match ? '<span class="badge ok">match</span>' : '<span class="badge bad">mismatch</span>'}</td><td class="num">${f1(s.tm)}</td><td><details><summary>show</summary><pre class="align">${esc(siteAlignment(s, p.primer.seq))}</pre></details></td></tr>`;
        }));
        html += `</tbody></table></div></details>`;
      }
      html += `</div>`;
    });
    box.innerHTML = html;
    box.querySelectorAll('button[data-amp]').forEach(b => (b.onclick = () => {
      const { a, rec } = allAmps[+b.dataset.amp];
      const fl = a.forwardSite.length, rl = a.reverseSite.length, seq = a.seq;
      showModal(`${a.forward.name} × ${a.reverse.name}: ${a.size} bp`, `<dl class="kv"><dt>Sequence</dt><dd>${esc(rec.name)}</dd><dt>Coordinates</dt><dd>${a.start}–${a.end}</dd><dt>GC</dt><dd>${f1(E.gcContent(seq))} %</dd><dt>Forward site</dt><dd>${a.forwardSite.mismatches} mismatch(es), est. Tm ${f1(a.forwardSite.tm)} °C</dd><dt>Reverse site</dt><dd>${a.reverseSite.mismatches} mismatch(es), est. Tm ${f1(a.reverseSite.tm)} °C</dd></dl>
        <div class="seqview"><span class="highlight-l">${seq.slice(0, fl)}</span>${seq.slice(fl, seq.length - rl)}<span class="highlight-r">${seq.slice(seq.length - rl)}</span></div><div class="actions"><button class="btn small" id="amp-copy">Copy sequence</button></div>`);
      $('amp-copy').onclick = () => copyText(seq, 'Product sequence');
    }));
    $('b-csv').onclick = () => {
      const rows = [['sequence_record', 'primer', 'primer_sequence', 'strand', 'start', 'end', 'mismatches', 'mismatch_positions_from_5prime', 'end3_mismatches', 'end3_base_matched', 'est_tm', 'template_site']];
      for (const res of results) for (const p of res.per) for (const s of p.sites) rows.push([res.rec.name, p.primer.name, p.primer.seq, s.strand, s.start, s.end, s.mismatches, s.mismatchPositions.join(' '), s.end3Mismatches, s.end3Match, s.tm, s.templateSeq]);
      rows.push([]); rows.push(['sequence_record', 'forward', 'reverse', 'start', 'end', 'size', 'mismatches', 'perfect']);
      for (const res of results) for (const a of res.amps) rows.push([res.rec.name, a.forward.name, a.reverse.name, a.start, a.end, a.size, a.mismatches, a.perfect]);
      download('binding_sites.csv', csv(rows), 'text/csv');
    };
    $('b-mp').onclick = () => { mSetRows(primers); showTab('multiplex'); runMultiplex(); };
  }

  // ====================================================== MULTIPLEX ROWS
  // Numbered primer rows ("Primer 1", "Primer 2", …). The hidden textarea #m-primers mirrors the
  // rows in "name<TAB>sequence" form so the rest of the app keeps using parsePrimerList().
  let mRows = [];
  (function loadRows() {
    try { const j = lsGet('ps.m-rows'); if (j) mRows = JSON.parse(j).filter(r => r && typeof r.seq === 'string'); } catch (e) { mRows = []; }
    if (!mRows.length) { const txt = lsGet('ps.m-primers'); if (txt) mRows = E.parsePrimerList(txt); }
    if (!mRows.length) mRows = [{ name: 'Primer 1', seq: '' }];
  })();
  function mNextName() {
    let max = 0;
    for (const r of mRows) { const m = /^Primer\s*(\d+)$/i.exec(r.name.trim()); if (m) max = Math.max(max, +m[1]); }
    return 'Primer ' + (Math.max(max, mRows.length) + 1);
  }
  function mSync() {
    $('m-primers').value = mRows.filter(r => E.cleanSeq(r.seq).length >= 6).map(r => `${(r.name || '').trim() || 'Primer'}\t${E.cleanSeq(r.seq)}`).join('\n');
    lsSet('ps.m-rows', JSON.stringify(mRows)); lsSet('ps.m-primers', $('m-primers').value);
    const n = mRows.filter(r => E.cleanSeq(r.seq).length >= 6).length;
    $('m-primers-info').textContent = `${n} primer${n === 1 ? '' : 's'}` + (mRows.length > n ? ` (${mRows.length - n} row${mRows.length - n === 1 ? '' : 's'} without a valid sequence)` : '');
  }
  function mRender(focusIdx) {
    const box = $('m-rows');
    box.innerHTML = mRows.map((r, i) => {
      const seq = E.cleanSeq(r.seq);
      return `<div class="prow" data-i="${i}"><span class="pnum">${i + 1}</span><input class="pname" type="text" value="${esc(r.name)}" placeholder="name" spellcheck="false" title="Primer name"><input class="pseq ${r.seq && seq.length < 6 ? 'bad' : ''}" type="text" value="${esc(r.seq)}" placeholder="sequence 5′→3′" spellcheck="false" autocomplete="off"><span class="plen">${seq.length ? seq.length + ' nt' : ''}</span><button class="pdel" title="Remove this primer" aria-label="Remove">×</button></div>`;
    }).join('');
    box.querySelectorAll('.prow').forEach(row => {
      const i = +row.dataset.i;
      row.querySelector('.pname').addEventListener('input', e => { mRows[i].name = e.target.value; mSync(); });
      row.querySelector('.pseq').addEventListener('input', e => {
        mRows[i].seq = e.target.value; const seq = E.cleanSeq(mRows[i].seq);
        row.querySelector('.plen').textContent = seq.length ? seq.length + ' nt' : '';
        e.target.classList.toggle('bad', !!mRows[i].seq && seq.length < 6); mSync();
      });
      row.querySelector('.pseq').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (i === mRows.length - 1) mAddRows([{ name: mNextName(), seq: '' }], true); else mRender(i + 1); } });
      row.querySelector('.pname').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); row.querySelector('.pseq').focus(); } });
      row.querySelector('.pdel').onclick = () => { mRows.splice(i, 1); if (!mRows.length) mRows.push({ name: 'Primer 1', seq: '' }); mRender(); mSync(); };
    });
    if (focusIdx != null) { const el = box.querySelectorAll('.prow .pseq')[focusIdx]; if (el) el.focus(); }
    mSync();
  }
  function mAddRows(items, focusLast) {
    for (const it of items) mRows.push({ name: (it.name || '').trim() || mNextName(), seq: it.seq || '' });
    // drop a leading blank placeholder row when real primers arrive
    if (mRows.length > 1 && mRows[0].seq === '' && /^Primer\s*1$/i.test(mRows[0].name) && items.some(x => x.seq)) mRows.shift();
    mRender(focusLast ? mRows.length - 1 : null);
  }
  function mSetRows(items) { mRows = items.map((it, k) => ({ name: (it.name || '').trim() || 'Primer ' + (k + 1), seq: it.seq || '' })); if (!mRows.length) mRows = [{ name: 'Primer 1', seq: '' }]; mRender(); }
  function mAppendText(text) {
    const list = E.parsePrimerList(text).map(p => ({ name: /^Primer\d+$/.test(p.name) ? '' : p.name, seq: p.seq }));
    mAddRows(list); return list.length;
  }
  $('m-add').onclick = () => mAddRows([{ name: mNextName(), seq: '' }], true);
  $('m-paste').onclick = () => {
    showModal('Paste a primer list', `<p class="hint">One primer per line: <code>name sequence</code>, <code>name,sequence</code>, FASTA, or bare sequences (they get the next free number).</p><textarea id="m-paste-ta" rows="10" spellcheck="false" placeholder="EGFP_F  ATGGTGAGCAAGGGCGAGGAG&#10;EGFP_R  TTACTTGTACAGCTCGTCCATGC"></textarea><div class="actions"><button class="btn primary" id="m-paste-add">Add to list</button><button class="btn" id="m-paste-replace">Replace list</button></div>`);
    $('m-paste-add').onclick = () => { const n = mAppendText($('m-paste-ta').value); $('modal').hidden = true; toast(`${n} primer${n === 1 ? '' : 's'} added`); };
    $('m-paste-replace').onclick = () => { mSetRows(E.parsePrimerList($('m-paste-ta').value).map(p => ({ name: /^Primer\d+$/.test(p.name) ? '' : p.name, seq: p.seq }))); $('modal').hidden = true; };
    $('m-paste-ta').focus();
  };
  mRender();

  // ============================================================= MULTIPLEX
  function runMultiplex() {
    mSync();
    const primers = E.parsePrimerList($('m-primers').value);
    if (primers.length < 1) { toast('Please enter at least one primer sequence'); return; }
    if (primers.length < mRows.length) toast(`${mRows.length - primers.length} row(s) without a valid sequence skipped`);
    busy('m-run', 'm-status', 'Computing pairwise dimers…', () => {
      const r = E.analyzeMultiplex(primers, { warnDG: num('m-warn', -6), failDG: num('m-fail', -9), end3DG: num('m-end3', -5), hairpinDG: num('m-hp', -3), tmSpreadWarn: num('m-tmspread', 5), cond: currentCond() });
      renderMultiplex(primers, r);
    });
  }
  $('m-run').onclick = runMultiplex;

  function heatStyle(dg, thr) {
    const t = Math.min(1, Math.max(0, -dg / 12));
    const bg = dg <= thr.failDG ? `rgba(220,38,38,${0.35 + 0.5 * t})` : dg <= thr.warnDG ? `rgba(217,119,6,${0.3 + 0.4 * t})` : `rgba(22,163,74,${0.08 + 0.25 * t})`;
    return `background:${bg}`;
  }
  function renderMultiplex(primers, r) {
    const box = $('m-results');
    const S = r.summary, thr = r.thresholds, n = primers.length;
    const vcls = S.verdict === 'compatible' ? 'ok' : S.verdict === 'caution' ? 'warn' : 'bad';
    const vtxt = S.verdict === 'compatible' ? 'Compatible: no problematic dimers detected' : S.verdict === 'caution' ? 'Use with caution' : 'Incompatible primers detected';
    let html = `<div class="verdict ${vcls}">${vtxt}<small>${n} primers · ${S.fails} failing and ${S.warns} warning interaction${S.fails + S.warns === 1 ? '' : 's'} · Tm ${f1(r.tm.min)}–${f1(r.tm.max)} °C (spread ${f1(r.tm.spread)} °C${S.tmSpreadOk ? '' : ', exceeds limit'}) · ${S.poolsNeeded === 1 ? 'all primers can share one pool' : S.poolsNeeded + ' pools needed to separate conflicting primers'}</small></div>`;
    html += `<div class="row between wrap"><div></div><div class="row"><button class="btn small" id="m-csv">Export CSV</button><button class="btn small" id="m-json">Export JSON</button></div></div>`;
    html += `<h3>Primers</h3><div class="tablewrap"><table><thead><tr><th>Name</th><th>Sequence 5′→3′</th><th class="num">Len</th><th class="num">Tm °C</th><th class="num">GC %</th><th class="num">Hairpin ΔG</th><th class="num">Self-dimer ΔG</th><th class="num">3′ self stem ΔG</th><th class="num">Dimer events</th><th>Partners</th><th>Flags</th></tr></thead><tbody>`;
    r.primers.forEach(p => {
      const cnt = p.dimerCount;
      html += `<tr><td><b>${esc(p.name)}</b></td><td class="seq">${p.seq}</td><td class="num">${p.length}</td><td class="num">${f1(p.tm)}</td><td class="num">${f1(p.gc)}</td><td class="num">${badgeDG(p.hairpin.dG, thr.hairpinDG + 1, thr.hairpinDG)}</td><td class="num">${badgeDG(p.selfDimer.dG, thr.warnDG, thr.failDG)}</td><td class="num">${p.selfDimer.end3 ? badgeDG(p.selfDimer.end3.stemDG, thr.end3DG, thr.failDG / 1.5) : '—'}</td><td class="num">${cnt ? `<span class="badge ${p.worstDG <= thr.failDG ? 'bad' : 'warn'}">${cnt}×</span>` : '<span class="badge ok">0</span>'}</td><td>${esc(p.dimerPartners.join(', ')) || '—'}</td><td>${p.flags.map(f => `<span class="badge warn">${f}</span>`).join(' ')}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    html += `<h3>Cross-dimer ΔG matrix (kcal/mol)</h3><div class="legend"><span><i style="background:rgba(22,163,74,.25)"></i>ok</span><span><i style="background:rgba(217,119,6,.55)"></i>≤ ${thr.warnDG} warn</span><span><i style="background:rgba(220,38,38,.7)"></i>≤ ${thr.failDG} fail</span><span>³′ = 3′-end dimer (3′ stem ≤ ${thr.end3DG} or 3′-anchored structure ≤ ${thr.warnDG})</span><span>diagonal = self-dimer · click a cell for the alignment</span></div>`;
    html += `<div class="tablewrap" style="max-height:none"><table class="heat"><thead><tr><th></th>${primers.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>`;
    for (let i = 0; i < n; i++) {
      html += `<tr><th class="rowh">${esc(primers[i].name)}</th>`;
      for (let j = 0; j < n; j++) {
        const dg = r.matrix[i][j];
        html += `<td class="${r.end3Matrix[i][j] ? 'e3' : ''}" style="${heatStyle(dg, thr)}" data-cell="${i},${j}" title="${esc(primers[i].name)} × ${esc(primers[j].name)}: ${f2(dg)} kcal/mol">${f1(dg)}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    html += `<h3>Problematic interactions (${r.interactions.length})</h3>`;
    if (!r.interactions.length) html += `<div class="muted">None above the thresholds.</div>`;
    r.interactions.forEach(x => {
      html += `<div class="card"><div class="head"><h3><span class="badge ${x.severity === 'fail' ? 'bad' : 'warn'}">${x.severity}</span> ${esc(x.a)}${x.i !== x.j ? ' × ' + esc(x.b) : ' (self)'} <span class="muted">${x.type}</span></h3>
        <div class="stats"><span>ΔG <b>${f2(x.dG)}</b> kcal/mol</span><span><b>${x.bp}</b> bp paired</span>${x.end3 ? `<span class="badge bad">3′-end dimer: stem ${f2(x.end3StemDG)}, structure ${f2(x.end3DG)}</span>` : ''}</div></div>
        <pre class="align">${esc(x.depiction)}</pre>${x.end3 && x.end3Depiction && x.end3Depiction !== x.depiction ? `<div class="muted">Most stable 3′-end structure</div><pre class="align">${esc(x.end3Depiction)}</pre>` : ''}</div>`;
    });
    html += `<h3>Suggested pools</h3><p class="hint">Greedy partition so that no two primers in a pool have a failing or 3′-end interaction. Amplicon pairs are not kept together automatically; adjust to keep each forward/reverse pair in the same pool.</p><div class="pools">`;
    r.pools.forEach((pool, k) => { html += `<div class="pool"><b>Pool ${k + 1}</b>${pool.map(i => `<span>${esc(primers[i].name)}</span>`).join('')}</div>`; });
    html += `</div>`;
    box.innerHTML = html;
    box.querySelectorAll('td[data-cell]').forEach(td => (td.onclick = () => {
      const [i, j] = td.dataset.cell.split(',').map(Number);
      const d = E.dimer(primers[i].seq, primers[j].seq, currentCond());
      showModal(`${primers[i].name} × ${primers[j].name}`, `<dl class="kv"><dt>ΔG</dt><dd>${f2(d.dG)} kcal/mol (${d.bp} bp)</dd><dt>3′-end dimer</dt><dd>${d.end3 ? `3′ stem ${f2(d.end3.stemDG)} kcal/mol (${d.end3.stemBp} bp), structure ${f2(d.end3.dG)} kcal/mol` : 'none'}</dd></dl><div class="muted">Most stable structure</div><pre class="align">${esc(d.best ? d.best.depiction : 'none')}</pre>${d.end3 ? `<div class="muted">Most stable structure involving a 3′ end</div><pre class="align">${esc(d.end3.depiction)}</pre>` : ''}`);
    }));
    $('m-csv').onclick = () => {
      const rows = [['', ...primers.map(p => p.name)]];
      for (let i = 0; i < n; i++) rows.push([primers[i].name, ...r.matrix[i]]);
      rows.push([]); rows.push(['name', 'sequence', 'length', 'tm', 'gc', 'hairpin_dG', 'self_dimer_dG', 'dimer_events', 'partners', 'flags']);
      for (const p of r.primers) rows.push([p.name, p.seq, p.length, p.tm, p.gc, p.hairpin.dG, p.selfDimer.dG, p.dimerCount, p.dimerPartners.join(' '), p.flags.join(' ')]);
      rows.push([]); rows.push(['primer_a', 'primer_b', 'type', 'dG', 'bp', 'end3_dimer', 'severity']);
      for (const x of r.interactions) rows.push([x.a, x.b, x.type, x.dG, x.bp, x.end3, x.severity]);
      download('multiplex_dimers.csv', csv(rows), 'text/csv');
    };
    $('m-json').onclick = () => download('multiplex_dimers.json', JSON.stringify(r, null, 2), 'application/json');
  }

  // ========================================================== QUICK CHECK
  $('s-quick-run').onclick = () => {
    const seq = E.cleanSeq($('s-quick').value);
    if (seq.length < 6) { toast('Enter a primer sequence'); return; }
    const a = E.analyzePrimer(seq, currentCond());
    $('s-quick-out').innerHTML = `<dl class="kv"><dt>Sequence</dt><dd class="seq">${a.seq}</dd><dt>Length</dt><dd>${a.length} nt</dd><dt>Tm</dt><dd>${f1(a.tm)} °C</dd><dt>GC</dt><dd>${f1(a.gc)} %</dd><dt>Duplex ΔG</dt><dd>${f2(a.dG)} kcal/mol</dd><dt>Self-dimer</dt><dd>${f2(a.selfDimer.dG)} kcal/mol${a.selfDimer.end3 ? ` (3′ stem: ${f2(a.selfDimer.end3.stemDG)})` : ''}</dd><dt>Hairpin</dt><dd>${f2(a.hairpin.dG)} kcal/mol (${a.hairpin.bp} bp stem, ${a.hairpin.loop} nt loop)</dd><dt>3′ stability</dt><dd>${f2(a.end3Stability)} kcal/mol (last 5 nt)</dd><dt>Longest homopolymer</dt><dd>${a.homopolymer}</dd><dt>Reverse complement</dt><dd class="seq">${E.revcomp(a.seq)}</dd></dl>
      ${a.selfDimer.best ? `<div class="muted">Self-dimer</div><pre class="align">${esc(a.selfDimer.best.depiction)}</pre>` : ''}${a.hairpin.depiction ? `<div class="muted">Hairpin ${a.hairpin.dotBracket}</div><pre class="align">${esc(a.hairpin.depiction)}</pre>` : ''}`;
  };
  $('s-quick').addEventListener('keydown', e => { if (e.key === 'Enter') $('s-quick-run').click(); });

  // ------------------------------------------------------------------ init
  $('mode-indicator').textContent = /Electron/i.test(navigator.userAgent) ? 'Desktop (offline) · engine v' + E.version : (location.protocol === 'file:' ? 'Local file · engine v' : 'Web · engine v') + E.version;
  const savedTab = lsGet('ps.tab'); if (savedTab && $('tab-' + savedTab)) showTab(savedTab);
})();
