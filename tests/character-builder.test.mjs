/**
 * character-builder.test.mjs
 * --------------------------
 * Dependency-free regression checks for the character-creation engine and the
 * shared XP math. Runnable with plain Node (no Foundry, no test framework):
 *
 *   node tests/character-builder.test.mjs
 *
 * Exits non-zero on failure so it can gate CI later.
 */
import { CharacterBuilder as CB } from '../module/helpers/character-builder.mjs';
import * as XP from '../module/helpers/xp-math.mjs';

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { console.error('  ✗', msg); failed++; }
  else console.log('  ✓', msg);
};

/* ---- XP math vs rulebook ------------------------------------------------ */
ok(XP.getSkillLevelFromXP(170) === 5, 'skill level 5 at 170 XP (ATOW p.60)');
ok(XP.getSkillLevelFromXP(169) === 4, 'skill level 4 just below the L5 threshold');
ok(XP.getSkillLevelFromXP(19) === -1, 'untrained below 20 XP');
ok(XP.getAttributeScoreFromXP(500) === 5, 'attribute score 5 at 500 XP');
ok(XP.getAttributeScoreFromXP(99) === 0, 'attribute score 0 below one full point');
ok(XP.getAttributeXPCost(8) === 800, 'attribute score 8 costs 800 XP');
ok(XP.getLinkModifier(5) === 0 && XP.getLinkModifier(7) === 1 && XP.getLinkModifier(11) === 3,
  'link modifier table sample');

/* ---- Builder economy ---------------------------------------------------- */
const s = CB.createState();
ok(CB.remaining(s) === 5000 && s.age === 0, 'fresh state: 5000 XP pool, age 0 (accumulates from module time)');

CB.applyUniversalFixedXP(s, { primaryLanguageName: 'Capellan' });
ok(s.spent === 850, 'universal allotment costs 850 XP');
ok(s.attributes.str === 100, 'universal grants +100 XP to each attribute');
ok(s.skills['Perception'] === 10, 'universal grants +10 Perception');
ok(s.skills['Language/English'] === 20, 'universal grants +20 Language/English');
CB.applyUniversalFixedXP(s); // idempotent
ok(s.spent === 850, 'universal allotment is idempotent');

CB.applyModule(s, {
  stage: 0, xpCost: 0, time: 0,
  fixedXP: {
    attributes: { wil: 75 },
    traits: [{ name: 'Connections', xp: 50 }],
    skills: [{ name: 'Protocol', subskill: 'Capellan', xp: 15 }]
  },
  flexibleXP: [{ amount: 15, count: 3, targets: 'attributes', choices: ['str', 'bod', 'rfl', 'dex'] }]
}, { id: 'aff', name: 'Capellan' });
ok(s.attributes.wil === 175, 'fixed +75 WIL stacks on universal +100');
ok(s.skills['Protocol/Capellan'] === 15, 'subskill keyed as Protocol/Capellan');
ok(s.traits['Connections'] === 50, 'fixed trait XP accumulates');

/* ---- Flexible XP -------------------------------------------------------- */
const poolId = s.flexiblePending[0].id;
CB.assignFlexible(s, poolId, { kind: 'attribute', key: 'str' });
CB.assignFlexible(s, poolId, { kind: 'attribute', key: 'bod' });
CB.assignFlexible(s, poolId, { kind: 'attribute', key: 'rfl' });
ok(CB.flexibleResolved(s), 'flexible pool fully assigned');
ok(s.attributes.str === 115, 'flexible +15 applied to STR');

let threw = false;
try { CB.assignFlexible(s, poolId, { kind: 'attribute', key: 'int' }); } catch (_e) { threw = true; }
ok(threw, 'assignment beyond pool count is rejected');

threw = false;
try {
  const s2 = CB.createState();
  CB.applyModule(s2, { stage: 0, flexibleXP: [{ amount: 10, count: 1, choices: ['str'] }] });
  CB.assignFlexible(s2, s2.flexiblePending[0].id, { kind: 'attribute', key: 'cha' });
} catch (_e) { threw = true; }
ok(threw, 'assignment outside the choices list is rejected');

/* ---- Derivation & validation ------------------------------------------- */
const pheno = { modifiers: { dex: 1 }, maxValues: { str: 8, bod: 8, rfl: 9, dex: 9, int: 8, wil: 8, cha: 9, edg: 8 } };
const d = CB.derive(s, pheno);
ok(d.attributes.wil.value === 1 && d.attributes.wil.xp === 175, 'WIL 175 XP derives score 1');
ok(d.attributes.dex.total === d.attributes.dex.value + 1, 'phenotype +1 DEX modifier applied');
ok(!!d.skills.find(x => x.key === 'Protocol/Capellan'), 'derived skills include the subskill');

const capState = CB.createState();
CB.addAttributeXP(capState, 'str', 1000); // score 10, over the phenotype cap of 8
const capDerived = CB.derive(capState, pheno);
ok(capDerived.attributes.str.value === 8 && capDerived.attributes.str.wastedXP === 200,
  'phenotype cap limits score and reports wasted XP');

const issues = CB.validate(s, { phenotype: pheno });
ok(issues.some(i => i.code === 'missing-stage'), 'validation flags the missing Stage 1/2 modules');

const overspent = CB.createState({ startingXP: 100 });
CB.applyModule(overspent, { stage: 0, xpCost: 500 });
ok(CB.validate(overspent).some(i => i.code === 'pool-overspent'), 'validation flags an overspent pool');

/* ---- Flexible-pool stable keys (wizard rebuild relies on these) --------- */
{
  const mod = {
    stage: 1, xpCost: 200,
    flexibleXP: [
      { amount: 15, count: 2, targets: 'attributes', choices: ['str', 'bod'] },
      { amount: 20, count: 1, targets: 'skills' }
    ]
  };
  const a = CB.createState(); CB.applyModule(a, mod, { id: 'MOD1', name: 'M' });
  const b = CB.createState(); CB.applyModule(b, mod, { id: 'MOD1', name: 'M' });
  ok(a.flexiblePending[0].sourceKey === 'MOD1#0' && a.flexiblePending[1].sourceKey === 'MOD1#1',
    'flexible sourceKey is <moduleId>#<index>');
  ok(a.flexiblePending.map(p => p.sourceKey).join() === b.flexiblePending.map(p => p.sourceKey).join(),
    'flexible sourceKey is stable across rebuilds');
  // Re-apply saved assignments keyed by sourceKey.
  const saved = { 'MOD1#0': [{ key: 'str' }, { key: 'bod' }], 'MOD1#1': [{ key: 'Small Arms' }] };
  for (const pool of a.flexiblePending) {
    for (const raw of (saved[pool.sourceKey] || [])) {
      const kind = raw.kind || (pool.targets === 'attributes' ? 'attribute' : 'skill');
      CB.assignFlexible(a, pool.id, { kind, key: raw.key });
    }
  }
  ok(CB.flexibleResolved(a) && a.attributes.str === 15 && a.skills['Small Arms'] === 20,
    'saved flexible assignments re-apply by sourceKey');
}

/* ---- Module legality + leftover-pool spend (M7) ------------------------ */
ok(CB.isModuleLegal({ restrictedToAffiliations: [] }, 'capellan'), 'empty restriction is legal for anyone');
ok(CB.isModuleLegal({ restrictedToAffiliations: ['capellan'] }, 'capellan'), 'listed affiliation is legal');
ok(!CB.isModuleLegal({ restrictedToAffiliations: ['davion'] }, 'capellan'), 'unlisted affiliation is illegal');
{
  const st = CB.createState(); st.affiliationKey = 'capellan';
  CB.applyModule(st, { stage: 1, xpCost: 0, restrictedToAffiliations: ['davion'] }, { id: 'x', name: 'Davion School' });
  const iss = CB.validate(st, { modules: { x: { stage: 1, restrictedToAffiliations: ['davion'] } } });
  ok(iss.some(i => i.code === 'affiliation-illegal'), 'validate flags an affiliation-illegal module');

  const sp = CB.createState();
  const before = sp.attributes.str;
  ok(CB.spendPool(sp, { kind: 'attribute', key: 'str', xp: 300 }) && sp.attributes.str === before + 300,
    'spendPool adds attribute XP within budget');
  ok(!CB.spendPool(sp, { kind: 'attribute', key: 'str', xp: CB.remaining(sp) + 1 }),
    'spendPool rejects spending past the pool');
}

/* ---- Trait TP, Exceptional Attribute, subskills (M7 Task 2) ------------- */
ok(XP.getTraitTP(200) === 2 && XP.getTraitTP(50) === 0.5, 'trait TP = XP / 100');
{
  const st = CB.createState();
  CB.addTraitXP(st, 'Connections', 150); // 1.5 TP
  let iss = CB.validate(st, { modules: { m: { prerequisites: { traits: { Connections: 2 } } } } });
  // (no module m selected, so no prereq issue yet) — attach a module:
  CB.applyModule(st, { stage: 3, prerequisites: { traits: { Connections: 2 } } }, { id: 'm', name: 'X' });
  iss = CB.validate(st, { modules: { m: { prerequisites: { traits: { Connections: 2 } } } } });
  ok(iss.some(i => i.code === 'prereq-trait'), 'trait prereq (2 TP) unmet at 1.5 TP');
  CB.addTraitXP(st, 'Connections', 50); // 2.0 TP
  iss = CB.validate(st, { modules: { m: { prerequisites: { traits: { Connections: 2 } } } } });
  ok(!iss.some(i => i.code === 'prereq-trait'), 'trait prereq met at 2.0 TP');

  const ex = CB.createState();
  CB.addAttributeXP(ex, 'dex', 900);
  CB.addTraitXP(ex, 'Exceptional Attribute/DEX', 200);
  ok(CB.derive(ex, { maxValues: { dex: 8 } }).attributes.dex.value === 9,
    'Exceptional Attribute raises the DEX cap 8 -> 9');

  const su = CB.createState(); su.affiliationKey = 'capellan';
  CB.applyModule(su, { stage: 1, fixedXP: { skills: [
    { name: 'Survival', subskill: 'Any', xp: 20 },
    { name: 'Protocol', subskill: 'Affiliation', xp: 10 }
  ] } }, { id: 's', name: 'Farm' });
  ok(su.subskillPending.length === 1, '/Any grant is queued as a pending subskill');
  ok(su.skills['Protocol/Capellan'] === 10, '/Affiliation subskill auto-resolves to the affiliation');
  ok(!CB.subskillsResolved(su), 'subskills unresolved until chosen');
  CB.resolveSubskill(su, su.subskillPending[0].sourceKey, 'Wilderness');
  ok(su.skills['Survival/Wilderness'] === 20 && CB.subskillsResolved(su), 'resolving a subskill adds its XP');
}

/* ---- Lump flexible pools + full Stage 1/2 catalogue -------------------- */
{
  const { LIFE_MODULE_SEED } = await import('../module/data/life-modules.mjs');
  const s1 = LIFE_MODULE_SEED.filter(m => m.system.stage === 1);
  const s2 = LIFE_MODULE_SEED.filter(m => m.system.stage === 2);
  ok(s1.length === 11 && s2.length === 12, 'all 11 Stage 1 + 12 Stage 2 modules present');
  ok(!LIFE_MODULE_SEED.some(m => m.system.stage <= 2 && /\(Example\)/.test(m.name)),
    'Stage 1/2 example placeholders removed');

  // Lump pool: created, unresolved until fully allocated.
  const adol = s2.find(m => m.name === 'Adolescent Warfare');
  const st = CB.createState();
  CB.applyModule(st, adol.system, { id: 'a', name: 'a' });
  const pool = st.flexiblePending.find(p => p.lump);
  ok(pool && pool.amount === 130, 'Adolescent Warfare has a 130-XP lump pool');
  ok(!CB.flexibleResolved(st), 'lump pool unresolved before allocation');
  pool.allocated = 130;
  ok(CB.flexibleResolved(st), 'lump pool resolved once fully allocated');

  // Count "choose one Trait" pool (Fugitives).
  const fug = s1.find(m => m.name === 'Fugitives');
  const fs = CB.createState();
  CB.applyModule(fs, fug.system, { id: 'f', name: 'f' });
  const choice = fs.flexiblePending.find(p => p.choices.includes('Combat Sense'));
  ok(choice && choice.count === 1 && choice.amount === 100, 'Fugitives choose-one-Trait pool (100 XP, 6 choices)');
}

/* ---- Sub-affiliations + broadened subskill detection ------------------- */
{
  const { LIFE_MODULE_SEED } = await import('../module/data/life-modules.mjs');
  const cap = LIFE_MODULE_SEED.find(m => m.system.affiliationKey === 'capellan');
  ok(cap.system.xpCost === 150 && cap.system.subAffiliations.length === 5,
    'Capellan seed: 150 XP, 5 sub-affiliations (accurate transcription)');
  ok(cap.system.fixedXP.traits.some(t => t.name === 'Exceptional Attribute/EDG'),
    'Capellan main grants Exceptional Attribute/EDG');

  const st = CB.createState(); st.affiliationKey = 'capellan';
  CB.applyModule(st, cap.system, { id: 'cap', name: cap.name });
  const sub = cap.system.subAffiliations.find(s => s.key === 'sian-commonality');
  CB.applyModule(st, { stage: 0, fixedXP: sub.fixedXP, flexibleXP: sub.flexibleXP }, { id: 'subaff:sian', name: 'sub' });
  ok(st.attributes.wil === 125, 'main WIL +50 and Sian WIL +75 stack to 125');
  ok(st.traits['Citizenship'] === 50, 'sub-affiliation trait applied');

  // "Choose either FedSuns or Lyran" should queue as a pending subskill.
  const liao = CB.createState(); liao.affiliationKey = 'capellan';
  CB.applyModule(liao, { stage: 0, fixedXP: {
    skills: [{ name: 'Protocol', subskill: 'Choose either FedSuns or Lyran', xp: 10 }]
  } }, { id: 'x', name: 'x' });
  ok(liao.subskillPending.length === 1, '"Choose either…" queues as a pending subskill');
}

/* ---- Wealth -> C-Bills, Equipped -> rating (ATOW p.128/116) ------------- */
{
  const { computeStartingWealth, wealthCBills, equippedRating } = await import('../module/data/atow-lists.mjs');
  ok(wealthCBills(0) === 1000 && wealthCBills(2) === 5000 && wealthCBills(3) === 10000,
    'Wealth C-bills table matches the book (0/2/3 -> 1000/5000/10000)');
  ok(equippedRating(0) === 'D/B/B' && equippedRating(1) === 'D/B/C',
    'Equipped rating table matches the book');
  ok(equippedRating(3, { isClan: true }) === 'F/C/D', 'Clan raises Equipped Tech +1');
  const w = computeStartingWealth({ 'Wealth/Alias': 200, 'Equipped': 100 });
  ok(w.cbills === 5000 && w.rating === 'D/B/C', 'computeStartingWealth sums identity-based Wealth/Equipped');
  ok(computeStartingWealth({}).cbills === 1000, 'no Wealth trait -> 1000 default C-bills');
}

/* ---- Seed data integrity ------------------------------------------------ */
const { LIFE_MODULE_SEED } = await import('../module/data/life-modules.mjs');
ok(Array.isArray(LIFE_MODULE_SEED) && LIFE_MODULE_SEED.length > 0, 'seed data is a non-empty array');
let seedOk = true;
for (const e of LIFE_MODULE_SEED) {
  if (e.type !== 'lifeModule' || !e.name || !e.system) seedOk = false;
  const sys = e.system || {};
  if (![0, 1, 2, 3, 4].includes(sys.stage)) seedOk = false;
  if (sys.fixedXP && !Array.isArray(sys.fixedXP.skills)) seedOk = false;
  if (sys.flexibleXP && !Array.isArray(sys.flexibleXP)) seedOk = false;
}
ok(seedOk, 'every seed entry has a valid lifeModule shape');

// Applying every seed module must not throw and must keep XP accounting sane.
let applyOk = true;
try {
  const st = CB.createState();
  CB.applyUniversalFixedXP(st, { primaryLanguageName: 'Test' });
  for (const e of LIFE_MODULE_SEED) {
    if (e.system.affiliationKey === 'universal') continue; // engine applies this itself
    CB.applyModule(st, e.system, { id: e.name, name: e.name });
  }
  CB.derive(st);
} catch (_e) { applyOk = false; }
ok(applyOk, 'all seed modules apply through the engine without error');

/* ---- Module variants (branch/caste sub-options) ------------------------- */
{
  const appr = LIFE_MODULE_SEED.find(m => m.name === 'Clan Apprenticeship');
  ok(appr?.system.variantRequired && appr.system.variants.length === 4,
    'Clan Apprenticeship requires one of 4 castes');
  // base grants (360) + one caste (140) reproduces the book Module Cost of 500.
  ok(appr.system.xpCost + appr.system.variants[0].xpCost === 500,
    'Clan Apprenticeship base + caste = 500 XP (book value)');

  const free = LIFE_MODULE_SEED.find(m => m.name === 'Freeborn Sibko');
  ok(free?.system.variants.length === 5, 'Freeborn Sibko has 5 branches');
  // Freeborn is a flat 950 XP for every branch.
  ok(free.system.variants.every(v => free.system.xpCost + v.xpCost === 950),
    'every Freeborn Sibko branch totals 950 XP (book value)');

  const tb = LIFE_MODULE_SEED.find(m => m.name === 'Trueborn Sibko');
  ok(tb?.system.variants.some(v => v.key === 'protomech'), 'Trueborn Sibko includes ProtoMech branch');
  // Trueborn is 1,600 XP except ProtoMech, which is 1,500.
  ok(tb.system.variants.every(v => {
    const total = tb.system.xpCost + v.xpCost;
    return v.key === 'protomech' ? total === 1500 : total === 1600;
  }), 'Trueborn Sibko branches total 1,600 XP (1,500 for ProtoMech)');

  // A branch bundle applies cleanly on top of its parent, carrying its own cost + grants.
  const st = CB.createState();
  st.affiliationKey = 'clan';
  CB.applyModule(st, appr.system, { id: 'appr', name: appr.name });
  const before = st.spent;
  const tech = appr.system.variants.find(v => v.key === 'technician');
  CB.applyModule(st, { stage: 2, xpCost: tech.xpCost, fixedXP: tech.fixedXP, flexibleXP: tech.flexibleXP },
    { id: 'appr:technician', name: tech.name });
  ok(st.spent - before === 140, 'applying the Technician caste spends its 140 XP');
  ok(st.attributes.dex === 30, 'Technician caste added +30 DEX XP');
}

/* ---- Full affiliation catalogue ----------------------------------------- */
{
  const affs = LIFE_MODULE_SEED.filter(m => m.system.stage === 0 && m.system.moduleType === 'affiliation'
    && m.system.affiliationKey !== 'universal');
  ok(affs.length >= 13, `all Stage 0 affiliations present (found ${affs.length})`);

  // Every named realm from ATOW pp.64-74 should be there.
  for (const name of ['Capellan Confederation', 'Draconis Combine', 'Federated Suns', 'Free Worlds League',
    'Lyran Alliance', 'Free Rasalhague Republic', 'Minor Periphery State', 'Major Periphery State',
    'Deep Periphery', 'Invading Clan', 'Homeworld Clan', 'Independent', 'ComStar']) {
    ok(affs.some(a => a.name.includes(name)), `affiliation present: ${name}`);
  }

  // Every affiliation applies cleanly, including all of its sub-affiliations.
  let affApplyOk = true;
  for (const a of affs) {
    try {
      const st = CB.createState();
      st.affiliationKey = a.system.affiliationKey;
      CB.applyModule(st, a.system, { id: a.name, name: a.name });
      for (const sub of (a.system.subAffiliations || [])) {
        CB.applyModule(st, { stage: 0, xpCost: 0, fixedXP: sub.fixedXP, flexibleXP: sub.flexibleXP },
          { id: `${a.name}:${sub.key}`, name: sub.name });
      }
      CB.derive(st);
    } catch (_e) { affApplyOk = false; }
  }
  ok(affApplyOk, 'every affiliation + all its sub-affiliations apply without error');

  // Both Clan affiliations expose the 10 castes as required variants.
  const clanAffs = affs.filter(a => a.system.affiliationKey === 'clan');
  ok(clanAffs.length === 2, 'Invading Clan + Homeworld Clan both use affiliationKey "clan"');
  ok(clanAffs.every(a => a.system.variantRequired && a.system.variants.length === 10),
    'each Clan affiliation requires one of 10 castes');

  // Sub-affiliation XP stacks on top of the main affiliation.
  const draconis = affs.find(a => a.name.includes('Draconis Combine'));
  const st = CB.createState();
  st.affiliationKey = 'kurita';
  CB.applyModule(st, draconis.system, { id: 'drac', name: draconis.name });
  const azami = draconis.system.subAffiliations.find(s => s.key === 'azami');
  CB.applyModule(st, { stage: 0, xpCost: 0, fixedXP: azami.fixedXP, flexibleXP: azami.flexibleXP }, { id: 'azami', name: 'Azami' });
  ok(st.attributes.wil === 50 + 190, 'Draconis WIL +50 and Azami WIL +190 stack to 240');

  // Language override: a sub-affiliation's own primary language wins over the
  // main affiliation's (mirrors CharacterWizard#rebuildState resolution).
  const resolvePrimary = (a, sub) => sub?.primaryLanguage || a.system.primaryLanguage || '';
  const deep = affs.find(a => a.name === 'Deep Periphery');
  const hanse = deep.system.subAffiliations.find(s => s.key === 'hanseatic-league');
  ok(resolvePrimary(deep, hanse) === 'German', 'Deep Periphery + Hanseatic resolves primary language to German');
  ok(resolvePrimary(draconis, null) === 'Japanese', 'Draconis with no sub keeps its Japanese primary language');
  ok(deep.system.subAffiliations.every(s => s.primaryLanguage), 'every Deep Periphery sub defines its own primary language');

  // ComStar / Word of Blake stacks a second "birth" affiliation at full cost.
  const comstar = affs.find(a => a.system.affiliationKey === 'comstar');
  ok(comstar.system.requiresBirthAffiliation, 'ComStar requires a birth affiliation');
  const davion = affs.find(a => a.name.includes('Federated Suns'));
  const stC = CB.createState();
  stC.affiliationKey = 'davion';
  CB.applyUniversalFixedXP(stC, { primaryLanguageName: 'English' });
  const afterUniversal = stC.spent;
  CB.applyModule(stC, davion.system, { id: 'd', name: davion.name });
  CB.applyModule(stC, comstar.system, { id: 'c', name: comstar.name });
  ok(stC.spent === afterUniversal + 150 + 50, 'birth (Davion 150) + ComStar (50) both charged at full cost');
  ok(stC.traits['Rank'] === 50, 'ComStar Rank +50 stacks on top of the birth affiliation');
  ok(Object.keys(stC.skills).some(k => /protocol\/fedsuns/i.test(k)),
    'birth affiliation grants (Protocol/FedSuns) survive alongside ComStar');
  // Birth affiliation drives the primary language; ComStar's English is secondary.
  const resolveLangs = (birth, order) => {
    const primary = order.map(x => x.a.system.primaryLanguage).find(Boolean) || '';
    return { primary };
  };
  ok(resolveLangs(davion, [{ a: davion }, { a: comstar }]).primary === 'English',
    'ComStar born in the Federated Suns takes English (birth) as primary language');
}

/* ---- Result ------------------------------------------------------------- */
if (failed) { console.error(`\n${failed} check(s) FAILED`); process.exit(1); }
console.log('\nAll character-builder checks passed.');
