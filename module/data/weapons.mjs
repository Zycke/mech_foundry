/**
 * weapons.mjs
 * -----------
 * Canonical seed data for the Weapons compendium, transcribed from the
 * A Time of War EQUIPMENT chapter. On first load the seeder
 * (helpers/weapon-seeder.mjs) imports these into the `mech-foundry.weapons`
 * pack as editable `weapon` Items, grouped into folders by Skill and then by
 * weapon sub-category (e.g. Small Arms › Ballistic). Like the other reference
 * compendia this file is only the initial content, never the live source of
 * truth once a world is seeded.
 *
 * Each raw record mirrors the ATOW weapon-table columns:
 *   ITEM | EQUIPMENT RATINGS | AP/BD | RANGE | SHOTS | COST/RELOAD | AFF |
 *   MASS/RELOAD | NOTES
 * and is expanded by `toWeaponSeed()` into a { skill, category, item } entry
 * matching the template.json `weapon` schema.
 */

const IMG = 'icons/weapons/guns/gun-pistol-flintlock-metal.webp';

/** Convert a raw firing-mode record into a stored mode profile. Ranges are given
 *  as [short, medium, long, extreme]; only present fields are carried. */
function toMode(m) {
  const range = Array.isArray(m.range) ? m.range : null;
  const out = { name: m.name || 'Mode' };
  if (m.ap != null) out.ap = m.ap;
  if (m.apFactor != null) out.apFactor = m.apFactor;
  if (m.bd != null) out.bd = m.bd;
  if (m.bdFactor != null) out.bdFactor = m.bdFactor;
  if (range) out.range = { short: range[0] ?? '', medium: range[1] ?? '', long: range[2] ?? '', extreme: range[3] ?? '' };
  if (m.shots != null) out.shots = m.shots;
  if (m.pps != null) out.pps = m.pps;
  if (m.burst != null) out.burst = m.burst;
  if (m.recoil != null) out.recoil = m.recoil;
  if (m.subduing != null) out.subduing = !!m.subduing;
  if (m.switchAction) out.switchAction = m.switchAction;
  if (m.notes) out.notes = m.notes;
  return out;
}

/**
 * Expand a raw ATOW weapon record into a seed entry.
 * @param {object} r  raw record (see SMALL_ARMS below)
 * @returns {{ skill: string, category: string, item: object }}
 */
export function toWeaponSeed(r) {
  const range = Array.isArray(r.range) ? r.range : [];
  const notes = r.notes && r.notes !== '—' ? r.notes : '';
  const weaponType = r.weaponType || 'smallarms';
  const isMelee = weaponType === 'melee';
  return {
    skill: r.skill || 'Small Arms',
    category: r.subCategory || 'Other',
    item: {
      name: r.name,
      img: r.img || IMG,
      type: 'weapon',
      system: {
        description: r.description || '',
        equipmentRating: r.ar || '',
        cost: r.cost ?? 0,
        affiliation: r.aff || '',
        mass: r.massKg ?? 0,
        notes,
        carryStatus: 'carried',
        itemEffects: [],
        weaponType,
        skill: r.skill || 'Small Arms',
        ap: r.ap ?? 0,
        apFactor: r.apFactor || 'B',
        bd: r.bd ?? 0,
        bdFactor: r.bdFactor || '',
        subduing: !!r.subduing,
        recoil: r.recoil ?? 0,
        burstRating: r.burst ?? 0,
        range: {
          // Point-Blank is the universal "within 1 metre" band (ATOW p.190,
          // +1 to hit); ranged weapons carry it, melee weapons do not.
          pointBlank: isMelee ? '' : 1,
          short: range[0] ?? '',
          medium: range[1] ?? '',
          long: range[2] ?? '',
          extreme: range[3] ?? ''
        },
        ammo: { value: r.shots ?? 0, max: r.shots ?? 0 },
        reloadCost: r.reloadCost ?? 0,
        // Table reload mass is in grams; store kilograms to match `mass`.
        reloadMass: r.reloadMassG != null ? Math.round((r.reloadMassG / 1000) * 1000) / 1000 : 0,
        loadedAmmo: null,
        loadedAmmoName: '',
        loadedAmmoCategory: '',
        pps: r.pps ?? 0,
        ammoCompatibility: r.ammoCompatibility || [],
        // Multi-mode weapons: one profile per firing mode; the active mode's
        // stats are overlaid onto the fields above at prepare time.
        modes: Array.isArray(r.modes) ? r.modes.map(toMode) : [],
        activeMode: 0,
        animation: '',
        animationDelay: 50,
        animationDuration: 0
      },
      // Skill/category/group are surfaced in flags so the sheet or other tooling
      // can read them; the seeder uses skill+category to build the folder tree.
      flags: { 'mech-foundry': { skill: r.skill || 'Small Arms', category: r.subCategory || 'Other', group: r.skillGroup || '' } }
    }
  };
}

/**
 * Small Arms (ATOW pp. 263-267). Skill: Small Arms. All `ranged`.
 * Records mirror the table columns; see toWeaponSeed() for field meanings.
 * (Populated from the EQUIPMENT chapter extraction.)
 */
export const SMALL_ARMS = [
  {"name":"Auto-Pistol","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/A-A-A/C","ap":3,"apFactor":"B","bd":4,"bdFactor":"","range":[5,20,45,105],"shots":10,"cost":50,"reloadCost":2,"aff":"","massKg":0.5,"reloadMassG":140,"burst":null,"recoil":null,"notes":"*"},
  {"name":"Auto-Pistol (Hawk Eagle)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/X-F-C/C","ap":4,"apFactor":"B","bd":3,"bdFactor":"B","range":[5,20,50,100],"shots":15,"cost":100,"reloadCost":10,"aff":"FW","massKg":0.5,"reloadMassG":110,"burst":3,"recoil":-1,"notes":"BURST: 3; RECOIL: -1"},
  {"name":"Auto-Pistol (Magnum)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/A-A-B/D","ap":3,"apFactor":"B","bd":5,"bdFactor":"","range":[5,20,50,120],"shots":10,"cost":75,"reloadCost":4,"aff":"","massKg":0.5,"reloadMassG":140,"burst":null,"recoil":null,"notes":"-1 to attack roll*"},
  {"name":"Auto-Pistol (M&G Service Auto)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/C-B-C/C","ap":3,"apFactor":"B","bd":4,"bdFactor":"","range":[5,20,40,85],"shots":8,"cost":60,"reloadCost":3,"aff":"LA","massKg":0.65,"reloadMassG":110,"burst":null,"recoil":null,"notes":""},
  {"name":"Auto-Pistol (Nambu)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/B-C-C/C","ap":3,"apFactor":"B","bd":4,"bdFactor":"","range":[5,25,50,110],"shots":12,"cost":75,"reloadCost":2,"aff":"DC","massKg":0.45,"reloadMassG":160,"burst":null,"recoil":null,"notes":"*"},
  {"name":"Auto-Pistol (Serrek 7875D)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/X-C-B/C","ap":3,"apFactor":"B","bd":3,"bdFactor":"","range":[5,25,50,120],"shots":16,"cost":185,"reloadCost":3,"aff":"FS","massKg":0.4,"reloadMassG":160,"burst":null,"recoil":null,"notes":"+1 to attack and Service rolls"},
  {"name":"Auto-Pistol (Sternsnacht Python)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/X-X-C/D","ap":4,"apFactor":"B","bd":4,"bdFactor":"","range":[5,15,40,80],"shots":12,"cost":125,"reloadCost":4,"aff":"","massKg":0.75,"reloadMassG":160,"burst":null,"recoil":null,"notes":"*"},
  {"name":"Semi-Auto (TK Enforcer)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/X-X-B/C","ap":3,"apFactor":"B","bd":3,"bdFactor":"B","range":[7,25,55,140],"shots":20,"cost":110,"reloadCost":3,"aff":"LA","massKg":1.6,"reloadMassG":200,"burst":4,"recoil":-1,"notes":"BURST: 4; RECOIL: -1*"},
  {"name":"Pistol (Hold-Out)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"B/A-A-B/E","ap":3,"apFactor":"B","bd":3,"bdFactor":"","range":[2,5,8,20],"shots":2,"cost":20,"reloadCost":1,"aff":"","massKg":0.2,"reloadMassG":20,"burst":null,"recoil":null,"notes":""},
  {"name":"Pistol (Sternsnacht Claymore)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/X-E-D/D","ap":3,"apFactor":"B","bd":6,"bdFactor":"","range":[5,15,38,70],"shots":3,"cost":200,"reloadCost":1,"aff":"","massKg":2.5,"reloadMassG":90,"burst":null,"recoil":null,"notes":"Range modifiers: +0/-3/-6/-11"},
  {"name":"Pistol (Makeshift)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"B/A-A-A/C","ap":3,"apFactor":"B","bd":4,"bdFactor":"","range":[5,15,30,65],"shots":1,"cost":15,"reloadCost":1,"aff":"PER","massKg":1,"reloadMassG":10,"burst":null,"recoil":null,"notes":"-1 to attack roll**"},
  {"name":"Revolver","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/A-A-A/C","ap":4,"apFactor":"B","bd":4,"bdFactor":"","range":[8,18,40,90],"shots":6,"cost":40,"reloadCost":1,"aff":"","massKg":0.5,"reloadMassG":60,"burst":null,"recoil":null,"notes":""},
  {"name":"Revolver (Magnum)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"C/B-B-B/D","ap":4,"apFactor":"B","bd":5,"bdFactor":"","range":[8,18,45,100],"shots":5,"cost":60,"reloadCost":3,"aff":"","massKg":0.5,"reloadMassG":60,"burst":null,"recoil":null,"notes":"-1 to attack roll"},
  {"name":"Harpoon Gun (Pequod, Mk. 1)","subCategory":"Ballistic","skillGroup":"Pistols","ar":"B/D-C-B/C","ap":3,"apFactor":"B","bd":3,"bdFactor":"","range":[8,12,25,30],"shots":1,"cost":350,"reloadCost":2,"aff":"TC","massKg":2.3,"reloadMassG":135,"burst":null,"recoil":null,"notes":"Fires grappling cable; +4 to Climbing Skill w/cable engaged; Simple Action to disengage cable; no modifier to use underwater"},
  {"name":"Auto-Pistol (Mydron)","subCategory":"Ballistic","skillGroup":"SMGs","ar":"C/C-B-B/E","ap":3,"apFactor":"B","bd":2,"bdFactor":"B","range":[6,22,40,90],"shots":20,"cost":100,"reloadCost":4,"aff":"","massKg":1.5,"reloadMassG":140,"burst":6,"recoil":-1,"notes":"BURST: 6; RECOIL: -1*"},
  {"name":"Auto-Pistol (Stetta)","subCategory":"Ballistic","skillGroup":"SMGs","ar":"D/X-F-C/E","ap":3,"apFactor":"B","bd":2,"bdFactor":"B","range":[3,10,20,50],"shots":100,"cost":150,"reloadCost":10,"aff":"","massKg":2,"reloadMassG":680,"burst":10,"recoil":-1,"notes":"BURST: 10; RECOIL: -1*"},
  {"name":"Machine Pistol (Martial Eagle)","subCategory":"Ballistic","skillGroup":"SMGs","ar":"D/X-F-D/E","ap":3,"apFactor":"B","bd":3,"bdFactor":"B","range":[5,20,50,100],"shots":30,"cost":180,"reloadCost":20,"aff":"FW","massKg":1.8,"reloadMassG":250,"burst":10,"recoil":-1,"notes":"BURST: 10; RECOIL: -1"},
  {"name":"Submachine Gun","subCategory":"Ballistic","skillGroup":"SMGs","ar":"C/A-A-A/D","ap":3,"apFactor":"B","bd":3,"bdFactor":"B","range":[5,16,35,80],"shots":50,"cost":80,"reloadCost":5,"aff":"","massKg":3,"reloadMassG":570,"burst":10,"recoil":-1,"notes":"BURST: 10; RECOIL: -1*"},
  {"name":"SMG (Gunther MP-20)","subCategory":"Ballistic","skillGroup":"SMGs","ar":"C/X-E-C/D","ap":4,"apFactor":"B","bd":3,"bdFactor":"B","range":[4,12,30,50],"shots":30,"cost":125,"reloadCost":5,"aff":"LA","massKg":2.5,"reloadMassG":340,"burst":10,"recoil":-1,"notes":"BURST: 10; RECOIL: -1*"},
  {"name":"SMG (Imperator 2894A1)","subCategory":"Ballistic","skillGroup":"SMGs","ar":"C/X-C-B/D","ap":4,"apFactor":"B","bd":2,"bdFactor":"B","range":[5,18,40,85],"shots":50,"cost":100,"reloadCost":5,"aff":"","massKg":4,"reloadMassG":380,"burst":10,"recoil":-1,"notes":"BURST: 10; RECOIL: -1*"},
  {"name":"SMG (KA-23 Subgun)","subCategory":"Ballistic","skillGroup":"SMGs","ar":"D/X-C-D/E","ap":4,"apFactor":"B","bd":2,"bdFactor":"B","range":[6,20,45,100],"shots":40,"cost":250,"reloadCost":6,"aff":"DC","massKg":2.5,"reloadMassG":300,"burst":10,"recoil":-1,"notes":"BURST: 10; RECOIL: -1*"},
  {"name":"SMG (Rorynex RM-3/XXI)","subCategory":"Ballistic","skillGroup":"SMGs","ar":"D/C-B-C/E","ap":3,"apFactor":"B","bd":2,"bdFactor":"B","range":[3,12,28,60],"shots":100,"cost":80,"reloadCost":10,"aff":"","massKg":3,"reloadMassG":760,"burst":15,"recoil":-1,"notes":"BURST: 15; RECOIL: -1*"},
  {"name":"SMG (Rugan)","subCategory":"Ballistic","skillGroup":"SMGs","ar":"C/D-B-C/E","ap":3,"apFactor":"B","bd":2,"bdFactor":"B","range":[4,15,30,70],"shots":80,"cost":100,"reloadCost":8,"aff":"","massKg":3.5,"reloadMassG":610,"burst":15,"recoil":-1,"notes":"BURST: 15; RECOIL: -1*"},
  {"name":"Rifle (Automatic)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"C/A-A-A/D","ap":4,"apFactor":"B","bd":4,"bdFactor":"B","range":[30,75,170,415],"shots":30,"cost":80,"reloadCost":2,"aff":"","massKg":4,"reloadMassG":480,"burst":15,"recoil":-1,"notes":"BURST: 15; RECOIL: -1*"},
  {"name":"Rifle (Bolt-Action)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"B/A-A-A/B","ap":4,"apFactor":"B","bd":4,"bdFactor":"","range":[40,115,225,500],"shots":5,"cost":60,"reloadCost":1,"aff":"","massKg":3,"reloadMassG":60,"burst":null,"recoil":null,"notes":"Simple Action to chamber next round"},
  {"name":"Rifle (Federated Long)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"C/X-C-A/D","ap":4,"apFactor":"B","bd":5,"bdFactor":"","range":[35,85,205,450],"shots":10,"cost":120,"reloadCost":3,"aff":"","massKg":5,"reloadMassG":150,"burst":null,"recoil":null,"notes":""},
  {"name":"Rifle (Imperator AX-22 Assault)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"C/X-X-B/D","ap":4,"apFactor":"B","bd":4,"bdFactor":"B","range":[30,80,185,435],"shots":15,"cost":200,"reloadCost":3,"aff":"","massKg":3.5,"reloadMassG":240,"burst":15,"recoil":-1,"notes":"BURST: 15; RECOIL: -1"},
  {"name":"Rifle (M&G G-150)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"C/X-X-C/D","ap":4,"apFactor":"B","bd":4,"bdFactor":"B","range":[45,95,215,460],"shots":9,"cost":270,"reloadCost":5,"aff":"LA","massKg":3.5,"reloadMassG":150,"burst":3,"recoil":null,"notes":"BURST: 3; detachable telescope*"},
  {"name":"Rifle (Makeshift)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"B/A-A-A/B","ap":4,"apFactor":"B","bd":4,"bdFactor":"","range":[20,65,140,300],"shots":1,"cost":20,"reloadCost":1,"aff":"PER","massKg":6,"reloadMassG":20,"burst":null,"recoil":null,"notes":"-1 to attack roll**"},
  {"name":"Rifle (TK Assault)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"C/X-C-A/D","ap":4,"apFactor":"B","bd":4,"bdFactor":"B","range":[25,70,160,410],"shots":20,"cost":150,"reloadCost":3,"aff":"LA","massKg":5.5,"reloadMassG":320,"burst":10,"recoil":-1,"notes":"BURST 10; RECOIL: -1"},
  {"name":"Rifle (Zeus Heavy)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"C/C-B-B/D","ap":5,"apFactor":"B","bd":5,"bdFactor":"","range":[35,80,190,420],"shots":5,"cost":200,"reloadCost":3,"aff":"LA","massKg":8,"reloadMassG":80,"burst":null,"recoil":null,"notes":""},
  {"name":"Elephant Gun","subCategory":"Ballistic","skillGroup":"Rifles","ar":"B/B-C-C/C","ap":5,"apFactor":"B","bd":6,"bdFactor":"","range":[20,60,160,400],"shots":2,"cost":100,"reloadCost":2,"aff":"PER","massKg":5,"reloadMassG":40,"burst":null,"recoil":null,"notes":"-2 to attack roll"},
  {"name":"Sniper Rifle","subCategory":"Ballistic","skillGroup":"Rifles","ar":"B/C-C-C/D","ap":5,"apFactor":"B","bd":4,"bdFactor":"","range":[45,150,340,700],"shots":5,"cost":350,"reloadCost":4,"aff":"","massKg":10,"reloadMassG":60,"burst":null,"recoil":null,"notes":"Simple Action to chamber next round"},
  {"name":"Sniper Rifle (Minolta 9000)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"D/X-X-E/F","ap":5,"apFactor":"B","bd":4,"bdFactor":"","range":[50,160,360,730],"shots":10,"cost":1000,"reloadCost":5,"aff":"CC","massKg":6,"reloadMassG":120,"burst":null,"recoil":null,"notes":""},
  {"name":"Harpoon Gun (Pequod, Mk. 2)","subCategory":"Ballistic","skillGroup":"Rifles","ar":"C/F-D-B/D","ap":4,"apFactor":"B","bd":4,"bdFactor":"","range":[18,35,65,90],"shots":2,"cost":700,"reloadCost":5,"aff":"TC","massKg":4.1,"reloadMassG":360,"burst":null,"recoil":null,"notes":"Wireless; no modifier to use underwater"},
  {"name":"Federated-Barrett M42B","subCategory":"Ballistic","skillGroup":"Rifles","ar":"C/X-X-D/E","ap":4,"apFactor":"B","bd":5,"bdFactor":"B","range":[30,75,180,430],"shots":50,"cost":1385,"reloadCost":12,"aff":"FS","massKg":6,"reloadMassG":300,"burst":10,"recoil":-1,"notes":"Reconfigurable battle rifle with an integral 5-shot compact grenade launcher. Its Lt. Machine Gun mode uses the Light Machine Gun support-weapon profile (see Support Weapons).","modes":[{"name":"Standard","ap":4,"apFactor":"B","bd":5,"bdFactor":"B","range":[30,75,180,430],"shots":50,"burst":10,"recoil":-1,"switchAction":"2 Complex Actions + Skill check","notes":"Laser sight; 5-shot compact grenade launcher"},{"name":"Close-In","ap":3,"apFactor":"B","bd":4,"bdFactor":"B","range":[20,50,120,280],"shots":50,"burst":5,"recoil":-1,"switchAction":"2 Complex Actions + Skill check","notes":"Sound/flash suppressor; 5-shot compact grenade launcher"}]},
  {"name":"Laser Pistol","subCategory":"Energy","skillGroup":"Pistols","ar":"D/B-A-A/D","ap":4,"apFactor":"E","bd":3,"bdFactor":"","range":[15,35,80,225],"shots":null,"pps":2,"cost":750,"reloadCost":null,"aff":"","massKg":1,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Blazer Pistol","subCategory":"Energy","skillGroup":"Pistols","ar":"D/C-C-D/E","ap":5,"apFactor":"E","bd":3,"bdFactor":"","range":[15,40,90,240],"shots":null,"pps":8,"cost":3000,"reloadCost":null,"aff":"FW","massKg":2,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"ER Laser Pistol","subCategory":"Energy","skillGroup":"Pistols","ar":"F/X-D-C/D","ap":4,"apFactor":"E","bd":3,"bdFactor":"","range":[20,50,120,300],"shots":null,"pps":3,"cost":1000,"reloadCost":null,"aff":"CLAN","massKg":1,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Holdout Laser Pistol","subCategory":"Energy","skillGroup":"Pistols","ar":"D/B-B-B/D","ap":4,"apFactor":"E","bd":2,"bdFactor":"","range":[10,22,50,120],"shots":null,"pps":3,"cost":100,"reloadCost":null,"aff":"FW","massKg":0.05,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Laser Pistol (White Dwarf)","subCategory":"Energy","skillGroup":"Pistols","ar":"D/X-X-C/E","ap":4,"apFactor":"E","bd":3,"bdFactor":"","range":[10,25,60,150],"shots":1,"pps":0,"cost":250,"reloadCost":null,"aff":"FW","massKg":0.25,"reloadMassG":null,"burst":null,"recoil":null,"notes":"One shot; -3 to Perception check roll to notice beam"},
  {"name":"Nakjima Hand Laser","subCategory":"Energy","skillGroup":"Pistols","ar":"D/X-D-C/D","ap":5,"apFactor":"E","bd":2,"bdFactor":"","range":[20,40,100,250],"shots":null,"pps":1,"cost":750,"reloadCost":null,"aff":"DC","massKg":1,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Nova Laser Pistol","subCategory":"Energy","skillGroup":"Pistols","ar":"E/X-X-D/E","ap":3,"apFactor":"E","bd":5,"bdFactor":"","range":[8,20,40,100],"shots":null,"pps":10,"cost":1250,"reloadCost":null,"aff":"FW","massKg":1.5,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Sunbeam Laser Pistol","subCategory":"Energy","skillGroup":"Pistols","ar":"D/X-F-D/E","ap":4,"apFactor":"E","bd":4,"bdFactor":"","range":[15,30,65,200],"shots":null,"pps":4,"cost":750,"reloadCost":null,"aff":"FW","massKg":1,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Pulse Laser Pistol","subCategory":"Energy","skillGroup":"Pistols","ar":"D/B-F-C/D","ap":3,"apFactor":"E","bd":2,"bdFactor":"B","range":[12,30,70,195],"shots":null,"pps":2,"cost":1000,"reloadCost":null,"aff":"","massKg":1,"reloadMassG":null,"burst":5,"recoil":0,"notes":"BURST 5; RECOIL 0"},
  {"name":"Pulse Laser Pistol, Clan","subCategory":"Energy","skillGroup":"Pistols","ar":"F/X-C-C/D","ap":3,"apFactor":"E","bd":3,"bdFactor":"B","range":[15,35,80,200],"shots":null,"pps":3,"cost":1500,"reloadCost":null,"aff":"CLAN","massKg":1,"reloadMassG":null,"burst":5,"recoil":0,"notes":"BURST 5; RECOIL 0"},
  {"name":"Laser Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"D/C-B-B/D","ap":4,"apFactor":"E","bd":4,"bdFactor":"","range":[60,205,465,1100],"shots":null,"pps":5,"cost":1250,"reloadCost":null,"aff":"","massKg":5,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Laser Rifle (Maxell PL-10)","subCategory":"Energy","skillGroup":"Rifles","ar":"D/X-X-C/D","ap":5,"apFactor":"E","bd":3,"bdFactor":"","range":[55,200,460,1050],"shots":null,"pps":5,"cost":2000,"reloadCost":null,"aff":"LA","massKg":6.5,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Blazer Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"D/C-C-D/E","ap":5,"apFactor":"E","bd":4,"bdFactor":"","range":[65,220,485,1180],"shots":null,"pps":10,"cost":2190,"reloadCost":null,"aff":"","massKg":7,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Marx XX Laser Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"D/D-E-D/D","ap":5,"apFactor":"E","bd":3,"bdFactor":"","range":[75,250,500,1150],"shots":null,"pps":6,"cost":1750,"reloadCost":null,"aff":"","massKg":6,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Ebony Assault Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"F/X-X-E/F","ap":4,"apFactor":"E","bd":3,"bdFactor":"","range":[65,200,475,1000],"shots":null,"pps":8,"cost":8500,"reloadCost":null,"aff":"MC","massKg":10,"reloadMassG":null,"burst":null,"recoil":null,"notes":"Variable-power laser rifle; a Simple Action switches the beam setting.","modes":[{"name":"Standard","ap":4,"apFactor":"E","bd":3,"range":[65,200,475,1000],"pps":8,"switchAction":"Simple Action"},{"name":"High-Power","ap":5,"apFactor":"E","bd":4,"range":[50,160,350,700],"pps":12,"switchAction":"Simple Action"},{"name":"Extended-Range","ap":3,"apFactor":"E","bd":2,"range":[80,260,610,1200],"pps":4,"switchAction":"Simple Action"}]},
  {"name":"Intek Laser Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"D/X-D-D/D","ap":4,"apFactor":"E","bd":3,"bdFactor":"","range":[80,275,550,1200],"shots":null,"pps":2,"cost":1250,"reloadCost":null,"aff":"FW","massKg":5,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Magna Laser Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"D/C-C-D/D","ap":3,"apFactor":"E","bd":5,"bdFactor":"","range":[50,190,440,1000],"shots":null,"pps":5,"cost":1500,"reloadCost":null,"aff":"DC","massKg":6,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"M61A Combat System","subCategory":"Energy","skillGroup":"Rifles","ar":"E/X-X-D/E","ap":4,"apFactor":"E","bd":4,"bdFactor":"","range":[70,225,480,1100],"shots":null,"pps":5,"cost":7150,"reloadCost":null,"aff":"FS","massKg":9,"reloadMassG":null,"burst":null,"recoil":null,"notes":"Includes laser sight and 5-shot compact grenade launcher"},
  {"name":"Mauser 960 Assault System","subCategory":"Energy","skillGroup":"Rifles","ar":"E/C-F-D/D","ap":3,"apFactor":"E","bd":3,"bdFactor":"B","range":[55,170,365,740],"shots":null,"pps":2,"cost":8000,"reloadCost":null,"aff":"CS","massKg":10.5,"reloadMassG":null,"burst":10,"recoil":0,"notes":"BURST 10; RECOIL 0; includes detachable vibroblade and 6-shot compact grenade launcher"},
  {"name":"Mauser 1200 LSS","subCategory":"Energy","skillGroup":"Rifles","ar":"E/X-X-E/E","ap":4,"apFactor":"E","bd":4,"bdFactor":"B","range":[55,170,365,740],"shots":null,"pps":5,"cost":10000,"reloadCost":null,"aff":"CS","massKg":11,"reloadMassG":null,"burst":5,"recoil":0,"notes":"BURST 5; RECOIL 0; includes detachable vibroblade and 6-shot compact grenade launcher"},
  {"name":"Mauser IIC IAS","subCategory":"Energy","skillGroup":"Rifles","ar":"F/X-F-E/F","ap":4,"apFactor":"E","bd":5,"bdFactor":"","range":[90,300,700,1400],"shots":null,"pps":5,"cost":18000,"reloadCost":null,"aff":"CLAN","massKg":12,"reloadMassG":null,"burst":null,"recoil":null,"notes":"Encumbering; includes detachable vibroblade and 5-shot grenade launcher"},
  {"name":"ER Laser Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"F/X-D-D/D","ap":4,"apFactor":"E","bd":4,"bdFactor":"","range":[90,300,700,1400],"shots":null,"pps":5,"cost":2000,"reloadCost":null,"aff":"CLAN","massKg":5,"reloadMassG":null,"burst":null,"recoil":null,"notes":""},
  {"name":"Pulse Laser Rifle, Clan","subCategory":"Energy","skillGroup":"Rifles","ar":"F/X-E-D/D","ap":3,"apFactor":"E","bd":4,"bdFactor":"B","range":[60,180,400,800],"shots":null,"pps":5,"cost":2000,"reloadCost":null,"aff":"CLAN","massKg":6,"reloadMassG":null,"burst":10,"recoil":0,"notes":"BURST 10; RECOIL 0"},
  {"name":"Pulse Laser Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"D/D-E-C/D","ap":3,"apFactor":"E","bd":3,"bdFactor":"B","range":[40,130,275,595],"shots":null,"pps":4,"cost":2000,"reloadCost":null,"aff":"","massKg":5,"reloadMassG":null,"burst":10,"recoil":0,"notes":"BURST 10; RECOIL 0"},
  {"name":"Starfire ER Laser Rifle","subCategory":"Energy","skillGroup":"Rifles","ar":"E/X-X-E/E","ap":4,"apFactor":"E","bd":4,"bdFactor":"","range":[85,285,625,1300],"shots":null,"pps":6,"cost":2500,"reloadCost":null,"aff":"FW","massKg":5,"reloadMassG":null,"burst":null,"recoil":null,"notes":"Recharge: 1; -3 to Perception check roll to notice beam"},
  {"name":"Needler Pistol","subCategory":"Flechette","skillGroup":"Pistols","ar":"D/A-A-A/D","ap":2,"apFactor":"B","bd":5,"bdFactor":"S","range":[2,6,12,20],"shots":10,"cost":50,"reloadCost":1,"aff":"","massKg":0.3,"reloadMassG":70,"burst":null,"recoil":null,"notes":"Needler"},
  {"name":"Needler Pistol (Hold-Out)","subCategory":"Flechette","skillGroup":"Pistols","ar":"D/C-B-B/E","ap":2,"apFactor":"B","bd":5,"bdFactor":"S","range":[2,4,6,12],"shots":5,"cost":20,"reloadCost":null,"aff":"","massKg":0.05,"reloadMassG":null,"burst":null,"recoil":null,"notes":"Needler; cannot be reloaded"},
  {"name":"Needler Pistol (Sea Eagle)","subCategory":"Flechette","skillGroup":"Pistols","ar":"D/X-F-D/D","ap":1,"apFactor":"B","bd":4,"bdFactor":"BS","range":[2,5,10,20],"shots":10,"cost":110,"reloadCost":5,"aff":"FW","massKg":0.35,"reloadMassG":100,"burst":5,"recoil":-1,"notes":"Needler; BURST 5; RECOIL -1"},
  {"name":"M&G Flechette Pistol","subCategory":"Flechette","skillGroup":"Pistols","ar":"D/B-B-C/E","ap":1,"apFactor":"B","bd":4,"bdFactor":"BS","range":[2,5,10,20],"shots":15,"cost":100,"reloadCost":4,"aff":"LA","massKg":0.65,"reloadMassG":170,"burst":5,"recoil":-1,"notes":"Needler; BURST 5; RECOIL -1"},
  {"name":"Automatic Shotgun","subCategory":"Flechette","skillGroup":"Rifles","ar":"C/B-B-C/D","ap":2,"apFactor":"B","bd":5,"bdFactor":"BS","range":[4,10,20,45],"shots":12,"cost":200,"reloadCost":2,"aff":"","massKg":5,"reloadMassG":270,"burst":5,"recoil":-1,"notes":"BURST 5; RECOIL -1"},
  {"name":"Combat Shotgun","subCategory":"Flechette","skillGroup":"Rifles","ar":"C/B-B-B/D","ap":3,"apFactor":"B","bd":5,"bdFactor":"S","range":[5,12,24,50],"shots":8,"cost":175,"reloadCost":2,"aff":"","massKg":4.5,"reloadMassG":140,"burst":null,"recoil":null,"notes":""},
  {"name":"Double-Barreled Shotgun","subCategory":"Flechette","skillGroup":"Rifles","ar":"B/A-A-A/B","ap":1,"apFactor":"B","bd":6,"bdFactor":"BS","range":[3,8,16,45],"shots":2,"cost":30,"reloadCost":1,"aff":"","massKg":4,"reloadMassG":40,"burst":2,"recoil":-1,"notes":"BURST 2; RECOIL -1*"},
  {"name":"Double-Barreled Shotgun (Sawed Off)","subCategory":"Flechette","skillGroup":"Rifles","ar":"B/A-A-A/B","ap":1,"apFactor":"B","bd":6,"bdFactor":"BS","range":[1,4,8,22],"shots":2,"cost":30,"reloadCost":1,"aff":"","massKg":3,"reloadMassG":40,"burst":2,"recoil":-1,"notes":"BURST 2; RECOIL -1; -1 to attack roll*"},
  {"name":"Pump Shotgun","subCategory":"Flechette","skillGroup":"Rifles","ar":"B/A-A-A/B","ap":1,"apFactor":"B","bd":6,"bdFactor":"S","range":[4,10,20,45],"shots":6,"cost":40,"reloadCost":1,"aff":"","massKg":4,"reloadMassG":120,"burst":null,"recoil":-1,"notes":"RECOIL -1"},
  {"name":"Pump Shotgun (Sawed-Off)","subCategory":"Flechette","skillGroup":"Rifles","ar":"B/A-A-A/B","ap":1,"apFactor":"B","bd":6,"bdFactor":"S","range":[2,5,10,22],"shots":6,"cost":40,"reloadCost":1,"aff":"","massKg":3,"reloadMassG":120,"burst":null,"recoil":-1,"notes":"RECOIL -1"},
  {"name":"Avenger CCW","subCategory":"Flechette","skillGroup":"Rifles","ar":"C/X-E-C/D","ap":2,"apFactor":"B","bd":6,"bdFactor":"BS","range":[7,18,28,62],"shots":15,"cost":345,"reloadCost":4,"aff":"CLAN","massKg":5.5,"reloadMassG":400,"burst":3,"recoil":-1,"notes":"BURST 3; RECOIL -1**. With solid ammo: 5B/6B, reload 16."},
  {"name":"M&G Flechette Rifle","subCategory":"Flechette","skillGroup":"Rifles","ar":"D/C-B-C/D","ap":1,"apFactor":"B","bd":4,"bdFactor":"BS","range":[5,14,30,40],"shots":30,"cost":200,"reloadCost":8,"aff":"LA","massKg":1,"reloadMassG":240,"burst":5,"recoil":-1,"notes":"Needler; BURST 5; RECOIL -1"},
  {"name":"Needler Rifle","subCategory":"Flechette","skillGroup":"Rifles","ar":"D/B-B-B/D","ap":2,"apFactor":"B","bd":5,"bdFactor":"S","range":[5,14,30,40],"shots":20,"cost":75,"reloadCost":2,"aff":"","massKg":1,"reloadMassG":200,"burst":null,"recoil":null,"notes":"Needler"},
  {"name":"Shredder Heavy Needler Rifle","subCategory":"Flechette","skillGroup":"Rifles","ar":"D/X-X-C/D","ap":3,"apFactor":"B","bd":5,"bdFactor":"S","range":[3,8,15,30],"shots":10,"cost":150,"reloadCost":3,"aff":"LA","massKg":1,"reloadMassG":240,"burst":null,"recoil":null,"notes":"Needler"},
  {"name":"Gauss Pistol","subCategory":"Gauss","skillGroup":"Pistols","ar":"F/X-D-D/D","ap":4,"apFactor":"B","bd":5,"bdFactor":"","range":[5,20,60,150],"shots":4,"pps":1,"cost":1500,"reloadCost":1,"aff":"CLAN","massKg":1,"reloadMassG":10,"burst":null,"recoil":null,"notes":"Requires power pack"},
  {"name":"Gauss Pistol (Mandrake)","subCategory":"Gauss","skillGroup":"Pistols","ar":"E/X-X-E/E","ap":3,"apFactor":"B","bd":4,"bdFactor":"","range":[3,10,35,80],"shots":1,"cost":750,"reloadCost":null,"aff":"CC","massKg":0.1,"reloadMassG":10,"burst":null,"recoil":null,"notes":""},
  {"name":"Gauss Rifle (Thunderstroke)","subCategory":"Gauss","skillGroup":"Rifles","ar":"E/X-X-E/E","ap":5,"apFactor":"B","bd":6,"bdFactor":"","range":[30,80,250,700],"shots":5,"pps":2,"cost":2500,"reloadCost":3,"aff":"FS","massKg":7,"reloadMassG":330,"burst":null,"recoil":null,"notes":"Encumbering; requires power pack"},
  {"name":"Gauss Rifle (Thunderstroke II)","subCategory":"Gauss","skillGroup":"Rifles","ar":"E/X-X-D/E","ap":5,"apFactor":"B","bd":6,"bdFactor":"","range":[45,100,300,850],"shots":20,"pps":1,"cost":3500,"reloadCost":10,"aff":"FS","massKg":6.5,"reloadMassG":420,"burst":null,"recoil":null,"notes":"Requires power pack"},
  {"name":"Gauss Submachine Gun","subCategory":"Gauss","skillGroup":"SMGs","ar":"E/X-X-D/F","ap":5,"apFactor":"B","bd":4,"bdFactor":"B","range":[30,80,250,700],"shots":30,"pps":1,"cost":2000,"reloadCost":10,"aff":"CLAN","massKg":4.5,"reloadMassG":520,"burst":3,"recoil":-1,"notes":"BURST: 3; RECOIL -1; jam on fumble; requires power pack"},
  {"name":"Coventry Handrocket","subCategory":"Gyrojet","skillGroup":"Pistols","ar":"D/X-X-D/E","ap":4,"apFactor":"B","bd":4,"bdFactor":"","range":[15,30,75,180],"shots":5,"cost":250,"reloadCost":5,"aff":"","massKg":3.1,"reloadMassG":240,"burst":null,"recoil":null,"notes":"Gyrojet"},
  {"name":"Gyrojet Pistol","subCategory":"Gyrojet","skillGroup":"Pistols","ar":"D/D-D-C/E","ap":3,"apFactor":"B","bd":4,"bdFactor":"","range":[8,25,70,165],"shots":2,"cost":450,"reloadCost":1,"aff":"","massKg":2.5,"reloadMassG":180,"burst":null,"recoil":null,"notes":"Gyrojet"},
  {"name":"Gyrojet Pistol, Holdout","subCategory":"Gyrojet","skillGroup":"Pistols","ar":"D/D-D-C/E","ap":3,"apFactor":"B","bd":4,"bdFactor":"","range":[3,7,12,25],"shots":2,"cost":30,"reloadCost":1,"aff":"","massKg":0.05,"reloadMassG":20,"burst":null,"recoil":null,"notes":"Gyrojet"},
  {"name":"Gyrojet Rifle","subCategory":"Gyrojet","skillGroup":"Rifles","ar":"D/C-C-B/D","ap":4,"apFactor":"B","bd":5,"bdFactor":"","range":[35,90,275,500],"shots":10,"cost":1250,"reloadCost":100,"aff":"","massKg":7,"reloadMassG":1300,"burst":null,"recoil":null,"notes":"Gyrojet"},
  {"name":"Gyrojet Gun, Heavy","subCategory":"Gyrojet","skillGroup":"Rifles","ar":"D/C-D-C/E","ap":4,"apFactor":"B","bd":6,"bdFactor":"","range":[45,120,300,625],"shots":5,"cost":2500,"reloadCost":250,"aff":"","massKg":10,"reloadMassG":1000,"burst":null,"recoil":null,"notes":"Gyrojet; encumbering"},
  {"name":"Gyroslug Carbine","subCategory":"Gyrojet","skillGroup":"Rifles","ar":"D/C-D-C/D","ap":4,"apFactor":"B","bd":4,"bdFactor":"","range":[20,50,120,260],"shots":20,"cost":800,"reloadCost":5,"aff":"","massKg":4,"reloadMassG":1840,"burst":null,"recoil":null,"notes":"Gyrojet"},
  {"name":"Gyroslug Carbine (Star King)","subCategory":"Gyrojet","skillGroup":"Rifles","ar":"D/X-C-D/D","ap":4,"apFactor":"B","bd":5,"bdFactor":"","range":[23,65,130,285],"shots":20,"cost":950,"reloadCost":15,"aff":"LA","massKg":5.2,"reloadMassG":2300,"burst":null,"recoil":null,"notes":"Gyrojet"},
  {"name":"Gyroslug Rifle","subCategory":"Gyrojet","skillGroup":"Rifles","ar":"D/B-C-C/D","ap":4,"apFactor":"B","bd":5,"bdFactor":"","range":[25,60,150,315],"shots":50,"cost":1000,"reloadCost":20,"aff":"","massKg":8,"reloadMassG":5800,"burst":null,"recoil":null,"notes":"Gyrojet"},
  {"name":"Dart Gun","subCategory":"Miscellaneous","skillGroup":"Pistols","ar":"C/A-A-A/C","ap":1,"apFactor":"B","bd":3,"bdFactor":"D","range":[1,4,6,10],"shots":1,"cost":40,"reloadCost":1,"aff":"","massKg":0.65,"reloadMassG":10,"burst":null,"recoil":null,"notes":""},
  {"name":"Flamer Pistol","subCategory":"Miscellaneous","skillGroup":"Pistols","ar":"C/B-B-B/E","ap":3,"apFactor":"B","bd":3,"bdFactor":"CS","range":[5,15,25,40],"shots":10,"cost":50,"reloadCost":1,"aff":"","massKg":1.2,"reloadMassG":800,"burst":null,"recoil":null,"notes":"Incendiary"},
  {"name":"Flare Pistol","subCategory":"Miscellaneous","skillGroup":"Pistols","ar":"C/A-A-A/B","ap":2,"apFactor":"B","bd":2,"bdFactor":"CS","range":[2,5,11,20],"shots":5,"cost":25,"reloadCost":2,"aff":"","massKg":0.4,"reloadMassG":20,"burst":null,"recoil":null,"notes":"See Emergency Flares, p. 312"},
  {"name":"Gas Capsule Pistol (Spitball)","subCategory":"Miscellaneous","skillGroup":"Pistols","ar":"C/E-D-C/B","ap":0,"apFactor":"B","bd":0,"bdFactor":"","range":[4,11,19,27],"shots":25,"cost":6,"reloadCost":2,"aff":"","massKg":1,"reloadMassG":40,"burst":null,"recoil":null,"notes":"BD depends on loaded gas payload (see footnote). -1 to attack roll; gas cartridges must be replaced after 200 shots (1 C-bill per gas cartridge)"},
  {"name":"LGB-46R Paint Gun","subCategory":"Miscellaneous","skillGroup":"Pistols","ar":"C/A-A-B/B","ap":0,"apFactor":"B","bd":0,"bdFactor":"","range":[1,2,3,4],"shots":15,"cost":50,"reloadCost":10,"aff":"","massKg":1.8,"reloadMassG":640,"burst":null,"recoil":null,"notes":"Fires liquid payload (typically paint or water)"},
  {"name":"Sonic Stunner","subCategory":"Miscellaneous","skillGroup":"Pistols","ar":"D/B-C-B/B","ap":0,"apFactor":"S","bd":4,"bdFactor":"D","range":[2,5,7,10],"shots":null,"pps":1,"cost":100,"reloadCost":null,"aff":"","massKg":0.6,"reloadMassG":null,"burst":null,"recoil":null,"subduing":true,"notes":"Subduing (**)"},
  {"name":"Tranq Gun","subCategory":"Miscellaneous","skillGroup":"Pistols","ar":"C/A-A-A/C","ap":2,"apFactor":"B","bd":4,"bdFactor":"D","range":[3,10,18,25],"shots":10,"cost":30,"reloadCost":1,"aff":"","massKg":1.5,"reloadMassG":40,"burst":null,"recoil":null,"subduing":true,"notes":"Only delivers its BD if the weapon's AP (plus the attack's MoS / 4, round down) exceeds the target's BAR. Otherwise, no BD is applied."},
  {"name":"Buccaneer Gel Gun","subCategory":"Miscellaneous","skillGroup":"Rifles","ar":"C/X-X-D/C","ap":2,"apFactor":"B","bd":4,"bdFactor":"D","range":[3,10,18,25],"shots":5,"cost":200,"reloadCost":20,"aff":"FW","massKg":2.5,"reloadMassG":850,"burst":null,"recoil":null,"subduing":true,"notes":"AP 0 vs. barriers/tactical armor; no recoil in zero-G; on hit, -2 to knockdown check"},
  {"name":"Ceres Arms Crowdbuster","subCategory":"Miscellaneous","skillGroup":"Rifles","ar":"D/X-F-D/C","ap":0,"apFactor":"S","bd":5,"bdFactor":"D","range":[2,6,10,15],"shots":null,"pps":2,"cost":150,"reloadCost":null,"aff":"CC","massKg":1,"reloadMassG":null,"burst":null,"recoil":null,"subduing":true,"notes":"Subduing (**)"},
  {"name":"Radium Sniper Rifle","subCategory":"Miscellaneous","skillGroup":"Rifles","ar":"E/F-X-F/F","ap":4,"apFactor":"S","bd":5,"bdFactor":"C","range":[95,350,750,1500],"shots":5,"pps":10,"cost":9500,"reloadCost":650,"aff":"TC","massKg":12,"reloadMassG":330,"burst":null,"recoil":null,"notes":"On successful hit that penetrates armor, injects target with 1 dose of radium poison (see Drugs and Poisons, p. 317)"}
];

/** All weapon seed entries (expanded), consumed by the weapon seeder. */
export const WEAPON_SEED = [
  ...SMALL_ARMS
].map(r => toWeaponSeed({ skill: 'Small Arms', weaponType: 'smallarms', ...r }));
