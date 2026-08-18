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
    kris = next((i for i in inst if i['obj'] == 'obj_mainchara_board'), None)
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
        'kris': {'x': kris['x'], 'y': kris['y'], 'scale': int(kris['sx'])} if kris else None,
        # Counted, not translated — these are the next phase's work.
        'todo': {k: sum(1 for i in inst if i['obj'] == k)
                 for k in sorted({i['obj'] for i in inst})
                 if k not in SOLID_OBJECTS and k.startswith('obj_board_')},
    }
    path = os.path.join(out_dir, f'{number}.json')
    json.dump(out, open(path, 'w'))
    print(f'  level {number}: {rd["width"]}x{rd["height"]}, '
          f'{len(solids)} solids, {tiles["tilesX"]}x{tiles["tilesY"]} tiles '
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
