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
ok(CB.remaining(s) === 5000 && s.age === 21, 'fresh state: 5000 XP pool, age 21');

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

/* ---- Result ------------------------------------------------------------- */
if (failed) { console.error(`\n${failed} check(s) FAILED`); process.exit(1); }
console.log('\nAll character-builder checks passed.');
