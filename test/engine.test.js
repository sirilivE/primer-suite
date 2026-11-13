'use strict';
const assert = require('assert');
const E = require('../src/engine.js');
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; } }
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}±${tol}, got ${a}`);

const TEMPLATE = 'TTGACGGCTAGCTCAGTCCTAGGTACAGTGCTAGCATGAAAGCTTGGCATTCCGGTACTGTTGGTAAAGCCACCATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA';

console.log('sequence utilities');
test('cleanSeq strips noise and converts U', () => assert.strictEqual(E.cleanSeq('  ac gu-12\nTN '), 'ACGTTN'));
test('revcomp', () => assert.strictEqual(E.revcomp('ATGCRN'), 'NYGCAT'));
test('parseTemplate handles FASTA, numbers and [target]', () => {
  const t = E.parseTemplate('>gene x\n1 ACGTAC [GTTT] 10\nACGT');
  assert.strictEqual(t.name, 'gene x'); assert.strictEqual(t.seq, 'ACGTACGTTTACGT'); assert.deepStrictEqual(t.target, { start: 7, end: 10 });
});
test('parsePrimerList accepts name/seq, FASTA and bare', () => {
  const p = E.parsePrimerList('F1 ACGTACGTAC\n>R1\nTTGCATGCAA\nGGGAAACCCT\nname with spaces,ACGTTTGGCC');
  assert.deepStrictEqual(p.map(x => x.name), ['F1', 'R1', 'Primer3', 'name with spaces']);
  assert.strictEqual(p[3].seq, 'ACGTTTGGCC');
});

test('parseRecords handles GenBank and multi-FASTA', () => {
  const gb = 'LOCUS       TEST 40 bp DNA\nDEFINITION  test rec.\n  ORGANISM  Escherichia coli\nORIGIN\n        1 atggtgagca agggcgagga gctgttcacc ggggtggtgc\n//\n';
  const r = E.parseRecords(gb); assert.strictEqual(r.length, 1); assert.strictEqual(r[0].name, 'TEST'); assert.strictEqual(r[0].organism, 'Escherichia coli'); assert.strictEqual(r[0].seq.length, 40);
  assert.strictEqual(E.parseTemplate(gb).seq.length, 40);
  const m = E.parseRecords('>a\nACGT\nACGT\n>b x\nGGCC'); assert.deepStrictEqual(m.map(x => [x.name, x.seq]), [['a', 'ACGTACGT'], ['b x', 'GGCC']]);
  const t = E.parseTemplate('>a\nAC[GTAC]GT\n>b\nGGCC'); assert.strictEqual(t.seq, 'ACGTACGT'); assert.strictEqual(t.records, 2); assert.deepStrictEqual(t.target, { start: 3, end: 6 });
});
test('ORGANISMS list has GC presets', () => { assert.ok(E.ORGANISMS.length > 10); for (const o of E.ORGANISMS) assert.ok(o.id && o.name && o.gc.length === 2); });

console.log('thermodynamics');
test('Tm of M13 forward (-20) ≈ 52 °C at 50 mM Na, 250 nM', () => close(E.thermo('GTAAAACGACGGCCAGT', { na: 50, mg: 0, dntp: 0, oligo: 250 }).tm, 52, 2));
test('Tm rises with Mg2+', () => assert.ok(E.thermo('GTAAAACGACGGCCAGT', { na: 50, mg: 1.5, dntp: 0.8 }).tm > E.thermo('GTAAAACGACGGCCAGT', { na: 50, mg: 0, dntp: 0 }).tm));
test('Tm of GC-rich > AT-rich', () => assert.ok(E.thermo('GCGCGGCCGCGGCCGCGCGC').tm > E.thermo('ATATAATTAATTAATATATA').tm));
test('GC content', () => close(E.gcContent('GGCCAATT'), 50, 1e-9));

console.log('dimers and hairpins');
test('perfectly complementary oligos form a very stable dimer', () => { const d = E.dimer('AGCTTGCATGCCTGCAGGTCGAC', 'GTCGACCTGCAGGCATGCAAGCT'); assert.ok(d.dG < -20, 'dG ' + d.dG); assert.strictEqual(d.bp, 23); assert.ok(d.end3); });
test('non-complementary oligos have no dimer', () => assert.strictEqual(E.dimer('AAAAAAAAAAAAAAAAAAAA', 'CCCCCCCCCCCCCCCCCCCC').dG, 0));
test("3'-end dimer is detected with stem ΔG", () => { const d = E.dimer('ACGTTTTTTTTTTTGGCCAG', 'ACGTAAAAAAAAACTGGCC'); assert.ok(d.end3 && d.end3.dG < -4, JSON.stringify(d.end3)); assert.strictEqual(d.end3.stemBp, 6); assert.ok(d.end3.stemDG <= d.end3.dG + 0.01); });
test("4-bp 3' overlap has a weak 3' stem", () => { const d = E.dimer('ATGGTGAGCAAGGGCGAGGAG', 'TTACTTGTACAGCTCGTCCATGC'); assert.ok(d.end3 && d.end3.stemDG > -3 && d.end3.stemDG < 0, JSON.stringify(d.end3)); });
test('self-dimer of palindromic primer is strong', () => assert.ok(E.dimer('GAATTCGAATTC', 'GAATTCGAATTC').dG < -8));
test('hairpin detected with correct stem/loop', () => { const h = E.hairpin('GGGCCCAAAATGGGCCCTTTT'); assert.ok(h.dG < -4, 'dG ' + h.dG); assert.strictEqual(h.loop, 3); assert.strictEqual(h.dotBracket, '(((((((...)))))))....'); });
test('no hairpin in homopolymer', () => assert.strictEqual(E.hairpin('AAAAAAAAAAAAAAAAAAAA').dG, 0));
test('dimer handles degenerate bases', () => assert.ok(E.dimer('ACGTNNNNACGT', 'ACGTNNNNACGT').dG < 0));

console.log('binding');
test('forward primer found at exact position', () => { const s = E.findBindingSites(TEMPLATE, 'ATGGTGAGCAAGGGCGAGGAG', { maxMismatch: 0 }); assert.strictEqual(s.length, 1); assert.strictEqual(s[0].strand, '+'); assert.strictEqual(s[0].start, 75); assert.strictEqual(s[0].end, 95); });
test('reverse primer found on minus strand', () => { const s = E.findBindingSites(TEMPLATE, 'TTACTTGTACAGCTCGTCCATGC', { maxMismatch: 0 }); assert.strictEqual(s.length, 1); assert.strictEqual(s[0].strand, '-'); assert.strictEqual(s[0].end, TEMPLATE.length); });
test('mismatched primer reported with positions', () => {
  const s = E.findBindingSites(TEMPLATE, 'ATGGTGAGCAAGGGCGAGGTG', { maxMismatch: 2 }); // mismatch at position 20 (A→T)
  const hit = s.find(x => x.start === 75); assert.ok(hit); assert.strictEqual(hit.mismatches, 1); assert.deepStrictEqual(hit.mismatchPositions, [20]); assert.strictEqual(hit.end3Mismatches, 1); assert.ok(hit.end3Match);
  assert.ok(hit.tm < E.thermo('ATGGTGAGCAAGGGCGAGGAG').tm);
});
test('IUPAC primer matches', () => { const s = E.findBindingSites(TEMPLATE, 'ATGGTGAGCAAGGGNGAGGAR', { maxMismatch: 0 }); assert.strictEqual(s.length, 1); });
test('amplicon prediction gives the correct product', () => {
  const F = { name: 'F', seq: 'ATGGTGAGCAAGGGCGAGGAG' }, R = { name: 'R', seq: 'TTACTTGTACAGCTCGTCCATGC' };
  const per = [F, R].map(p => ({ primer: p, sites: E.findBindingSites(TEMPLATE, p.seq, { maxMismatch: 0 }) }));
  const amps = E.predictAmplicons(TEMPLATE, per, { maxSize: 5000 });
  assert.strictEqual(amps.length, 1); assert.strictEqual(amps[0].size, 720); assert.ok(amps[0].seq.startsWith(F.seq)); assert.ok(amps[0].seq.endsWith(E.revcomp(R.seq))); assert.ok(amps[0].perfect);
});

test('screenSpecificity finds off-target sites and products', () => {
  const F = { name: 'F', seq: 'ATGGTGAGCAAGGGCGAGGAG' }, R = { name: 'R', seq: 'TTACTTGTACAGCTCGTCCATGC' };
  const recs = [{ name: 'genome', seq: 'TTTT'.repeat(10) + TEMPLATE + 'AAAA'.repeat(10) }, { name: 'offtarget', seq: 'CCCC' + F.seq + 'GGGG'.repeat(20) + E.revcomp(R.seq) + 'CCCC' }, { name: 'clean', seq: 'ACGT'.repeat(100) }];
  const r = E.screenSpecificity([F, R], recs, { maxMismatch: 2, end3Matched: 3, maxSize: 4000 });
  assert.strictEqual(r.records, 3);
  assert.strictEqual(r.products.length, 2);
  assert.ok(r.products.some(p => p.record === 'genome' && p.size === 720));
  assert.ok(r.products.some(p => p.record === 'offtarget' && p.size === 21 + 80 + 23));
  assert.strictEqual(r.primers[0].sites.length, 2); assert.strictEqual(r.primers[1].sites.length, 2);
});

console.log('design');
test('designPrimers returns valid pairs around a target', () => {
  const r = E.designPrimers(TEMPLATE, { productMin: 150, productMax: 400, targetStart: 300, targetEnd: 400, numReturn: 5 });
  assert.ok(r.pairs.length > 0, 'no pairs: ' + r.warnings.join(' '));
  for (const p of r.pairs) {
    assert.ok(p.product.size >= 150 && p.product.size <= 400);
    assert.ok(p.left.end < 300 && p.right.start > 400, 'pair must flank target');
    assert.ok(p.product.seq.startsWith(p.left.seq) && p.product.seq.endsWith(E.revcomp(p.right.seq)));
    assert.strictEqual(p.product.seq.length, p.product.size);
    assert.ok(p.left.tm >= 57 && p.left.tm <= 63 && p.right.tm >= 57 && p.right.tm <= 63);
    assert.ok(Math.abs(p.left.tm - p.right.tm) <= 5);
    assert.ok(p.pairDimerDG >= -8);
    assert.ok(E.findBindingSites(TEMPLATE, p.left.seq, { maxMismatch: 0 }).length === 1);
    assert.ok(E.findBindingSites(TEMPLATE, p.right.seq, { maxMismatch: 0 }).length === 1);
  }
});
test('designPrimers works without a target', () => { const r = E.designPrimers(TEMPLATE.slice(0, 400), { productMin: 100, productMax: 300, numReturn: 3 }); assert.ok(r.pairs.length > 0); });
test('designPrimers warns on impossible constraints', () => { const r = E.designPrimers(TEMPLATE, { tmMin: 90, tmMax: 95 }); assert.strictEqual(r.pairs.length, 0); assert.ok(r.warnings.length > 0); });

console.log('multiplex');
test('analyzeMultiplex flags complementary pair, counts events and builds pools', () => {
  const r = E.analyzeMultiplex([
    { name: 'F1', seq: 'ATGGTGAGCAAGGGCGAGGAG' }, { name: 'R1', seq: 'TTACTTGTACAGCTCGTCCATGC' },
    { name: 'BadF', seq: 'GTCGACCTGCAGGCATGCAAGCT' }, { name: 'BadR', seq: 'AGCTTGCATGCCTGCAGGTCGAC' }
  ]);
  assert.strictEqual(r.summary.verdict, 'incompatible');
  const bad = r.interactions.find(x => x.a === 'BadF' && x.b === 'BadR'); assert.ok(bad && bad.severity === 'fail' && bad.end3);
  assert.ok(r.primers[2].dimerCount >= 1 && r.primers[2].dimerPartners.includes('BadR'));
  assert.strictEqual(r.matrix[2][3], r.matrix[3][2]);
  for (const pool of r.pools) assert.ok(!(pool.includes(2) && pool.includes(3)), 'BadF and BadR must be in different pools');
  assert.strictEqual(r.pools.flat().length, 4);
});
test('analyzeMultiplex passes a clean set', () => {
  const r = E.analyzeMultiplex([{ name: 'A', seq: 'CTTCTTCTCTTCTCTTCTTCC' }, { name: 'B', seq: 'TCTTCTCTCTTCCTTCTTCTC' }]);
  assert.strictEqual(r.summary.verdict, 'compatible'); assert.strictEqual(r.interactions.length, 0); assert.strictEqual(r.pools.length, 1);
  const r2 = E.analyzeMultiplex([{ name: 'A', seq: 'ATGGTGAGCAAGGGCGAGGAG' }, { name: 'B', seq: 'TTACTTGTACAGCTCGTCCATGC' }]);
  assert.strictEqual(r2.summary.fails, 0); assert.strictEqual(r2.pools.length, 1, 'a warning-level interaction must not split pools');
});

console.log(`\n${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
