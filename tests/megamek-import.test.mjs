/**
 * megamek-import.test.mjs
 * -----------------------
 * Dependency-free checks for the MegaMek record-sheet importer. The unit files
 * below are made-up test units written in MegaMek's .mtf / .blk formats.
 *
 *   node tests/megamek-import.test.mjs
 *
 * Exits non-zero on failure.
 */
import { parseUnitFile, findWeapon, findAmmo, mechInternalStructure } from '../module/helpers/megamek-import.mjs';

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { console.error('  ✗', msg); failed++; }
  else console.log('  ✓', msg);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const slots = (...names) => [...names, ...Array(12 - names.length).fill('-Empty-')].join('\n');

/* ---- Catalog ---------------------------------------------------------- */
const ml = findWeapon('Medium Laser');
ok(ml && ml.heat === 3 && ml.damage === 5 && eq([ml.s, ml.m, ml.l], [3, 6, 9]), 'IS medium laser: 3 heat, 5 damage, 3/6/9 (not the battle armor version)');
ok(findWeapon('ER Large Laser', { clan: true })?.damage === 10 && findWeapon('ER Large Laser')?.damage === 8, 'a shared display name picks the Clan weapon for Clan units, IS otherwise');
ok(findWeapon('CLERLargeLaser')?.damage === 10 && findWeapon('ISERLargeLaser')?.damage === 8, 'internal names pick the exact weapon (Clan ER LL 10, IS ER LL 8)');
const lrm = findWeapon('LRM 20');
ok(lrm.cluster === 20 && lrm.damage === 1 && lrm.min === 6 && lrm.slots === 5, 'LRM 20: 20 missiles × 1, minimum range 6, 5 slots');
ok(findWeapon('SRM 6').damage === 2 && findWeapon('ISStreakSRM2').streak, 'SRM: 2 per missile; Streak flagged');
ok(findWeapon('Machine Gun').inf === 'burst:2d6', 'machine gun: burst-fire 2D6 against infantry');
ok(findAmmo('IS Ammo AC/20').shots === 5 && findAmmo('IS Ammo LRM-20 Artemis-capable')?.shots === 6, 'ammo shots per ton; munition variants fall back to the base bin');
ok(eq(mechInternalStructure(50), { head: 3, ct: 16, lt: 12, rt: 12, la: 8, ra: 8, ll: 12, rl: 12 }), 'Internal Structure Table, 50 tons');

/* ---- 'Mech (.mtf) ------------------------------------------------------ */
const MTF = `chassis:Testbed
model:TB-1
Config:Biped
techbase:Inner Sphere
era:3025
mass:50
engine:200 Fusion Engine
heat sinks:12 Single
walk mp:4
jump mp:2
armor:Standard(Inner Sphere)
LA armor:12
RA armor:12
LT armor:16
RT armor:16
CT armor:20
HD armor:9
LL armor:16
RL armor:16
RTL armor:4
RTR armor:4
RTC armor:6

Weapons:5
Medium Laser, Left Arm
AC/20, Right Torso
LRM 10, Left Torso
Medium Laser, Center Torso
Machine Gun, Head

Left Arm:
${slots('Shoulder', 'Upper Arm Actuator', 'Lower Arm Actuator', 'Hand Actuator', 'Medium Laser')}

Right Arm:
${slots('Shoulder', 'Upper Arm Actuator', 'Autocannon/20', 'Autocannon/20', 'Autocannon/20', 'Autocannon/20')}

Left Torso:
${slots('LRM 10', 'LRM 10', 'IS Ammo LRM-10', 'Jump Jet', 'CASE')}

Right Torso:
${slots('Autocannon/20', 'Autocannon/20', 'Autocannon/20', 'Autocannon/20', 'Autocannon/20', 'Autocannon/20', 'IS Ammo AC/20', 'IS Ammo AC/20', 'Jump Jet')}

Center Torso:
${slots('Fusion Engine', 'Fusion Engine', 'Fusion Engine', 'Gyro', 'Gyro', 'Gyro', 'Gyro', 'Fusion Engine', 'Fusion Engine', 'Fusion Engine', 'Medium Laser (R)', 'Heat Sink')}

Head:
${slots('Life Support', 'Sensors', 'Cockpit', 'Machine Gun', 'Sensors', 'Life Support')}

Left Leg:
${slots('Hip', 'Upper Leg Actuator', 'Lower Leg Actuator', 'Foot Actuator', 'Heat Sink', 'IS Ammo MG - Half')}

Right Leg:
${slots('Hip', 'Upper Leg Actuator', 'Lower Leg Actuator', 'Foot Actuator', 'Heat Sink', '-Empty-')}

overview:<p>A test unit.</p>
`;
const mech = parseUnitFile(MTF, 'Testbed TB-1.mtf');
const ms = mech.system;
ok(mech.type === 'mech' && mech.name === 'Testbed TB-1', "'Mech file → mech actor, named chassis + model");
ok(ms.tonnage === 50 && ms.weightClass === 'Medium' && eq(ms.movement, { walk: 4, jump: 2 }) && ms.engineRating === 200, 'tonnage, weight class, MP, engine');
ok(eq(ms.heatSinks, { count: 12, type: 'single' }), 'heat sinks');
ok(ms.armor.ctRear.max === 6 && ms.armor.la.value === 12 && ms.structure.ct.max === 16, 'armor (incl. rear) and internal structure');
ok(ms.critSlots.head.length === 6 && ms.critSlots.ll.length === 6 && ms.critSlots.la.length === 12, 'head and legs trimmed to 6 slots');
ok(eq(ms.critSlots.ct.slice(0, 4).map(s => s.type), ['engine', 'engine', 'engine', 'gyro']) && ms.critSlots.lt[4].type === 'case' && ms.critSlots.lt[3].type === 'jumpJet', 'engine / gyro / CASE / jump jet slots');
ok(eq(ms.weapons.map(w => `${w.name}@${w.location}`), ['Medium Laser@LA', 'LRM 10@LT', 'AC/20@RT', 'Medium Laser@CT (R)', 'Machine Gun@HD']), 'weapons in record-sheet order; rear-mounted CT laser; split AC/20 listed in the torso');
const ac = ms.weapons.find(w => w.name === 'AC/20');
ok(ms.critSlots.ra.filter(s => s.type === 'weapon' && s.weaponId === ac.id).length === 4 && ms.critSlots.rt.filter(s => s.type === 'weapon' && s.weaponId === ac.id).length === 6, 'split AC/20: all 10 slots link to one weapon');
ok(ac.ammo === 10 && ac.shotsPerTon === 5 && ac.ammoType === 'AC/20', 'two AC/20 bins → 10 shots');
const mg = ms.weapons.find(w => w.name === 'Machine Gun');
ok(mg.ammo === 100 && mg.shotsPerTon === 200 && mg.infClass === 'burst' && mg.burst === '2d6', 'half-ton MG bin: 100 shots (200 per ton); burst-fire');
ok(ms.critSlots.ll[5].type === 'ammo' && ms.critSlots.ll[5].weaponId === mg.id, 'ammo slot linked to the weapon it feeds');
ok(mech.warnings.length === 0, 'no warnings for a clean unit');
ok(/<h3>Overview<\/h3><p>A test unit\.<\/p>/.test(ms.biography), 'fluff → biography');

/* ---- Vehicle (.blk) ----------------------------------------------------- */
const TANK = `<UnitType>
Tank
</UnitType>
<Name>
Test Tank
</Name>
<Model>
TT-2
</Model>
<type>
IS Level 1
</type>
<motion_type>
Wheeled
</motion_type>
<cruiseMP>
5
</cruiseMP>
<engine_type>
1
</engine_type>
<armor>
20
15
15
10
18
</armor>
<Body Equipment>
IS Ammo SRM-6
</Body Equipment>
<Front Equipment>
Medium Laser
</Front Equipment>
<Turret Equipment>
SRM 6
</Turret Equipment>
<tonnage>
45.0
</tonnage>
`;
const tank = parseUnitFile(TANK, 'Test Tank.blk');
const ts = tank.system;
ok(tank.type === 'ground_vehicle' && tank.name === 'Test Tank TT-2', 'Tank → ground vehicle');
ok(ts.movementType === 'wheeled' && ts.movement.cruise === 5 && ts.engineType === 'ICE' && ts.weightClass === 'Medium', 'motion, cruise MP, ICE engine, weight class');
ok(ts.hasTurret && ts.armor.turret.max === 18 && ts.armor.right.max === 15 && ts.structure.max === 5, 'armor order front / right / left / rear / turret; structure ⌈45/10⌉');
ok(eq(ts.weapons.map(w => `${w.name}@${w.location}:${w.ammo}`), ['Medium Laser@Front:0', 'SRM 6@Turret:15']), 'weapons by location, ammo from the body');

// Special equipment on a vehicle lands in its gear record (tw-gear.mjs), not the "no effect" warning.
const tank2 = parseUnitFile(TANK.replace('IS Ammo SRM-6\n', 'IS Ammo SRM-6\nSupercharger\nGuardian ECM Suite\nC3 Slave Unit\n'), 'Test Tank 2.blk');
ok(tank2.system.gear?.supercharger === true && tank2.system.gear.ecm === 'guardian' && tank2.system.gear.c3 === 'slave', 'vehicle gear: supercharger, Guardian ECM, C3 slave');
ok(!tank2.warnings.some(w => /no automated effect/.test(w) && /Supercharger|ECM|C3/.test(w)), 'recognised gear is not reported as having no effect');

// Special munitions keep their own count on the weapon (tw-weapons.mjs MUNITIONS).
const tank3 = parseUnitFile(TANK.replace('IS Ammo SRM-6\n', 'IS Ammo SRM-6\nIS Ammo SRM-6 Inferno\n'), 'Test Tank 3.blk');
const srm3 = tank3.system.weapons.find(w => w.name === 'SRM 6');
ok(srm3?.ammo === 15 && srm3.infernoAmmo === 15, 'inferno SRM bin → infernoAmmo, standard rounds kept apart');
const tank4 = parseUnitFile(TANK.replace('IS Ammo SRM-6\n', 'IS Ammo SRM-6 Inferno\n'), 'Test Tank 4.blk');
const srm4 = tank4.system.weapons.find(w => w.name === 'SRM 6');
ok(srm4?.ammo === 0 && srm4.infernoAmmo === 15 && /SRM 6/.test(srm4.ammoType), 'only infernos carried: no standard rounds');

/* ---- Aerospace fighter ------------------------------------------------- */
const FIGHTER = `<UnitType>
AeroSpaceFighter
</UnitType>
<Name>
Test Fighter
</Name>
<type>
Clan Level 2
</type>
<SafeThrust>
7
</SafeThrust>
<heatsinks>
14
</heatsinks>
<sink_type>
1
</sink_type>
<fuel>
320
</fuel>
<armor>
25
18
18
12
</armor>
<Nose Equipment>
ER Medium Laser
</Nose Equipment>
<tonnage>
45.0
</tonnage>
`;
const ftr = parseUnitFile(FIGHTER, 'Test Fighter.blk');
const fs = ftr.system;
ok(ftr.type === 'aerospace_fighter' && eq(fs.thrust, { safe: 7, max: 11 }) && fs.structuralIntegrity.max === 7, 'fighter: thrust 7/11, SI = max(⌊45/10⌋, 7)');
ok(fs.armor.nose.threshold === 3 && fs.armor.aft.threshold === 2 && fs.heatSinks.type === 'double', 'thresholds ⌈armor/10⌉, double heat sinks');
ok(fs.weapons[0].damage === 7 && fs.weapons[0].aeroRange === 'medium' && fs.weapons[0].location === 'Nose', 'Clan ER medium laser, aerospace range bracket');

/* ---- Battle armor ------------------------------------------------------ */
const BA = `<UnitType>
BattleArmor
</UnitType>
<Name>
Test Suit
</Name>
<type>
IS Level 2
</type>
<motion_type>
Jump
</motion_type>
<cruiseMP>
1
</cruiseMP>
<armor_type>
32
</armor_type>
<Squad Equipment>
ISBAMachineGun:RA
ISBASRM2:Body
BA-SRM2 Ammo:Body:Shots2#
BAAPMount:LA
InfantryAssaultRifle:APM:LA
BABasicManipulator:LA
BABasicManipulator:RA
BAMagneticClamp:Body
</Squad Equipment>
<chassis>
biped
</chassis>
<jumpingMP>
3
</jumpingMP>
<armor>
7
</armor>
<Trooper Count>
4
</Trooper Count>
<weightclass>
2
</weightclass>
`;
const ba = parseUnitFile(BA, 'Test Suit.blk');
const bs = ba.system;
ok(ba.type === 'battle_armor' && bs.squadSize === 4 && bs.armorValue === 7 && bs.weightClass === 'medium' && bs.techBase === 'is', 'battle armor: troopers, armor, weight, tech base');
ok(eq(bs.movement, { ground: 1, jump: 3, vtol: 0, umu: 0 }) && eq(bs.manipulators, { left: 'basic', right: 'basic' }), 'movement and manipulators');
ok(bs.equipment.stealth === 'standard' && bs.equipment.magneticClamps && bs.equipment.bodyMissiles, 'standard stealth, magnetic clamps, IS body-mounted missiles');
const srm2 = bs.weapons.find(w => w.clusterSize === 2);
ok(srm2 && srm2.location === 'body' && srm2.ammo === 2, 'SRM 2 in the body with 2 shots');
ok(bs.weapons.some(w => w.ap) && bs.weapons.some(w => w.location === 'arm' && /Machine Gun/.test(w.name)), 'AP weapon and arm-mounted machine gun');

/* ---- Conventional infantry -------------------------------------------- */
const INF = `<UnitType>
Infantry
</UnitType>
<Name>
Test Platoon
</Name>
<type>
IS Level 2
</type>
<motion_type>
Jump
</motion_type>
<squad_size>
7
</squad_size>
<squadn>
3
</squadn>
<Primary>
Rifle (Auto)
</Primary>
<Secondary>
InfantrySRM
</Secondary>
<secondn>
2
</secondn>
`;
const inf = parseUnitFile(INF, 'Test Platoon.blk');
ok(inf.type === 'infantry' && inf.system.troopers.value === 21 && inf.system.platoonType === 'jump' && inf.system.weaponType === 'srm', 'platoon: 3 × 7 troopers, jump, SRM (secondary weapon)');
ok(eq(inf.system.movement, { ground: 1, jump: 2 }), 'MP from the generic platoon table');

/* ---- Unsupported ------------------------------------------------------- */
let threw = null;
try { parseUnitFile('<UnitType>\nDropship\n</UnitType>\n', 'Big.blk'); } catch (e) { threw = e.message; }
ok(/Unsupported unit type/.test(threw || ''), 'DropShips are refused with a clear message');

console.log(failed ? `\n${failed} FAILED` : '\nAll MegaMek import checks passed.');
process.exit(failed ? 1 : 0);
