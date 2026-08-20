#!/usr/bin/env python3
"""Turn the research dumps into the level data the sim loads.

Inputs, all generated from the game by the research tooling:
  /tmp/tiles_<room>/room.json        dump_room.csx           (tile grid)
  /tmp/eram_mega/inst2_<room>.json   eram_mega.csx           (instances v2:
                                     color + creation-code name)
  ~/knight-research/gml_dump/CodeEntries/gml_RoomCC_<room>_<n>_PreCreate.gml
                                     the per-instance creation code, already
                                     decompiled by the bulk dump

One JSON per level: tiles, every solid layer (Kris's, the boat's, the
fish's), the enemy spawners with the dispatch resolved, the sword pickup,
warps WITH their targets, triggers, the per-screen colour changers, water
and waterfall and tree-spawner regions, and every visible decoration. If a
number is wrong it is wrong here or in a dump, not in a designer's head —
re-run and diff.
"""
import json, os, re, sys, glob

LEVELS = [
    ('room_board_1_sword', 1, 'BOARD 1 · THE DESERT'),
    ('room_board_2_sword', 2, 'BOARD 2 · THE WATER'),
    ('room_board_3_sword', 3, 'BOARD 3 · THE APPROACH'),
    # Everything after ESCAPED — the route to the Mantle.
    ('room_board_dungeon_3', 4, 'THE SHELTER'),
    ('room_board_preshadowmantle', 5, 'THE HOLDER'),
    ('room_shadowmantle', 6, 'THE SHADOW MANTLE'),
    ('room_board_postshadowmantle', 7, 'AFTER'),
]

CAMERA_START = {'room_board_1_sword': (896, 64),
                'room_board_2_sword': (2432, 3648),
                'room_board_3_sword': (1280, 320),
                # obj_board_camera Create, verbatim per room:
                'room_board_dungeon_3': (896, 1344),
                'room_board_preshadowmantle': (128, 320),
                'room_shadowmantle': (128, 64),
                'room_board_postshadowmantle': (128, 64)}

# Three different walls for three different things:
#   obj_board_solid (+corner, +treegreen)  blocks KRIS (place_meeting in
#                                          obj_mainchara_board's Step)
#   obj_board_boatsolid                    blocks THE BOAT (obj_board_boat's
#                                          Step collides with this, never
#                                          with obj_board_solid)
#   obj_board_solidfish                    blocks THE BLUEFISH (its Step's
#                                          collision_obj resolves to id 1066
#                                          = obj_board_solidfish in the
#                                          sword rooms)
KRIS_SOLID = {'obj_board_solid', 'obj_board_solidcorner', 'obj_board_solid_treegreen',
              'obj_solidblocksized'}
BOAT_SOLID = {'obj_board_boatsolid'}
FISH_SOLID = {'obj_board_solidfish'}
CELL = 32

# obj_board_enemy_spawner's user event 0: a 21-branch dispatch on the
# spawner instance's OWN image_index. Stats read from each branch and the
# enemy Creates. `immunity` is sword_immunity_lv: a sword hit only damages
# when kris.swordlv >= it, otherwise the blade rings off.
#
# NOTE the lizard: scr_board_enemy_init sets hp 1 but the lizard's own
# Create then sets hp = 2 — an earlier revision of this table said 1.
SPAWNER_DISPATCH = {
    0:  {'kind': 'monster',   'hp': 1,   'immunity': 1},
    1:  {'kind': 'monster',   'hp': 999, 'immunity': 1, 'blend': 'gray'},
    2:  {'kind': 'monster',   'hp': 2,   'immunity': 2, 'blend': 'yellow', 'spd': 4, 'variant': 1},
    3:  {'kind': 'monster',   'hp': 2,   'immunity': 3, 'blend': 'orange', 'spd': 5, 'variant': 2},
    4:  {'kind': 'flower',    'hp': 1,   'immunity': 2},
    5:  {'kind': 'flower',    'hp': 1,   'immunity': 1, 'variant': 1},
    6:  {'kind': 'bluefish',  'hp': 1,   'immunity': 2},
    7:  {'kind': 'bluefish',  'hp': 5,   'immunity': 1, 'silverfish': True},
    8:  {'kind': 'silentcat', 'hp': 1,   'immunity': 1},
    9:  {'kind': 'singingcat','hp': 2,   'immunity': 1, 'spd': 6, 'variant': 1},
    10: {'kind': 'lizard',    'hp': 2,   'immunity': 1},
    11: {'kind': 'lizard',    'hp': 2,   'immunity': 1, 'spd': 5, 'variant': 1},
    12: {'kind': 'lizard',    'hp': 2,   'immunity': 1, 'spd': 6, 'variant': 2},
    13: {'kind': 'bluebird',  'hp': 8,   'immunity': 4},
    14: {'kind': 'deer',      'hp': 1,   'immunity': 1},
    15: {'kind': 'black_deer','hp': 999, 'immunity': 1},
    16: {'kind': 'rotaty',    'hp': 1,   'immunity': 1},
    17: {'kind': 'bouncy',    'hp': 1,   'immunity': 1},
    # 18 IS placed on the route: obj_fire_bar_base — five rotating flames.
    18: {'kind': 'firebar',   'hp': 999, 'immunity': 99},
}

# Objects that are pure bookkeeping — never drawn, never data.
SKIP = {
    'obj_mainchara', 'obj_board_camera', 'obj_board_controller',
    'obj_darkcontroller', 'obj_gameshow_swordroute',
    'obj_board_1_sword_manager', 'obj_b2s_swordmanager', 'obj_b3s_swordmanager',
    'obj_board_b3s_repeatintro', 'obj_board_dungeon_3_jingle_controller',
    'obj_shadowmantle_crtcontroller',
}

CC_DIR = os.path.expanduser('~/knight-research/gml_dump/CodeEntries')
MEGA = '/tmp/eram_mega'

SPRITES = json.load(open(f'{MEGA}/sprites.json'))
OBJECTS = json.load(open(f'{MEGA}/objects.json'))


def parse_cc(name):
    """The creation code is simple `var = value;` lines — parse to a dict."""
    if not name:
        return {}
    path = os.path.join(CC_DIR, name + '.gml')
    if not os.path.exists(path):
        return {'_missing': name}
    out = {}
    for m in re.finditer(r'(\w+)\s*=\s*(-?\d+|true|false|"[^"]*")\s*;', open(path).read()):
        k, v = m.group(1), m.group(2)
        if v == 'true':
            out[k] = True
        elif v == 'false':
            out[k] = False
        elif v.startswith('"'):
            out[k] = v[1:-1]
        else:
            out[k] = int(v)
    return out


def inst_color(c):
    """Room instance colour is ABGR packed; white (0xffffffff) means unset."""
    return '#%02x%02x%02x' % (c & 255, (c >> 8) & 255, (c >> 16) & 255)


def sprite_of(obj):
    return (OBJECTS.get(obj) or {}).get('sprite')


# Objects the mega-dump's objects.json missed, with dims taken straight
# from the game data (UndertaleModCli): obj_solidblocksized's sprite is
# spr_block_sized, 40x40 FULL BBOX — NOT a 32px cell. Sizing it by 32
# undersized every such wall by 25% (holes at their right/bottom edges).
SPECIAL_DIMS = {'obj_solidblocksized': {'w': 40, 'h': 40}}


def rect_of(i, snap=False):
    """An instance's covered rect, from its sprite dims x its room scale.
    Solids and regions use spr dims * scale; origins on these are (0,0).

    snap=True rounds each edge to the nearest cell boundary: the game's
    per-pixel movement corner-slides past walls that overhang a row by a
    few pixels (postshadowmantle's exit corridor overhangs by 2), but the
    sim's cell-locked movement cannot — nearest-32 edges keep every
    slide-passable strip walkable and every real wall sealed."""
    spr = sprite_of(i['obj'])
    meta = SPECIAL_DIMS.get(i['obj']) or SPRITES.get(spr, {'w': CELL, 'h': CELL})
    x, y = i['x'], i['y']
    w, h = meta['w'] * i['sx'], meta['h'] * i['sy']
    if snap:
        x2 = round((x + w) / CELL) * CELL
        y2 = round((y + h) / CELL) * CELL
        x = round(x / CELL) * CELL
        y = round(y / CELL) * CELL
        w, h = x2 - x, y2 - y
    return {'x': int(x), 'y': int(y), 'w': int(w), 'h': int(h)}


def build(room, number, title, out_dir):
    tiles_path = f'/tmp/tiles_{room}/room.json'
    inst_path = f'{MEGA}/inst2_{room}.json'
    for p in (tiles_path, inst_path):
        if not os.path.exists(p):
            print(f'  !! missing {p} — re-run the dumps for {room}')
            return None

    rd = json.load(open(tiles_path))
    inst = json.load(open(inst_path))['instances']
    # Level 2 has TWO tile layers: BOARD_Tiles_alt (the northern-lights
    # variant) above BOARD_Tiles. On the sword route the alt layer is
    # HIDDEN (obj_b2s_northernlightsroom: flag 1055 == 1 ->
    # layer_set_visible(alt, false)), so the level renders BOARD_Tiles.
    # Taking "the first Tiles layer" here silently rendered the wrong walls.
    tiles = next((l for l in rd['layers']
                  if l['type'] == 'Tiles' and l.get('name') == 'BOARD_Tiles'),
                 next(l for l in rd['layers'] if l['type'] == 'Tiles'))
    # Asset-layer sprite placements (BOARD_Assets): the room's dressing art
    # — level 1's big door, level 2's cave and entrance mouths, level 3's
    # sewer manhole. Dropping this layer erased them all. Marker fills
    # (pxwhite/whitepixel) stay out.
    asset_props = []
    for l in rd['layers']:
        if l['type'] != 'Assets' or not l.get('sprites'):
            continue
        for s in l['sprites']:
            if 'pxwhite' in s['sprite'] or 'whitepixel' in s['sprite']:
                continue
            asset_props.append({'sprite': s['sprite'], 'x': s['x'], 'y': s['y'],
                                'imageIndex': 0})
    bg = next((l.get('color') for l in rd['layers'] if l['type'] == 'Background'), None)
    r = bg & 255 if bg else 0
    g = (bg >> 8) & 255 if bg else 0
    b = (bg >> 16) & 255 if bg else 0

    out = {
        '_source': f'{room}, DELTARUNE Chapter 3 — dump_room.csx + eram_mega.csx. '
                   'Rebuild with tools/build-levels.py; never hand-edit.',
        'number': number, 'title': title, 'room': room,
        'width': rd['width'], 'height': rd['height'],
        'roomStartingX': CAMERA_START[room][0],
        'roomStartingY': CAMERA_START[room][1],
        'bgColor': '#%02x%02x%02x' % (r, g, b),
        'tileset': {'file': 'sprites/tileset.png', 'tileW': tiles['tileW'],
                    'tileH': tiles['tileH'], 'cols': tiles['tileCols'],
                    'border': tiles['border']},
        'tilesX': tiles['tilesX'], 'tilesY': tiles['tilesY'],
        'grid': tiles['grid'],
        'solids': [], 'boatSolids': [], 'fishSolids': [],
        'spawners': [], 'cactus': [],
        'warps': [], 'triggers': [], 'colorChangers': [],
        'water': [], 'waterfalls': [], 'treeSpawners': [],
        'boats': [], 'docks': [], 'props': asset_props, 'events': [],
        'kris': None, 'pickup': None,
    }

    for i in inst:
        o = i['obj']
        cc = parse_cc(i.get('cc'))
        if o in SKIP:
            continue
        if o == 'obj_mainchara_board':
            out['kris'] = {'x': i['x'], 'y': i['y']}
        elif o in KRIS_SOLID:
            out['solids'].append(rect_of(i, snap=True))
        elif o in BOAT_SOLID:
            out['boatSolids'].append(rect_of(i, snap=True))
        elif o in FISH_SOLID:
            out['fishSolids'].append(rect_of(i, snap=True))
        elif o == 'obj_board_enemy_spawner':
            idx = int(i['imageIndex'])
            d = SPAWNER_DISPATCH.get(idx)
            sp = {'x': i['x'], 'y': i['y'], 'index': idx}
            if d:
                sp.update({'kind': d['kind'], 'hp': d['hp'],
                           'immunity': d['immunity'], 'variant': d.get('variant'),
                           'blend': d.get('blend'), 'spd': d.get('spd'),
                           'silverfish': d.get('silverfish')})
            else:
                sp['kind'] = None
            # the spawner's own creation code: `type = 1` makes a lizard a
            # stationary turret (enemy.dontmove = true in the dispatch)
            if cc.get('type') == 1:
                sp['dontmove'] = True
            out['spawners'].append(sp)
        elif o == 'obj_board_pickup':
            out['pickup'] = {'x': i['x'], 'y': i['y'], 'cc': cc}
        elif o == 'obj_board_cactus':
            out['cactus'].append({'x': i['x'], 'y': i['y'], 'cc': cc})
        elif o in ('obj_board_warptouch', 'obj_board_warpentrance'):
            w = rect_of(i)
            w.update({'kind': o.removeprefix('obj_board_'), **cc})
            out['warps'].append(w)
        elif o == 'obj_board_trigger':
            t = rect_of(i)
            t.update(cc)
            out['triggers'].append(t)
        elif o == 'obj_board_screenColorChanger':
            out['colorChangers'].append(
                {'x': i['x'], 'y': i['y'], 'color': inst_color(i['color'])})
        elif o == 'obj_board_shallowwater':
            out['water'].append({'x': i['x'], 'y': i['y'], 'type': 'shallow',
                                 'cols': int(i['sx'] // 2), 'rows': int(i['sy'] // 2)})
        elif o in ('obj_board_oasis_sword', 'obj_board_smallpond_sword',
                   'obj_board_lancermoat_sword', 'obj_board_b1powerpond'):
            out['water'].append({'x': i['x'], 'y': i['y'],
                                 'type': o.removeprefix('obj_board_'),
                                 'sprite': sprite_of(o)})
        elif o == 'obj_board_waterfall':
            out['waterfalls'].append({'x': i['x'], 'y': i['y'],
                                      'cols': int(i['sx'] // 2), 'rows': int(i['sy'] // 2)})
        elif o == 'obj_board_treespawner':
            out['treeSpawners'].append({'x': i['x'], 'y': i['y'],
                                        'cols': int(i['sx']), 'rows': int(i['sy']),
                                        'cold': inst_color(i['color']).lower() == '#fdfdfd'})
        elif o == 'obj_board_boat':
            out['boats'].append({'x': i['x'], 'y': i['y'], 'cc': cc})
        elif o == 'obj_board_dock':
            out['docks'].append({'x': i['x'], 'y': i['y']})
        elif o in ('obj_board_b1swordentrance', 'obj_board_b1_shadowteaseentrance',
                   'obj_board_sword_fakeentrance', 'obj_board_swordroute_treeteleportroom',
                   'obj_board_b2sword_boatwarp', 'obj_board_b2s_icedoor',
                   'obj_board_1_sword_b1store', 'obj_board_1_sword_shadowtease',
                   'obj_board_sword_shadowtease_face', 'obj_board_sword_shadowtease_teeth',
                   'obj_b2s_heartisland', 'obj_b2s_northernlightsroom',
                   'obj_b2s_tennaentrance', 'obj_b2s_tennamonologue', 'obj_b2s_swordroom',
                   'obj_board_bridgespawner', 'obj_board_b2_bridgeoverlay',
                   'obj_board_ladder', 'obj_board_cold', 'obj_board_b3s_stanchion',
                   'obj_board_dungeon3_switch', 'obj_board_dungeon_3_shelter',
                   'obj_board_dungeon3_sheltertunnel', 'obj_board_dungeon3_tenna',
                   'obj_dungeon3_tennataps', 'obj_board_warptopreshadowmantle',
                   'obj_board_invincibilespot', 'obj_board_preshadowmantle',
                   'obj_board_shadowspotlight', 'obj_shadow_mantle_bg',
                   'obj_shadow_mantle_enemy', 'obj_shadow_mantle_path',
                   'obj_soliddark', 'obj_board_npc', 'obj_doorAny',
                   'obj_bpush2_stucktrigger', 'obj_swordroute_event_leavescreen',
                   'obj_treasure_room'):
            out['events'].append({'obj': o.removeprefix('obj_board_').removeprefix('obj_'),
                                  'sprite': sprite_of(o),
                                  'x': i['x'], 'y': i['y'],
                                  'sx': i['sx'], 'sy': i['sy'],
                                  'imageIndex': int(i['imageIndex']), 'cc': cc})
        else:
            spr = sprite_of(o)
            if spr and spr in SPRITES:
                p = {'sprite': spr, 'x': i['x'], 'y': i['y'],
                     'imageIndex': int(i['imageIndex'])}
                if inst_color(i['color']) != '#ffffff':
                    p['color'] = inst_color(i['color'])
                out['props'].append(p)
            # invisible unknowns are dropped, deliberately loudly:
            else:
                print(f'    (skipped {o} at {i["x"]},{i["y"]} — no sprite)')

    path = os.path.join(out_dir, f'{number}.json')
    json.dump(out, open(path, 'w'))
    print(f'  level {number}: {rd["width"]}x{rd["height"]}, '
          f'{len(out["solids"])}/{len(out["boatSolids"])}/{len(out["fishSolids"])} solids, '
          f'{sum(1 for s in out["spawners"] if s["kind"])} spawners, '
          f'{len(out["warps"])} warps, {len(out["colorChangers"])} colors, '
          f'{len(out["props"])} props -> {path}')
    return out


def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'levels')
    os.makedirs(out_dir, exist_ok=True)
    built = []
    for room, number, title in LEVELS:
        b = build(room, number, title, out_dir)
        if b:
            built.append({'number': number, 'title': title, 'room': room,
                          'file': f'{number}.json'})
    json.dump(built, open(os.path.join(out_dir, 'index.json'), 'w'))
    print(f'wrote {len(built)} level(s)')


if __name__ == '__main__':
    main()
