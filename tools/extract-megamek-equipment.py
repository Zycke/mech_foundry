"""Regenerate module/data/tw-equipment.mjs (the record-sheet importer's weapon and
ammunition catalog) from a MegaMek source checkout.

    git clone --depth 1 https://github.com/MegaMek/megamek.git
    python3 tools/extract-megamek-equipment.py megamek/megamek/src/megamek/common module/data/tw-equipment.mjs

Reads each weapon class under common/weapons (resolving stats inherited from
parent classes) and the ammunition definitions in common/equipment/AmmoType.java,
keeping game statistics and the equipment names MegaMek unit files use.
"""
import json, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'megamek/megamek/src/megamek/common'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'module/data/tw-equipment.mjs'
WDIR = os.path.join(ROOT, 'weapons')
SKIP_DIRS = {'infantry', 'bayWeapons', 'attacks', 'handlers', 'bombs', 'unofficial'}

CONSTS = {'WEAPON_NA': None, 'DAMAGE_BY_CLUSTER_TABLE': 'cluster', 'DAMAGE_VARIABLE': 'variable',
          'DAMAGE_SPECIAL': 'special', 'DAMAGE_ARTILLERY': 'artillery'}
INF_CLASS = {
    'WEAPON_DIRECT_FIRE': 'direct', 'WEAPON_CLUSTER_BALLISTIC': 'clusterBallistic', 'WEAPON_PULSE': 'pulse',
    'WEAPON_CLUSTER_MISSILE': 'clusterMissile', 'WEAPON_CLUSTER_MISSILE_1D6': 'clusterMissile',
    'WEAPON_CLUSTER_MISSILE_2D6': 'clusterMissile', 'WEAPON_CLUSTER_MISSILE_3D6': 'clusterMissile',
    'WEAPON_BURST_HALF_D6': 'burst:1d6/2', 'WEAPON_BURST_1D6': 'burst:1d6', 'WEAPON_BURST_2D6': 'burst:2d6',
    'WEAPON_BURST_3D6': 'burst:3d6', 'WEAPON_BURST_4D6': 'burst:4d6', 'WEAPON_BURST_5D6': 'burst:5d6',
    'WEAPON_BURST_6D6': 'burst:6d6', 'WEAPON_BURST_7D6': 'burst:7d6'}
NUM_FIELDS = ['criticalSlots', 'heat', 'damage', 'rackSize', 'minimumRange', 'shortRange', 'mediumRange', 'longRange', 'extremeRange']


def body_of(src, cls):
    m = re.search(r'public\s+' + re.escape(cls) + r'\s*\([^)]*\)\s*\{', src)
    if not m:
        return ''
    i, depth = m.end(), 1
    while i < len(src) and depth:
        depth += {'{': 1, '}': -1}.get(src[i], 0)
        i += 1
    return src[m.end():i - 1]


def value(tok):
    tok = tok.strip()
    if re.fullmatch(r'-?\d+', tok):
        return int(tok)
    tok = tok.split('.')[-1]
    return CONSTS.get(tok, ('?' + tok))


classes = {}
for dp, dns, fns in os.walk(WDIR):
    rel = os.path.relpath(dp, WDIR).split(os.sep)
    if rel[0] in SKIP_DIRS:
        continue
    for fn in fns:
        if not fn.endswith('.java'):
            continue
        src = open(os.path.join(dp, fn), encoding='utf-8').read()
        cm = re.search(r'(abstract\s+)?class\s+(\w+)\s+extends\s+(\w+)', src)
        if not cm:
            continue
        cls, parent = cm.group(2), cm.group(3)
        body = body_of(src, cls)
        d = {'parent': parent, 'abstract': bool(cm.group(1)), 'dir': rel[0], 'lookups': [], 'flags': set()}
        nm = re.search(r'(?:this\.)?name\s*=\s*"([^"]+)"\s*;', body)
        if nm:
            d['name'] = nm.group(1)
        im = re.search(r'setInternalName\(\s*(?:"([^"]+)"|(?:this\.)?(name))\s*\)', body)
        if im:
            d['internal'] = im.group(1) or d.get('name')
        d['lookups'] = re.findall(r'addLookupName\(\s*"([^"]+)"\s*\)', body)
        for f in NUM_FIELDS:
            fm = re.search(r'(?<![\w.])(?:this\.)?' + f + r'\s*=\s*([^;]+);', body)
            if fm:
                d[f] = value(fm.group(1))
        am = re.search(r'ammoType\s*=\s*(?:AmmoType\.)?AmmoTypeEnum\.(\w+)', body)
        if am:
            d['ammoType'] = am.group(1)
        inf = re.search(r'infDamageClass\s*=\s*(?:WeaponType\.)?(\w+)', body)
        if inf:
            d['inf'] = INF_CLASS.get(inf.group(1))
        for fl in re.findall(r'\b(F_[A-Z0-9_]+)\b', ' '.join(re.findall(r'flags\s*=\s*flags[^;]*;', body))):
            d['flags'].add(fl)
        mr = re.search(r'maxRange\s*=\s*(?:WeaponType\.)?RANGE_(SHORT|MED|LONG|EXT)', body)
        if mr:
            d['maxRange'] = {'SHORT': 'short', 'MED': 'medium', 'LONG': 'long', 'EXT': 'extreme'}[mr.group(1)]
        if re.search(r'\bcapital\s*=\s*true', body):
            d['capital'] = True
        classes[cls] = d


def resolved(cls, seen=()):
    d = classes.get(cls)
    if not d or cls in seen:
        return {'flags': set(), 'lookups': []}
    base = resolved(d['parent'], seen + (cls,))
    out = dict(base)
    out['flags'] = set(base['flags']) | d['flags']
    for k, v in d.items():
        if k in ('flags', 'parent', 'abstract', 'lookups'):
            continue
        out[k] = v
    out['lookups'] = d['lookups']
    out['dir'] = d['dir']
    return out


# Per-missile damage by ammo family (MissileWeapon damage comes from the cluster table).
PER_MISSILE = {'LRM': 1, 'LRM_STREAK': 1, 'EXLRM': 1, 'NLRM': 1, 'LRM_TORPEDO': 1, 'MRM': 1, 'ROCKET_LAUNCHER': 1,
               'SRM': 2, 'SRM_STREAK': 2, 'SRM_TORPEDO': 2, 'SRM_ADVANCED': 2, 'SRM_IMP': 2, 'LRM_IMP': 1,
               'ATM': 2, 'IATM': 2, 'MML': 1, 'SRM_PRIMITIVE': 2, 'LRM_PRIMITIVE': 1, 'MRM_STREAK': 1}

weapons = []
for cls, d in classes.items():
    if d['abstract']:
        continue
    r = resolved(cls)
    if not r.get('name') or not (r.get('internal') or d['lookups']):
        continue
    name = r.get('name')
    keys = [k for k in [r.get('internal'), name, *r['lookups']] if k]
    dmg = r.get('damage')
    rack = r.get('rackSize') if isinstance(r.get('rackSize'), int) else 0
    ammo = r.get('ammoType')
    cluster = 0
    if dmg == 'cluster':
        cluster = rack
        dmg = PER_MISSILE.get(ammo, 1)
    if not isinstance(dmg, int):
        dmg = None
    rng = lambda k: r.get(k) if isinstance(r.get(k), int) and r.get(k) >= 0 else 0
    w = {'n': name, 'k': sorted(set(keys), key=keys.index), 'h': r.get('heat') if isinstance(r.get('heat'), int) else 0,
         'd': dmg, 'c': cluster, 'mn': rng('minimumRange'), 's': rng('shortRange'), 'm': rng('mediumRange'),
         'l': rng('longRange'), 'e': rng('extremeRange'), 'sl': r.get('criticalSlots') if isinstance(r.get('criticalSlots'), int) else 1}
    if ammo and ammo not in ('NA',):
        w['a'] = ammo
    if r.get('inf'):
        w['i'] = r['inf']
    if 'SRM_STREAK' == ammo or 'LRM_STREAK' == ammo or 'MRM_STREAK' == ammo:
        w['st'] = 1
    if d['dir'] == 'battleArmor' or 'F_BA_WEAPON' in r['flags']:
        w['ba'] = 1
    if r.get('capital') or d['dir'] in ('capitalWeapons', 'subCapitalWeapons'):
        w['cap'] = 1
    if 'F_ONE_SHOT' in r['flags']:
        w['os'] = 1
    if cls.startswith('CL'):
        w['cl'] = 1
    w['ar'] = r.get('maxRange', '')
    if ammo == 'MML' and not w['s']:
        # MML: record the LRM mode (the SRM mode is 3/6/9, 2 damage per missile).
        w.update({'mn': 6, 's': 7, 'm': 14, 'l': 21, 'e': 28})
    if w.get('cap'):
        continue
    weapons.append(w)

# ---- Ammo ----
asrc = open(os.path.join(ROOT, 'equipment', 'AmmoType.java'), encoding='utf-8').read()
ammo = []
for m in re.finditer(r'private static AmmoType (create\w+)\(\)\s*\{(.*?)\n    \}', asrc, re.S):
    b = m.group(2)
    nm = re.search(r'ammo\.name\s*=\s*"([^"]+)"', b)
    if not nm:
        continue
    im = re.search(r'ammo\.setInternalName\(\s*"([^"]+)"', b)
    keys = [x for x in [im.group(1) if im else None, nm.group(1), *re.findall(r'ammo\.addLookupName\(\s*"([^"]+)"', b)] if x]
    g = lambda f: (re.search(r'ammo\.' + f + r'\s*=\s*(-?\d+)\s*;', b) or [None, None])[1]
    at = re.search(r'ammo\.ammoType\s*=\s*(?:AmmoType\.)?AmmoTypeEnum\.(\w+)', b)
    short = re.search(r'ammo\.shortName\s*=\s*"([^"]+)"', b)
    ammo.append({'cl': 1 if re.search(r'create(CL|Clan)', m.group(1)) else 0, 'n': nm.group(1), 'sn': short.group(1) if short else None, 'k': sorted(set(keys), key=keys.index),
                 'shots': int(g('shots')) if g('shots') else None, 'rack': int(g('rackSize')) if g('rackSize') else None,
                 'a': at.group(1) if at else None, 'kg': bool(re.search(r'kgPerShot', b))})

d = {'weapons': weapons, 'ammo': ammo}
print(len(weapons), 'weapons', len(ammo), 'ammo')

# ---- Write the catalog module ----
esc = lambda s: json.dumps(s, ensure_ascii=False)
lines = []
for w in sorted(d['weapons'], key=lambda w: (w['n'], w['k'][0])):
    flags = ''.join(f for f in ('st', 'ba', 'os', 'cl') if w.get(f))
    row = [w['n'], '|'.join(w['k']), w['h'], w['d'] if w['d'] is not None else None, w['c'], w['mn'], w['s'], w['m'], w['l'], w['e'], w.get('a') or '', w.get('i') or '', flags, w['sl'], w['ar']]
    lines.append('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')))
alines = []
for a in sorted(d['ammo'], key=lambda a: (a['n'], a['k'][0])):
    row = [a['n'], a['sn'] or '', '|'.join(a['k']), a['shots'] or 0, a['rack'] or 0, a['a'] or '', a['cl']]
    alines.append('  ' + json.dumps(row, ensure_ascii=False, separators=(',', ':')))
out = f'''/**
 * Total Warfare weapon and ammunition catalog for the record-sheet importer.
 *
 * GENERATED by tools/extract-megamek-equipment.py — do not edit by hand. Game statistics (heat, damage, cluster size,
 * minimum / short / medium / long / extreme range, shots per ton) and the
 * equipment names MegaMek unit files use (display, internal and lookup names),
 * extracted from the MegaMek project's equipment definitions so that its
 * .mtf / .blk files can be read. Capital-scale weapons are omitted.
 *
 * Weapon rows: [name, names ("|"), heat, damage (per missile for launchers; null =
 *   variable / special), cluster (launcher size, 0 = single), min, short, medium,
 *   long, extreme, ammo family, infantry damage class, flags, critical slots,
 *   aerospace range bracket]
 *   flags: st = Streak (all missiles hit), ba = battle armor weapon, os = one-shot,
 *   cl = Clan.
 * Ammo rows: [name, short name, names ("|"), shots per ton, rack size, family, clan (1/0)]
 */

export const WEAPON_ROWS = [
{(','+chr(10)).join(lines)}
];

export const AMMO_ROWS = [
{(','+chr(10)).join(alines)}
];
'''
open(OUT, 'w').write(out)
print('wrote', OUT, len(out), 'bytes')
