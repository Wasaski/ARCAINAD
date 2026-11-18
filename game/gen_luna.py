#!/usr/bin/env python3
"""Arcainad 0.9 'LUNA ALPHA' - gerador de assets premium.

Nao usa leitura de PNG (a build de Pillow deste ambiente nao tem plugin PNG),
todo o trabalho e feito em memoria e salvo com o encoder proprio do projeto.

Gera (sobrescreve) em ./assets:
- tileset_forest.png, tileset_lab.png
- lab_floor.png, forest_ground.png  (chao pre-renderizado / cache estatico)
- player_base.png, player_with_backpack.png, player_spritesheet.png  (Luna)
- obj_tree.png, obj_tree_trunk.png, obj_tree_canopy.png, obj_shadow.png
- npc_robot.png, npc_scientist.png, npc_merchant.png
"""

from __future__ import annotations

import os
import random

from PIL import Image, ImageDraw

from generate_assets import ASSETS_DIR, save_png

TILE = 32

GRASS_A = (38, 96, 46)
GRASS_B = (32, 84, 40)
GRASS_C = (46, 110, 52)
DIRT_A = (122, 92, 58)
DIRT_B = (108, 80, 50)

TUNIC = (90, 46, 123)
TUNIC_DARK = (62, 30, 88)
TUNIC_LIGHT = (116, 64, 156)
GOLD = (241, 196, 15)
GOLD_DARK = (176, 138, 8)
BOOT = (44, 20, 62)
HEAD_WHITE = (255, 255, 255)
EYE = (12, 10, 18)
OUTLINE = (14, 12, 22)


# ---------------------------------------------------------------- terreno
def _noise_tile(base, seed, spread=14, blades=0, flowers=0, dirt=False):
    rnd = random.Random(seed)
    img = Image.new("RGBA", (TILE, TILE), base + (255,))
    d = ImageDraw.Draw(img)
    px = img.load()
    for y in range(TILE):
        for x in range(TILE):
            n = rnd.randint(-spread, spread)
            px[x, y] = (max(0, min(255, base[0] + n)),
                        max(0, min(255, base[1] + n)),
                        max(0, min(255, base[2] + n)), 255)
    for _ in range(blades):
        x, y = rnd.randrange(TILE), rnd.randrange(TILE)
        c = (max(0, base[0] - 14), max(0, base[1] + 16), max(0, base[2] - 10), 255)
        d.point((x, y), fill=c)
        d.point(((x + 1) % TILE, y), fill=c)
        d.point((x, (y + 1) % TILE), fill=c)
    if dirt:
        for _ in range(26):
            x, y = rnd.randrange(TILE), rnd.randrange(TILE)
            v = rnd.randint(-16, 16)
            d.point((x, y), fill=(max(0, min(255, DIRT_A[0] + v)),
                                  max(0, min(255, DIRT_A[1] + v)),
                                  max(0, min(255, DIRT_A[2] + v)), 255))
    if flowers:
        cols = [(255, 138, 190), (255, 226, 92), (186, 132, 255), (240, 245, 255)]
        for _ in range(flowers):
            x, y = rnd.randrange(3, TILE - 3), rnd.randrange(3, TILE - 3)
            petal = rnd.choice(cols)
            d.point((x, y), fill=petal + (255,))
            d.point((x + 1, y), fill=petal + (255,))
            d.point((x, (y + 1) % TILE), fill=(30, 110, 40, 255))
    return img


def build_forest_tiles():
    return [
        _noise_tile(GRASS_A, 11, blades=10),
        _noise_tile(GRASS_B, 23, blades=8),
        _noise_tile(GRASS_C, 37, blades=12, flowers=3),
        _noise_tile(DIRT_B, 51, dirt=True, blades=3),
    ]


def _floor_tile(size=TILE):
    """Piso do laboratorio: seamless, sem linhas de grade."""
    rnd = random.Random(5)
    img = Image.new("RGBA", (size, size), (26, 30, 42, 255))
    d = ImageDraw.Draw(img)
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = rnd.randint(-5, 5)
            px[x, y] = (26 + n, 30 + n, 42 + n, 255)
    for _ in range(7):
        x, y = rnd.randrange(size), rnd.randrange(size)
        d.point((x, y), fill=(35, 41, 56, 255))
        d.point(((x + 1) % size, y), fill=(35, 41, 56, 255))
    for _ in range(3):
        x, y = rnd.randrange(size), rnd.randrange(size)
        d.point((x, y), fill=(42, 54, 72, 255))
    return img


def _wall_tile(size=TILE):
    wall = Image.new("RGBA", (size, size), (44, 50, 68, 255))
    d = ImageDraw.Draw(wall)
    d.rectangle([0, 0, size - 1, size - 1], fill=(44, 50, 68, 255), outline=(58, 66, 88, 255))
    d.rectangle([0, size - 6, size - 1, size - 1], fill=(26, 30, 42, 255))
    d.line([(0, 3), (size - 1, 3)], fill=(70, 80, 104, 255))
    for x in range(4, size, 8):
        d.point((x, size - 4), fill=(90, 100, 126, 255))
    return wall


def save_forest(tiles) -> str:
    sheet = Image.new("RGBA", (TILE * len(tiles), TILE), (0, 0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * TILE, 0))
    out = os.path.join(ASSETS_DIR, "tileset_forest.png")
    save_png(out, sheet)
    return out


def save_lab(floor, wall) -> str:
    sheet = Image.new("RGBA", (TILE * 2, TILE), (0, 0, 0, 0))
    sheet.paste(floor, (0, 0))
    sheet.paste(wall, (TILE, 0))
    out = os.path.join(ASSETS_DIR, "tileset_lab.png")
    save_png(out, sheet)
    return out


def save_lab_floor(floor, mw=14, mh=10) -> str:
    img = Image.new("RGBA", (mw * TILE, mh * TILE), (0, 0, 0, 255))
    for y in range(mh):
        for x in range(mw):
            img.paste(floor, (x * TILE, y * TILE))
    out = os.path.join(ASSETS_DIR, "lab_floor.png")
    save_png(out, img)
    return out


def save_forest_ground(tiles, mw=40, mh=30) -> str:
    rnd = random.Random(1337)
    img = Image.new("RGBA", (mw * TILE, mh * TILE), (0, 0, 0, 255))
    for y in range(mh):
        for x in range(mw):
            r = rnd.random()
            idx = 0 if r < 0.72 else (1 if r < 0.9 else (2 if r < 0.96 else 3))
            img.paste(tiles[idx], (x * TILE, y * TILE))
    ranch = (26, 18, 33, 23)
    for y in range(ranch[1], ranch[3] + 1):
        for x in range(ranch[0], ranch[2] + 1):
            img.paste(tiles[3], (x * TILE, y * TILE))
    out = os.path.join(ASSETS_DIR, "forest_ground.png")
    save_png(out, img)
    return out


# ---------------------------------------------------------------- Luna
def _luna_frame(direction, step):
    img = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bob = -1 if step in (1, 3) else 0
    leg = 1 if step == 1 else (-1 if step == 3 else 0)

    d.ellipse([9, 28, 23, 31], fill=(0, 0, 0, 70))

    body_top = 16 + bob
    d.polygon([(11, body_top), (21, body_top), (23, 28 + bob), (9, 28 + bob)],
              fill=TUNIC, outline=OUTLINE)
    d.polygon([(11, body_top), (21, body_top), (21, body_top + 4), (11, body_top + 4)],
              fill=TUNIC_LIGHT)
    d.rectangle([9, 26 + bob, 23, 27 + bob], fill=GOLD)
    d.point((10, 26 + bob), fill=GOLD_DARK)
    d.point((22, 26 + bob), fill=GOLD_DARK)
    d.rectangle([14, 19 + bob, 18, 22 + bob], fill=GOLD, outline=GOLD_DARK)
    d.point((15, 20 + bob), fill=(255, 246, 170, 255))
    d.rectangle([11 + leg, 28 + bob, 14 + leg, 31], fill=BOOT, outline=OUTLINE)
    d.rectangle([18 - leg, 28 + bob, 21 - leg, 31], fill=BOOT, outline=OUTLINE)
    d.rectangle([8, 18 + bob, 10, 24 + bob], fill=TUNIC_DARK, outline=OUTLINE)
    d.rectangle([22, 18 + bob, 24, 24 + bob], fill=TUNIC_DARK, outline=OUTLINE)

    hx = 15 if direction == 'left' else (17 if direction == 'right' else 16)
    top = 2 + bob
    d.polygon([(hx, top), (hx + 6, top + 7), (hx + 5, top + 13),
               (hx - 5, top + 13), (hx - 6, top + 7)],
              fill=HEAD_WHITE, outline=OUTLINE)
    d.ellipse([hx - 6, top + 4, hx + 6, top + 14], fill=HEAD_WHITE, outline=OUTLINE)
    d.rectangle([hx - 5, top + 6, hx + 5, top + 12], fill=HEAD_WHITE)

    if direction != 'up':
        off = -1 if direction == 'left' else (1 if direction == 'right' else 0)
        d.rectangle([hx - 3 + off, top + 7, hx - 1 + off, top + 10], fill=EYE)
        d.rectangle([hx + 1 + off, top + 7, hx + 3 + off, top + 10], fill=EYE)

    for (px, py) in [(hx - 9, top + 2), (hx + 8, top + 4),
                     (hx - 7, top + 12), (hx + 9, top + 12)]:
        d.point((px, py), fill=(255, 255, 255, 255))
    return img


def _luna_sheet(pack=False):
    order = ['down', 'up', 'left', 'right']
    sheet = Image.new("RGBA", (TILE * 4, TILE * 4), (0, 0, 0, 0))
    for row, direction in enumerate(order):
        for col in range(4):
            frame = _luna_frame(direction, col)
            if pack and direction == 'up':
                d = ImageDraw.Draw(frame)
                d.rectangle([11, 17, 21, 25], fill=(30, 40, 70, 255), outline=OUTLINE)
                d.rectangle([12, 18, 20, 21], fill=(50, 70, 110, 255))
                d.point((16, 23), fill=(57, 255, 20, 255))
            sheet.paste(frame, (col * TILE, row * TILE))
    return sheet


def save_players():
    paths = []
    for pack, name in ((False, 'player_base.png'), (True, 'player_with_backpack.png')):
        out = os.path.join(ASSETS_DIR, name)
        save_png(out, _luna_sheet(pack))
        paths.append(out)
    compat = os.path.join(ASSETS_DIR, 'player_spritesheet.png')
    save_png(compat, _luna_sheet(False))
    paths.append(compat)
    return paths


# ---------------------------------------------------------------- flora
def save_trees():
    tw, th = 64, 96
    trunk = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(trunk)
    d.rectangle([27, 40, 37, 88], fill=(96, 62, 34, 255), outline=(48, 28, 14, 255))
    rnd = random.Random(9)
    for _ in range(40):
        x = rnd.randint(28, 36)
        y = rnd.randint(42, 86)
        v = rnd.randint(-18, 18)
        d.point((x, y), fill=(max(0, 96 + v), max(0, 62 + v // 2), max(0, 34 + v // 3), 255))
    d.rectangle([29, 44, 31, 84], fill=(124, 84, 48, 255))
    d.rectangle([34, 46, 35, 82], fill=(70, 42, 20, 255))
    d.polygon([(27, 84), (18, 92), (26, 90)], fill=(80, 50, 26, 255), outline=(48, 28, 14, 255))
    d.polygon([(37, 84), (46, 92), (38, 90)], fill=(80, 50, 26, 255), outline=(48, 28, 14, 255))
    trunk_path = os.path.join(ASSETS_DIR, 'obj_tree_trunk.png')
    save_png(trunk_path, trunk)

    cw, ch = 72, 64
    canopy = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(canopy)
    for ox, oy, rx, ry, col in [
        (36, 40, 32, 22, (18, 62, 28, 255)),
        (24, 38, 20, 16, (26, 84, 34, 255)),
        (48, 38, 20, 16, (22, 76, 32, 255)),
        (36, 26, 26, 18, (34, 104, 44, 255)),
        (30, 20, 16, 12, (52, 138, 60, 255)),
    ]:
        d.ellipse([ox - rx, oy - ry, ox + rx, oy + ry], fill=col, outline=(12, 44, 18, 255))
    d.ellipse([22, 10, 40, 22], fill=(150, 220, 160, 90))
    d.ellipse([26, 12, 34, 18], fill=(210, 245, 215, 120))
    d.ellipse([14, 42, 58, 56], fill=(10, 40, 16, 120))
    canopy_path = os.path.join(ASSETS_DIR, 'obj_tree_canopy.png')
    save_png(canopy_path, canopy)

    combo = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    combo.paste(canopy, (-4, 4))
    combo.paste(trunk, (0, 0))
    combo_path = os.path.join(ASSETS_DIR, 'obj_tree.png')
    save_png(combo_path, combo)
    return [trunk_path, canopy_path, combo_path]


def save_shadow():
    w, h = 48, 16
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([2, 2, w - 3, h - 3], fill=(0, 0, 0, 90))
    d.ellipse([8, 4, w - 9, h - 5], fill=(0, 0, 0, 60))
    out = os.path.join(ASSETS_DIR, 'obj_shadow.png')
    save_png(out, img)
    return out


# ---------------------------------------------------------------- NPCs
def _npc_frame(kind, step):
    img = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bob = -1 if step in (1, 3) else 0
    leg = 1 if step == 1 else (-1 if step == 3 else 0)
    d.ellipse([10, 28, 22, 31], fill=(0, 0, 0, 70))

    if kind == 'robot':
        body, dark, accent = (150, 158, 172, 255), (96, 102, 116, 255), (0, 220, 255, 255)
        d.rectangle([11, 15 + bob, 21, 27 + bob], fill=body, outline=OUTLINE)
        d.rectangle([13, 18 + bob, 19, 22 + bob], fill=dark, outline=OUTLINE)
        d.point((15, 20 + bob), fill=accent)
        d.point((17, 20 + bob), fill=accent)
        d.rectangle([12, 8 + bob, 20, 15 + bob], fill=body, outline=OUTLINE)
        d.rectangle([14, 11 + bob, 18, 13 + bob], fill=(20, 30, 40, 255), outline=accent)
        d.line([(16, 8 + bob), (16, 5 + bob)], fill=dark)
        d.point((16, 4 + bob), fill=(255, 90, 90, 255))
        d.rectangle([8, 17 + bob, 10, 24 + bob], fill=dark, outline=OUTLINE)
        d.rectangle([22, 17 + bob, 24, 24 + bob], fill=dark, outline=OUTLINE)
        d.rectangle([12 + leg, 27 + bob, 15 + leg, 31], fill=dark, outline=OUTLINE)
        d.rectangle([17 - leg, 27 + bob, 20 - leg, 31], fill=dark, outline=OUTLINE)
    elif kind == 'scientist':
        coat, shade = (232, 238, 248, 255), (196, 206, 222, 255)
        d.polygon([(11, 15 + bob), (21, 15 + bob), (23, 28 + bob), (9, 28 + bob)],
                  fill=coat, outline=OUTLINE)
        d.line([(16, 16 + bob), (16, 27 + bob)], fill=shade)
        d.rectangle([12, 8 + bob, 20, 15 + bob], fill=(255, 214, 176, 255), outline=OUTLINE)
        d.rectangle([12, 6 + bob, 20, 9 + bob], fill=(226, 232, 244, 255), outline=OUTLINE)
        d.rectangle([13, 11 + bob, 15, 13 + bob], fill=(40, 60, 90, 255))
        d.rectangle([17, 11 + bob, 19, 13 + bob], fill=(40, 60, 90, 255))
        d.point((14, 12 + bob), fill=(180, 240, 255, 255))
        d.point((18, 12 + bob), fill=(180, 240, 255, 255))
        d.rectangle([12 + leg, 27 + bob, 15 + leg, 31], fill=(60, 66, 84, 255), outline=OUTLINE)
        d.rectangle([17 - leg, 27 + bob, 20 - leg, 31], fill=(60, 66, 84, 255), outline=OUTLINE)
        d.rectangle([22, 18 + bob, 25, 24 + bob], fill=(240, 246, 255, 255), outline=OUTLINE)
    else:
        cloak, cloak_d = (196, 92, 60, 255), (150, 64, 40, 255)
        d.polygon([(11, 15 + bob), (21, 15 + bob), (24, 28 + bob), (8, 28 + bob)],
                  fill=cloak, outline=OUTLINE)
        d.polygon([(11, 15 + bob), (21, 15 + bob), (21, 19 + bob), (11, 19 + bob)], fill=cloak_d)
        d.rectangle([12, 8 + bob, 20, 15 + bob], fill=(214, 168, 124, 255), outline=OUTLINE)
        d.rectangle([10, 6 + bob, 22, 10 + bob], fill=(120, 72, 48, 255), outline=OUTLINE)
        d.point((15, 12 + bob), fill=(30, 24, 20, 255))
        d.point((18, 12 + bob), fill=(30, 24, 20, 255))
        d.rectangle([9, 17 + bob, 11, 25 + bob], fill=cloak_d, outline=OUTLINE)
        d.rectangle([21, 17 + bob, 23, 25 + bob], fill=cloak_d, outline=OUTLINE)
        d.rectangle([12 + leg, 27 + bob, 15 + leg, 31], fill=(70, 52, 40, 255), outline=OUTLINE)
        d.rectangle([17 - leg, 27 + bob, 20 - leg, 31], fill=(70, 52, 40, 255), outline=OUTLINE)
        d.rectangle([23, 22 + bob, 27, 27 + bob], fill=(160, 130, 70, 255), outline=OUTLINE)
    return img


def save_npcs():
    paths = []
    for kind in ('robot', 'scientist', 'merchant'):
        sheet = Image.new("RGBA", (TILE * 4, TILE), (0, 0, 0, 0))
        for i in range(4):
            sheet.paste(_npc_frame(kind, i), (i * TILE, 0))
        out = os.path.join(ASSETS_DIR, 'npc_%s.png' % kind)
        save_png(out, sheet)
        paths.append(out)
    return paths


def main():
    os.makedirs(ASSETS_DIR, exist_ok=True)
    out = []
    f_tiles = build_forest_tiles()
    floor = _floor_tile()
    wall = _wall_tile()
    out.append(save_forest(f_tiles))
    out.append(save_lab(floor, wall))
    out.append(save_lab_floor(floor))
    out.append(save_forest_ground(f_tiles))
    out.extend(save_players())
    out.extend(save_trees())
    out.append(save_shadow())
    out.extend(save_npcs())
    for p in out:
        print('OK:', p)


if __name__ == '__main__':
    main()