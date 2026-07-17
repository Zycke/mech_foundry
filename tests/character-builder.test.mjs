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
import { CharacterBuilder as CB, FIELD_SKILL_XP, FIELD_SKILL_COST, affiliationCategory } from '../module/helpers/character-builder.mjs';
import * as XP from '../module/helpers/xp-math.mjs';
import { SKILL_FIELDS } from '../module/data/skill-fields.mjs';

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

  // ComStar born into a Clan: the birth affiliation's caste (variant) applies too.
  const invading = affs.find(a => a.name === 'Invading Clan');
  ok(invading.system.variants.length === 10, 'a Clan birth affiliation still exposes its 10 castes');
  const stK = CB.createState();
  stK.affiliationKey = 'clan';
  CB.applyUniversalFixedXP(stK, { primaryLanguageName: 'English' });
  CB.applyModule(stK, invading.system, { id: 'birth', name: invading.name });
  const mw = invading.system.variants.find(v => v.key === 'mechwarrior');
  CB.applyModule(stK, { stage: 0, xpCost: mw.xpCost, fixedXP: mw.fixedXP, flexibleXP: mw.flexibleXP },
    { id: 'variant:birth:mechwarrior', name: mw.name });
  CB.applyModule(stK, comstar.system, { id: 'c2', name: comstar.name });
  // Universal grants +100 to each attribute; the MechWarrior caste adds +75 DEX/RFL.
  ok(stK.attributes.dex === 100 + 75 && stK.attributes.rfl === 100 + 75,
    'ComStar born into a Clan applies the MechWarrior caste (DEX +75, RFL +75) alongside ComStar');
}

/* ---- Stage 3: Higher Education (schools & Skill Fields) ------------------ */
{
  const schools = LIFE_MODULE_SEED.filter(m => m.system.stage === 3);
  ok(schools.length === 10, `all 10 Higher Education schools present (found ${schools.length})`);
  ok(!schools.some(s => /\(Example\)/.test(s.name)), 'Stage 3 example placeholder removed');

  // Every Field a school offers must be defined in the Master Skill Fields List.
  let allFieldsDefined = true;
  for (const s of schools)
    for (const tier of ['basic', 'advanced', 'special', 'officer'])
      for (const fn of s.system.fields[tier].options)
        if (!SKILL_FIELDS[fn]) allFieldsDefined = false;
  ok(allFieldsDefined, 'every school Field resolves to a Master Skill Fields List entry');

  // Field economics: pay 24/skill, gain 30/skill.
  const st = CB.createState();
  const mw = SKILL_FIELDS['MechWarrior'];
  const before = st.spent;
  CB.applyField(st, mw.skills, 1, { id: 'f1', name: 'MechWarrior' });
  ok(st.spent - before === FIELD_SKILL_COST * mw.skills.length, `MechWarrior Field costs ${FIELD_SKILL_COST}×${mw.skills.length} XP`);
  ok(st.skills["Gunnery/'Mech"] === FIELD_SKILL_XP, 'each Field Skill gains +30 XP');
  ok(st.age === CB.createState().age + 1, 'a Field adds its tier time to age');

  // Field-selection constraints.
  ok(CB.validateFieldSelection({ basic: 'Basic Training', advanced: [], special: [] }).length === 0,
    'one Basic Field is a valid selection');
  ok(CB.validateFieldSelection({ basic: '', advanced: ['Infantry'], special: [] }).some(m => /one Basic/.test(m)),
    'selection without a Basic Field is rejected');
  ok(CB.validateFieldSelection({ basic: 'Basic Training', advanced: [], special: ['Special Forces'] }).some(m => /Special Field requires/.test(m)),
    'a Special Field without an Advanced Field is rejected');
  ok(CB.validateFieldSelection({ basic: 'Basic Training', advanced: ['Infantry', 'MechWarrior'], special: ['Special Forces'] }).some(m => /at most three/.test(m)),
    'more than three Fields is rejected');

  // Same-type repeat rule (Officer is exempt).
  ok(CB.duplicateSchoolTypes(['military', 'military']).includes('military'), 'two Military schools is a duplicate');
  ok(CB.duplicateSchoolTypes(['military', 'civilian']).length === 0, 'different school types are allowed');
  ok(CB.duplicateSchoolTypes(['military', 'officer', 'officer']).length === 0, 'Officer schooling is exempt from the repeat rule');

  // Conditional penalty: applies only when none of the "unless" modules are present.
  const uni = schools.find(s => s.name === 'University');
  const p1 = CB.createState();
  CB.applyConditionalXP(p1, uni.system.conditionalXP); // no Prep School -> penalty applies
  ok(p1.attributes.wil === 100 && p1.traits['Connections'] === 200, 'University penalty applies when Prep School was skipped');
  const p2 = CB.createState();
  p2.modules.push({ id: 'x', name: 'Preparatory School', stage: 2 });
  CB.applyConditionalXP(p2, uni.system.conditionalXP);
  ok(!p2.attributes.wil && !p2.traits['Connections'], 'University penalty is waived when Prep School was taken');

  // Base cost already nets the automatics + flexible (ATOW "base + Field Costs").
  const tc = schools.find(s => s.name === 'Technical College');
  ok(tc.system.xpCost === 600, 'Technical College base cost is 600 XP (automatics + flexible)');

  // A full enrolment: school + one Basic + one Advanced Field.
  const full = CB.createState();
  const before2 = full.spent;
  CB.applyModule(full, tc.system, { id: 'tc', name: tc.name });
  CB.applyField(full, SKILL_FIELDS['Communications'].skills, tc.system.fields.basic.time, { id: 'tc-b', name: 'Communications' });
  CB.applyField(full, SKILL_FIELDS['Engineer'].skills, tc.system.fields.advanced.time, { id: 'tc-a', name: 'Engineer' });
  const fieldCost = FIELD_SKILL_COST * (SKILL_FIELDS['Communications'].skills.length + SKILL_FIELDS['Engineer'].skills.length);
  ok(full.spent - before2 === 600 + fieldCost, 'total cost = school base + 24×(field skills)');
  ok(full.age === CB.createState().age + tc.system.fields.basic.time + tc.system.fields.advanced.time, 'age = sum of chosen Field tier times');

  // Full wizard-style enrolment: Military Academy (no Prep School -> penalty) +
  // Basic Training + MechWarrior Advanced Field. Mirrors CharacterWizard flow.
  const acad = schools.find(s => s.name === 'Military Academy');
  const w = CB.createState();
  const base = w.spent;
  CB.applyModule(w, acad.system, { id: 'ma', name: acad.name });
  CB.applyConditionalXP(w, acad.system.conditionalXP);              // penalty (Prep skipped)
  CB.applyField(w, SKILL_FIELDS['Basic Training'].skills, acad.system.fields.basic.time, { id: 'ma-b', name: 'Basic Training' });
  CB.applyField(w, SKILL_FIELDS['MechWarrior'].skills, acad.system.fields.advanced.time, { id: 'ma-a', name: 'MechWarrior' });
  const maCost = 830 + FIELD_SKILL_COST * (SKILL_FIELDS['Basic Training'].skills.length + SKILL_FIELDS['MechWarrior'].skills.length);
  ok(w.spent - base === maCost, 'Military Academy + Basic + MechWarrior sums school base + Field costs');
  ok(w.traits['Rank'] === 200, 'Military Academy grants Rank +200');
  ok(w.traits['Connections'] === 200, 'the skip-Prep penalty adds Connections +200');
  ok(w.skills["Piloting/'Mech"] === 30, 'the MechWarrior Field grants +30 to Piloting/’Mech');

  // Field-prerequisite data that drives the wizard grey-out.
  const metWith = (req, chosen) => {
    const rf = req?.fields || [];
    return !rf.length || rf.some(f => chosen.has(f));
  };
  ok(SKILL_FIELDS['Doctor'].req.fields.includes('Scientist'), 'Doctor Field requires Medical Assistant / Scientist');
  ok(!metWith(SKILL_FIELDS['Doctor'].req, new Set()), 'Doctor is locked with no prerequisite Field chosen');
  ok(metWith(SKILL_FIELDS['Doctor'].req, new Set(['Scientist'])), 'Doctor unlocks once Scientist is chosen');
  // Basic Training vs Basic Training (Naval) gate different Advanced Fields.
  ok(!metWith(SKILL_FIELDS['MechWarrior'].req, new Set(['Basic Training (Naval)'])), 'MechWarrior stays locked under a Naval Basic Field');
  ok(metWith(SKILL_FIELDS['Marine'].req, new Set(['Basic Training (Naval)'])), 'Marine unlocks under a Naval Basic Field');
  // Solaris waives Basic Training for its Cavalry / MechWarrior / Battle Armor Fields.
  const solaris = schools.find(s => s.name === 'Solaris Internship');
  ok(solaris.system.fieldWaivers.includes('MechWarrior'), 'Solaris waives the Basic-Training prereq for MechWarrior');

  // Officer Candidate School gating: needs a prior Int/Police/Military school
  // with a Basic AND an Advanced Field (mirrors CharacterWizard#ocsPrereqMet).
  const ocs = schools.find(s => s.system.schoolType === 'officer');
  ok(ocs && ocs.name === 'Officer Candidate School', 'OCS uses the officer school type');
  const ocsMet = (selected) => selected.some(({ type, fc }) =>
    ['intelligence', 'military'].includes(type) && fc.basic && fc.advanced.length);
  ok(!ocsMet([{ type: 'civilian', fc: { basic: 'General Studies', advanced: ['Manager'] } }]),
    'a civilian school does not satisfy the OCS prerequisite');
  ok(!ocsMet([{ type: 'military', fc: { basic: 'Basic Training', advanced: [] } }]),
    'a military school with only a Basic Field does not satisfy OCS');
  ok(ocsMet([{ type: 'military', fc: { basic: 'Basic Training', advanced: ['MechWarrior'] } }]),
    'a military school with a Basic + Advanced Field satisfies OCS');
}

/* ---- Stage 4: Real Life (repeat rule & prereqs) ------------------------- */
{
  const s4 = LIFE_MODULE_SEED.filter(m => m.system.stage === 4);
  ok(s4.length === 24, `all 24 Real Life modules present (found ${s4.length})`);
  ok(!s4.some(m => /\(Example\)/.test(m.name)), 'Stage 4 example placeholder removed');
  for (const name of ['Tour of Duty', 'Civilian Job', 'Covert Operations', 'Merchant', 'Travel', 'Agitator', 'Dark Caste']) {
    ok(s4.some(m => m.name === name), `Stage 4 module present: ${name}`);
  }

  // Affiliation categories (ATOW p.91).
  ok(affiliationCategory('davion') === 'innerSphere' && affiliationCategory('comstar') === 'innerSphere', 'Houses & ComStar are Inner Sphere');
  ok(affiliationCategory('periphery-major') === 'periphery' && affiliationCategory('independent') === 'periphery', 'Periphery realms & Independents are Periphery');
  ok(affiliationCategory('clan') === 'clan', 'Clans are the Clan category');

  // Repeat rule: a repeat re-awards Skill + Flexible XP but NOT Attribute/Trait.
  const agitator = s4.find(m => m.name === 'Agitator');
  const st = CB.createState();
  CB.applyModule(st, agitator.system, { id: 'a1', name: agitator.name });                 // first take
  const willAfter1 = st.attributes.wil, toughAfter1 = st.traits['Toughness'], actAfter1 = st.skills['Acting'], spent1 = st.spent;
  CB.applyModule(st, agitator.system, { id: 'a2', name: agitator.name }, { repeat: true }); // repeat
  ok(st.attributes.wil === willAfter1, 'a repeat does not re-award Attribute XP');
  ok(st.traits['Toughness'] === toughAfter1, 'a repeat does not re-award Trait XP');
  ok(st.skills['Acting'] === actAfter1 + 50, 'a repeat DOES re-award Skill XP');
  ok(st.spent === spent1 + 900, 'a repeat still charges the full module cost');
  // The flexible pool is re-queued on a repeat (two pools now pending).
  ok(st.flexiblePending.filter(p => p.moduleId === 'a2').length === 1, 'a repeat re-queues the Flexible XP pool');

  // noFlexOnRepeat: Ne'er-do-well grants no Flexible XP on repeat.
  const neer = s4.find(m => m.name === "Ne'er-do-well");
  ok(neer.system.noFlexOnRepeat, "Ne'er-do-well is flagged noFlexOnRepeat");
  const st2 = CB.createState();
  CB.applyModule(st2, neer.system, { id: 'n2', name: neer.name }, { repeat: true, noFlexOnRepeat: true });
  ok(st2.flexiblePending.length === 0, "Ne'er-do-well queues no Flexible pools on a repeat");

  // Non-repeatable modules are flagged.
  ok(s4.find(m => m.name === 'Postgraduate Studies').system.repeatable === false, 'Postgraduate Studies is not repeatable');

  // Categorical prereq data is captured.
  const cw = s4.find(m => m.name === 'Clan Watch Operative');
  ok(cw.system.prerequisites.affiliationCategories.includes('clan'), 'Clan Watch Operative requires the Clan category');
  ok(s4.find(m => m.name === 'Guerilla Insurgent').system.prerequisites.forbidCategories.includes('clan'), 'Guerilla Insurgent forbids the Clan category');
  ok(s4.find(m => m.name === 'Postgraduate Studies').system.prerequisites.modules.includes('University'), 'Postgraduate Studies requires the University module');
  ok(s4.find(m => m.name === 'To Serve and Protect').system.prerequisites.fields.includes('Detective'), 'To Serve and Protect requires a Police/Detective Field');

  // Wizard-style instance application: two takes of Tour of Duty (the 2nd a
  // repeat) — Trait once, Skill twice, cost twice. Mirrors #applyStageFour.
  const tour = s4.find(m => m.name === 'Tour of Duty');
  const inst = CB.createState();
  const instances = ['tour', 'tour'];
  const seen = new Map();
  const spent0 = inst.spent;
  instances.forEach((id, idx) => {
    const n = seen.get(id) || 0; seen.set(id, n + 1);
    CB.applyModule(inst, tour.system, { id: `s4:${idx}:${id}`, name: tour.name }, { repeat: n > 0 });
  });
  ok(inst.traits['Connections'] === 25, 'two Tour-of-Duty instances grant its Trait XP once');
  ok(inst.skills['Career/Soldier'] === 50 * 2, 'two Tour-of-Duty instances grant Skill XP twice');
  ok(inst.spent - spent0 === 800 * 2, 'two Tour-of-Duty instances each cost full price');

  // Solaris prior-module references point at the real Stage-3 school name.
  ok(s4.find(m => m.name === 'Solaris Insider').system.prerequisites.modules.includes('Solaris Internship'),
    'Solaris Insider references the Solaris Internship module by its real name');
}

/* ---- Real Life: caste-group prereq mapping (Clan castes) ----------------- */
{
  // The caste families Stage-4 prereqs use must cover the ten Clan castes.
  const CASTE_GROUPS = {
    warrior: ['mechwarrior', 'elemental', 'elemental-adv', 'aerospace', 'aerospace-naval', 'warrior-other'],
    scientist: ['scientist'], technician: ['technician'], merchant: ['merchant'], laborer: ['laborer']
  };
  const invading = LIFE_MODULE_SEED.find(m => m.name === 'Invading Clan');
  const allCastes = invading.system.variants.map(v => v.key);
  const grouped = new Set(Object.values(CASTE_GROUPS).flat());
  ok(allCastes.every(c => grouped.has(c)), 'every Clan caste maps to a caste family');
  const groupOf = (k) => Object.entries(CASTE_GROUPS).find(([, ks]) => ks.includes(k))?.[0] || '';
  ok(groupOf('mechwarrior') === 'warrior' && groupOf('scientist') === 'scientist',
    'caste family lookup returns warrior / scientist correctly');
}

/* ---- Real Life: sub-modules, cost tiers, repeat effects ------------------ */
{
  const s4 = LIFE_MODULE_SEED.filter(m => m.system.stage === 4);
  const { affiliationCategory: catOf } = { affiliationCategory };

  // Cost tiers (Tour of Duty 700/800/1,000).
  const tour = s4.find(m => m.name === 'Tour of Duty');
  const cost = (affKey) => tour.system.costByCategory[catOf(affKey)] ?? tour.system.xpCost;
  ok(cost('davion') === 800 && cost('periphery-major') === 700 && cost('clan') === 1000,
    'Tour of Duty cost tiers resolve to 800 / 700 / 1,000 by affiliation category');

  // Auto sub-module matching (mirrors CharacterWizard#matchAutoVariant).
  const match = (sys, { cat, casteGroup, key, subKey, affName }) => {
    const asA = v => Array.isArray(v) ? v : (v == null ? [] : [v]);
    return (sys.variants || []).find(v => {
      const m = v.match || {};
      if (asA(m.categories).length && !m.categories.includes(cat)) return false;
      if (asA(m.affiliationKeys).length && !m.affiliationKeys.includes(key)) return false;
      if (asA(m.castes).length && !m.castes.includes(casteGroup)) return false;
      if (asA(m.subAffiliations).length && !m.subAffiliations.includes(subKey)) return false;
      if (asA(m.affiliationNames).length && !m.affiliationNames.some(nm => (affName || '').includes(nm))) return false;
      return true;
    }) || null;
  };
  ok(match(tour.system, { cat: 'periphery' })?.key === 'periphery', 'a Periphery character auto-selects the Periphery Tour');
  ok(match(tour.system, { cat: 'clan' })?.key === 'clan', 'a Clan character auto-selects the Clan Tour');

  const covert = s4.find(m => m.name === 'Covert Operations');
  ok(match(covert.system, { cat: 'innerSphere', key: 'kurita' })?.name.includes('Draconis'), 'Covert Ops auto-selects the Draconis sub-module by key');
  const washout = s4.find(m => m.name === 'Clan Warrior Washout');
  ok(match(washout.system, { casteGroup: 'scientist' })?.key === 'scientist', 'Clan Warrior Washout auto-selects the Scientist caste sub-module');
  const guerilla = s4.find(m => m.name === 'Guerilla Insurgent');
  ok(match(guerilla.system, { cat: 'innerSphere', key: 'davion' })?.key === 'general', 'Guerilla Insurgent falls back to the General sub-module');

  // Repeat effect data.
  ok(s4.find(m => m.name === 'Solaris Insider').system.repeatEffect.traits.some(t => t.name === 'In For Life' && t.xp === -100),
    'Solaris Insider applies In For Life -100 on repeat');

  // Field-constrained pools carry the fromFields flag + field-type filter.
  const perTour = tour.system.variants.find(v => v.key === 'periphery');
  const fp = perTour.flexibleXP.find(p => p.fromFields);
  ok(fp && fp.fieldTypes.includes('military'), 'the Periphery Tour Military-Field pool is fromFields/military');
}

/* ---- Finalization: opposed traits, optimization, buying XP -------------- */
{
  // Opposed-trait canceling (Toughness +250 vs Glass Jaw -100 -> Toughness 150).
  const s = CB.createState();
  s.traits['Toughness'] = 250; s.traits['Glass Jaw'] = -100;
  s.traits['Combat Sense'] = 100; s.traits['Combat Paralysis'] = -100; // net 0 -> both cancel
  CB.resolveOpposedTraits(s);
  ok(s.traits['Toughness'] === 150 && s.traits['Glass Jaw'] === undefined, 'opposed pair merges to the net positive Trait');
  ok(s.traits['Combat Sense'] === undefined && s.traits['Combat Paralysis'] === undefined, 'an even opposed pair cancels both Traits');

  // Illiterate erased by a level-4 Language Skill.
  const s2 = CB.createState();
  s2.traits['Illiterate'] = -75; s2.skills['Language/English'] = 120; // level 4 (120 XP)
  CB.resolveOpposedTraits(s2);
  ok(s2.traits['Illiterate'] === undefined, 'Illiterate is erased once a Language Skill reaches level 4');

  // Negative Trait with positive XP is stricken, XP returned to the pool.
  const s3 = CB.createState();
  s3.traits['Enemy'] = 40;
  CB.resolveOpposedTraits(s3);
  ok(s3.traits['Enemy'] === undefined && s3.poolBonus === 40, 'a negative Trait left positive is stripped and its XP returned to the pool');

  // Optimization reclaims excess above the highest fully-attained level.
  const o = CB.createState();
  o.attributes.str = 325;                 // score 3 (300) + 25 excess
  o.skills['Career/Soldier'] = 115;       // level 3 (80) + 35 excess
  o.skills['Strategy'] = 10;              // below level 0 -> drops, reclaim 10
  o.traits['Fit'] = 15;                   // < 100, can't reach 1 TP -> reclaim 15
  const r = CB.optimize(o, { attributes: true, traits: true, skills: true });
  ok(r.attributes === 25 && r.skills === 45 && r.traits === 15, 'optimize reclaims 25 / 45 / 15 by category');
  ok(o.attributes.str === 300 && o.skills['Career/Soldier'] === 80 && o.skills['Strategy'] === undefined,
    'optimized stats sit exactly at their fully-attained level');
  ok(o.poolBonus === 85, 'reclaimed XP is added to the pool');

  // Selective optimization: skills only leaves attributes untouched.
  const o2 = CB.createState();
  o2.attributes.str = 325; o2.skills['Career/Soldier'] = 115;
  CB.optimize(o2, { skills: true });
  ok(o2.attributes.str === 325 && o2.skills['Career/Soldier'] === 80, 'skills-only optimization leaves attributes alone');

  // Buying additional XP: capped at 10% of starting XP.
  const b = CB.createState(); // 5000 pool -> cap 500
  ok(CB.additionalXPCap(b) === 500, 'the additional-XP cap is 10% of the starting pool');
  const gained = CB.applyBoughtTraits(b, [{ name: 'In For Life', tp: -3 }, { name: 'Dark Secret', tp: -2 }]);
  ok(gained === 500 && b.traits['In For Life'] === -300, 'buying In For Life -3 and Dark Secret -2 yields 500 XP at the cap');
  ok(CB.remaining(b) === 5000 + 500, 'bought XP raises the remaining pool');
  const over = CB.createState();
  CB.applyBoughtTraits(over, [{ name: 'Slow Learner', tp: -4 }, { name: 'Glass Jaw', tp: -3 }]); // 400 + 300 > 500
  ok(over.poolBonus === 400, 'a purchase that would exceed the cap is skipped');

  // Trait level limits: a limitOf(name) -> { min, max } in TP clamps buys/spends.
  const limitOf = (name) => ({
    'Illiterate': { min: -1, max: 0 },
    'Enemy': { min: -10, max: 0 },
    'Fit': { min: 0, max: 2 },
    'Reputation': { min: -5, max: 5 }
  })[name] || null;

  // Buying past a Trait's most-negative level is clamped to the limit.
  const lim = CB.createState();
  const g = CB.applyBoughtTraits(lim, [{ name: 'Illiterate', tp: -3 }], limitOf); // clamps to -1
  ok(g === 100 && lim.traits['Illiterate'] === -100, 'buying Illiterate -3 clamps to its -1 maximum (100 XP)');

  // A Trait already at its limit yields nothing further.
  const lim2 = CB.createState();
  lim2.traits['Illiterate'] = -100; // already at -1 TP
  const g2 = CB.applyBoughtTraits(lim2, [{ name: 'Illiterate', tp: -1 }], limitOf);
  ok(g2 === 0 && lim2.traits['Illiterate'] === -100, 'buying an already-maxed negative Trait adds nothing');

  // clampTraits caps a positive Trait over its max and a negative Trait past its min.
  const c = CB.createState();
  c.traits['Fit'] = 300;        // 3 TP, over the +2 cap
  c.traits['Illiterate'] = -250; // -2.5 TP, past the -1 floor
  c.traits['Reputation'] = 800;  // 8 TP, over the +5 cap
  CB.clampTraits(c, limitOf);
  ok(c.traits['Fit'] === 200, 'clampTraits caps a positive Trait to its maximum');
  ok(c.traits['Illiterate'] === -100, 'clampTraits caps a negative Trait to its most-negative level');
  ok(c.traits['Reputation'] === 500, 'clampTraits caps a dual-sign Trait to its positive maximum');
}

/* ---- Result ------------------------------------------------------------- */
if (failed) { console.error(`\n${failed} check(s) FAILED`); process.exit(1); }
console.log('\nAll character-builder checks passed.');
