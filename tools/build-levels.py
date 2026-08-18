#!/usr/bin/env python3
"""Turn the research dumps into the level data the sim loads.

The three sword-route levels are read out of the chapter with
knight-research's dump_room.csx (tiles) and dump_room_instances.csx
(instances), then reduced here to one JSON per level: the tile grid, the
collision rectangles, where Kris starts and where the camera starts.

Nothing here is authored. If a number in a level file looks wrong, it is
wrong in this script or in the dump, not in a designer's head — re-run and
diff rather than editing the JSON by hand.

    python3 tools/build-levels.py            # expects /tmp/tiles_<room>/
"""
import json, os, sys

# obj_board_camera's Create: where each room's world is parked so the first
# screen lands in the 384x256 pane at (128,64).
CAMERA_START = {
    'room_board_1_sword': (896, 64),
    'room_board_2_sword': (2432, 3648),
    'room_board_3_sword': (1280, 320),
}

LEVELS = [
    ('room_board_1_sword', 1, 'BOARD 1 · the desert'),
    ('room_board_2_sword', 2, 'BOARD 2 · the water'),
    ('room_board_3_sword', 3, 'BOARD 3 · the approach'),
]

# Every obj_board_* that blocks. spr_solid_board is 32x32 and each instance
# carries its own scale, so a solid is (x, y, 32*sx, 32*sy).
SOLID_OBJECTS = {
    'obj_board_solid', 'obj_board_solidfish', 'obj_board_solidcorner',
    'obj_board_boatsolid', 'obj_board_solid_treegreen', 'obj_board_camsolid',
}
SOLID_CELL = 32

# obj_board_enemy_spawner's user event 0: a 21-branch dispatch on the
# spawner instance's OWN image_index. Only the branches that appear on the
# sword route are given stats here; the rest resolve to a kind so an
# unexpected index is visible in the data rather than silently dropped.
#
# `sword_immunity_lv` is what the sword cares about: a hit only damages when
# kris.swordlv >= it, otherwise the blade rings off (snd_board_sword_metal).
# hp 999 is the gray monster — it cannot be killed at all.
SPAWNER_DISPATCH = {
    0:  {'kind': 'monster',   'hp': 1,   'immunity': 1},
    1:  {'kind': 'monster',   'hp': 999, 'immunity': 1, 'blend': 'gray'},
    2:  {'kind': 'monster',   'hp': 2,   'immunity': 2, 'blend': 'yellow', 'spd': 4, 'variant': 1},
    3:  {'kind': 'monster',   'hp': 2,   'immunity': 3, 'blend': 'orange', 'spd': 4, 'variant': 2},
    4:  {'kind': 'flower',    'hp': 1,   'immunity': 2},
    5:  {'kind': 'flower',    'hp': 1,   'immunity': 1, 'variant': 1},
    6:  {'kind': 'bluefish',  'hp': 1,   'immunity': 2},
    7:  {'kind': 'bluefish',  'hp': 5,   'immunity': 1},
    8:  {'kind': 'silentcat', 'hp': 1,   'immunity': 1},
    9:  {'kind': 'singingcat','hp': 2,   'immunity': 1, 'spd': 6, 'variant': 1},
    10: {'kind': 'lizard',    'hp': 1,   'immunity': 1},
    11: {'kind': 'lizard',    'hp': 1,   'immunity': 1, 'spd': 5, 'variant': 1},
    12: {'kind': 'lizard',    'hp': 1,   'immunity': 1, 'spd': 6, 'variant': 2},
    13: {'kind': 'bluebird',  'hp': 1,   'immunity': 1},
    14: {'kind': 'deer',      'hp': 1,   'immunity': 1},
    15: {'kind': 'black_deer','hp': 999, 'immunity': 1},
    16: {'kind': 'rotaty',    'hp': 1,   'immunity': 1},
    17: {'kind': 'bouncy',    'hp': 1,   'immunity': 1},
    # 18+ are not enemies at all — fire bars, ice puzzles, trees, blocks.
}

def build(room, number, title, out_dir):
    tiles_path = f'/tmp/tiles_{room}/room.json'
    inst_path = f'/tmp/inst_{room}.json'
    for p in (tiles_path, inst_path):
        if not os.path.exists(p):
            print(f'  !! missing {p} — re-run the dumps for {room}')
            return None

    rd = json.load(open(tiles_path))
    inst = json.load(open(inst_path))['instances']
    tiles = next(l for l in rd['layers'] if l['type'] == 'Tiles')
    bg = next((l.get('color') for l in rd['layers'] if l['type'] == 'Background'), None)
    r = bg & 255 if bg else 0
    g = (bg >> 8) & 255 if bg else 0
    b = (bg >> 16) & 255 if bg else 0

    solids = [
        {'x': i['x'], 'y': i['y'],
         'w': int(SOLID_CELL * i['sx']), 'h': int(SOLID_CELL * i['sy'])}
        for i in inst if i['obj'] in SOLID_OBJECTS
    ]
    # THE ENEMIES. Resolved here rather than in the sim so the level data
    # says what stands where; the spawn RULE (camera con 98, player bounds)
    # lives in sim/enemies.js.
    spawners = []
    for i in inst:
        if i['obj'] != 'obj_board_enemy_spawner':
            continue
        idx = int(i['imageIndex'])
        d = SPAWNER_DISPATCH.get(idx)
        sp = {'x': i['x'], 'y': i['y'], 'index': idx}
        if d:
            sp.update({'kind': d['kind'], 'hp': d['hp'],
                       'immunity': d['immunity'], 'variant': d.get('variant'),
                       'blend': d.get('blend'), 'spd': d.get('spd')})
        else:
            sp['kind'] = None          # index 18+: not an enemy
        spawners.append(sp)

    kris = next((i for i in inst if i['obj'] == 'obj_mainchara_board'), None)
    # THE SWORD. Every sword level holds exactly one obj_board_pickup, drawn
    # with spr_board_key at scale 2. Its Step ends `player.sword = true`.
    pickup = next((i for i in inst if i['obj'] == 'obj_board_pickup'), None)
    cam = CAMERA_START.get(room)

    out = {
        '_source': f'{room}, DELTARUNE Chapter 3 — dump_room.csx + '
                   'dump_room_instances.csx. Rebuild with tools/build-levels.py.',
        'number': number,
        'title': title,
        'room': room,
        'width': rd['width'], 'height': rd['height'],
        'roomStartingX': cam[0] if cam else 128,
        'roomStartingY': cam[1] if cam else 64,
        'bgColor': '#%02x%02x%02x' % (r, g, b),
        'tileset': {'file': '../tileset.png', 'tileW': tiles['tileW'],
                    'tileH': tiles['tileH'], 'cols': tiles['tileCols'],
                    'border': tiles['border']},
        'tilesX': tiles['tilesX'], 'tilesY': tiles['tilesY'],
        'grid': tiles['grid'],
        'solids': solids,
        'spawners': spawners,
        'kris': {'x': kris['x'], 'y': kris['y'], 'scale': int(kris['sx'])} if kris else None,
        'pickup': {'x': pickup['x'], 'y': pickup['y'],
                   'sprite': pickup['sprite']} if pickup else None,
        # Counted, not translated — these are the next phase's work.
        'todo': {k: sum(1 for i in inst if i['obj'] == k)
                 for k in sorted({i['obj'] for i in inst})
                 if k not in SOLID_OBJECTS and k.startswith('obj_board_')},
    }
    path = os.path.join(out_dir, f'{number}.json')
    json.dump(out, open(path, 'w'))
    print(f'  level {number}: {rd["width"]}x{rd["height"]}, '
          f'{len(solids)} solids, {tiles["tilesX"]}x{tiles["tilesY"]} tiles, '
          f'{sum(1 for s in spawners if s["kind"])} spawners, '
          f'sword at {(pickup["x"], pickup["y"]) if pickup else "-"} '
          f'-> {path}')
    return out

def main():
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'levels')
    os.makedirs(out_dir, exist_ok=True)
    built = []
    for room, number, title in LEVELS:
        b = build(room, number, title, out_dir)
        if b: built.append({'number': number, 'title': title, 'room': room,
                            'file': f'{number}.json'})
    json.dump(built, open(os.path.join(out_dir, 'index.json'), 'w'))
    print(f'wrote {len(built)} level(s)')

if __name__ == '__main__':
    main()
