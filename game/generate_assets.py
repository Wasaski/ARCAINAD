#!/usr/bin/env python3
"""
Gera assets procedurais para Arcainad.
Usa Pillow para desenhar e um encoder PNG mínimo (stdlib zlib/struct) para salvar.
Salva em ./assets:
- tileset_lab.png, player_spritesheet.png, pc_sprite.png
- tileset_forest.png, obj_tree.png, obj_bush.png, obj_lab_exterior.png
- obj_mountain.png, tileset_farm.png, obj_fence.png
- obj_backpack.png, player_base.png, player_with_backpack.png
"""

from __future__ import annotations

import os
import random
import struct
import zlib
from PIL import Image, ImageDraw

# Paleta laboratório
FLOOR_A = (18, 20, 30, 255)
FLOOR_B = (24, 26, 38, 255)
GRID_LINE = (0, 255, 255, 40)
WALL_DARK = (28, 30, 40, 255)
WALL_METAL = (45, 48, 60, 255)
WALL_EDGE = (60, 65, 80, 255)
NEON_GREEN = (57, 255, 20, 255)
NEON_GREEN_DIM = (57, 255, 20, 120)
CYAN = (0, 255, 255, 255)
PURPLE = (138, 43, 226, 255)
SKIN = (255, 210, 170, 255)
COAT = (230, 235, 245, 255)
COAT_SHADOW = (180, 190, 210, 255)
HAIR = (40, 30, 60, 255)
BOOT = (30, 30, 40, 255)
OUTLINE = (10, 10, 18, 255)
TRANSPARENT = (0, 0, 0, 0)
PACK = (30, 40, 70, 255)
PACK_LIGHT = (50, 70, 110, 255)
PACK_DARK = (20, 28, 50, 255)

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")


def save_png(path: str, img: Image.Image) -> None:
    img = img.convert("RGBA")
    w, h = img.size
    raw = img.tobytes()
    stride = w * 4
    scanlines = b"".join(b"\x00" + raw[y * stride:(y + 1) * stride] for y in range(h))
    compressed = zlib.compress(scanlines, 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


# ===== Laboratório =====
def make_floor_tile(size: int = 32) -> Image.Image:
    img = Image.new("RGBA", (size, size), FLOOR_A)
    d = ImageDraw.Draw(img)
    half = size // 2
    d.rectangle([half, 0, size - 1, half - 1], fill=FLOOR_B)
    d.rectangle([0, half, half - 1, size - 1], fill=FLOOR_B)
    d.line([(0, 0), (size - 1, 0)], fill=GRID_LINE)
    d.line([(0, 0), (0, size - 1)], fill=GRID_LINE)
    d.line([(half, 0), (half, size - 1)], fill=(0, 255, 255, 25))
    d.line([(0, half), (size - 1, half)], fill=(0, 255, 255, 25))
    d.point([(8, 8), (24, 24)], fill=(138, 43, 226, 60))
    return img


def make_wall_tile(size: int = 32) -> Image.Image:
    img = Image.new("RGBA", (size, size), WALL_DARK)
    d = ImageDraw.Draw(img)
    d.rectangle([1, 1, size - 2, size - 2], fill=WALL_METAL, outline=WALL_EDGE)
    d.line([(4, 6), (size - 5, 6)], fill=(70, 75, 90, 255))
    d.line([(4, size - 7), (size - 5, size - 7)], fill=(70, 75, 90, 255))
    for px, py in [(5, 4), (size - 6, 4), (5, size - 5), (size - 6, size - 5)]:
        d.point((px, py), fill=(90, 95, 110, 255))
    d.rectangle([size // 2 - 1, 3, size // 2 + 1, size - 4], fill=NEON_GREEN_DIM)
    d.line([(size // 2, 4), (size // 2, size - 5)], fill=NEON_GREEN)
    d.line([(2, 2), (size - 3, 2)], fill=(138, 43, 226, 80))
    return img


def generate_tileset_lab() -> str:
    tile = 32
    sheet = Image.new("RGBA", (tile * 2, tile), TRANSPARENT)
    sheet.paste(make_floor_tile(tile), (0, 0))
    sheet.paste(make_wall_tile(tile), (tile, 0))
    out = os.path.join(ASSETS_DIR, "tileset_lab.png")
    save_png(out, sheet)
    return out


def draw_backpack(draw: ImageDraw.ImageDraw, x: int, y: int, direction: str, body_top: int, bob: int, layer: str = 'back') -> None:
    """Desenha mochila nas costas. layer='back' atrás do corpo, 'front' detalhes sobre o corpo (alças)."""
    by = body_top + 2
    if direction == 'up':
        if layer == 'back':
            # Mochila visível nas costas (visão de trás)
            draw.rectangle([x + 11, by, x + 20, by + 8], fill=PACK, outline=OUTLINE)
            draw.rectangle([x + 12, by + 1, x + 19, by + 4], fill=PACK_LIGHT)
            draw.rectangle([x + 12, by + 5, x + 19, by + 7], fill=PACK_DARK)
            draw.point((x + 15, by + 3), fill=NEON_GREEN)
            draw.point((x + 16, by + 3), fill=NEON_GREEN)
    elif direction == 'down':
        if layer == 'back':
            # Corpo da mochila atrás do personagem (pouco visível nas laterais)
            draw.rectangle([x + 10, by, x + 12, by + 7], fill=PACK, outline=OUTLINE)
            draw.rectangle([x + 19, by, x + 21, by + 7], fill=PACK, outline=OUTLINE)
            draw.rectangle([x + 11, by + 1, x + 12, by + 4], fill=PACK_LIGHT)
            draw.rectangle([x + 19, by + 1, x + 20, by + 4], fill=PACK_LIGHT)
        else:
            # Alças sobre os ombros (na frente do corpo)
            draw.line([(x + 12, body_top + 1), (x + 12, body_top + 6)], fill=PACK_DARK)
            draw.line([(x + 19, body_top + 1), (x + 19, body_top + 6)], fill=PACK_DARK)
    elif direction == 'left':
        if layer == 'back':
            # Mochila nas costas, lado direito do sprite (atrás do corpo)
            draw.rectangle([x + 20, by, x + 23, by + 8], fill=PACK, outline=OUTLINE)
            draw.rectangle([x + 21, by + 1, x + 22, by + 4], fill=PACK_LIGHT)
            draw.point((x + 22, by + 6), fill=CYAN)
        else:
            # Alça
            draw.line([(x + 16, body_top + 1), (x + 20, body_top + 2)], fill=PACK_DARK)
    elif direction == 'right':
        if layer == 'back':
            # Mochila nas costas, lado esquerdo do sprite (atrás do corpo)
            draw.rectangle([x + 8, by, x + 11, by + 8], fill=PACK, outline=OUTLINE)
            draw.rectangle([x + 9, by + 1, x + 10, by + 4], fill=PACK_LIGHT)
            draw.point((x + 9, by + 6), fill=CYAN)
        else:
            # Alça
            draw.line([(x + 15, body_top + 1), (x + 11, body_top + 2)], fill=PACK_DARK)


def draw_chibi(draw: ImageDraw.ImageDraw, x: int, y: int, direction: str, frame: int, with_backpack: bool = False) -> None:
    bob = [0, -1, 0, -1][frame % 4]
    leg_shift = [0, 2, 0, -2][frame % 4]
    body_top = y + 14 + bob

    # Camada traseira da mochila (atrás do corpo/personagem)
    if with_backpack and direction in ('up', 'left', 'right', 'down'):
        draw_backpack(draw, x, y, direction, body_top, bob, layer='back')

    # Corpo
    if direction == 'up':
        draw.rectangle([x + 10, body_top, x + 21, y + 26], fill=COAT, outline=OUTLINE)
        draw.rectangle([x + 12, body_top + 2, x + 19, body_top + 8], fill=COAT_SHADOW)
    else:
        draw.rectangle([x + 10, body_top, x + 21, y + 26], fill=COAT, outline=OUTLINE)
        draw.line([(x + 15, body_top + 1), (x + 15, y + 25)], fill=COAT_SHADOW)
        draw.rectangle([x + 13, body_top + 4, x + 18, body_top + 7], fill=(0, 255, 255, 120))

    # Pernas/botas
    if direction in ('left', 'right'):
        ls = leg_shift
        draw.rectangle([x + 11 + ls, y + 26, x + 14 + ls, y + 30], fill=BOOT, outline=OUTLINE)
        draw.rectangle([x + 17 - ls, y + 26, x + 20 - ls, y + 30], fill=BOOT, outline=OUTLINE)
    else:
        draw.rectangle([x + 11, y + 26 + (1 if leg_shift > 0 else 0), x + 14, y + 30], fill=BOOT, outline=OUTLINE)
        draw.rectangle([x + 17, y + 26 + (1 if leg_shift < 0 else 0), x + 20, y + 30], fill=BOOT, outline=OUTLINE)

    # Cabeça
    head_y = y + 4 + bob
    draw.ellipse([x + 8, head_y, x + 23, head_y + 12], fill=SKIN, outline=OUTLINE)
    if direction == 'up':
        draw.arc([x + 8, head_y - 1, x + 23, head_y + 10], start=180, end=360, fill=HAIR, width=3)
    else:
        draw.ellipse([x + 8, head_y - 1, x + 23, head_y + 6], fill=HAIR, outline=OUTLINE)

    # Olhos
    if direction == 'down':
        draw.point([(x + 13, head_y + 7), (x + 18, head_y + 7)], fill=OUTLINE)
        draw.point([(x + 13, head_y + 8), (x + 18, head_y + 8)], fill=CYAN)
    elif direction == 'left':
        draw.point([(x + 11, head_y + 7), (x + 14, head_y + 7)], fill=OUTLINE)
        draw.point([(x + 11, head_y + 8)], fill=CYAN)
    elif direction == 'right':
        draw.point([(x + 17, head_y + 7), (x + 20, head_y + 7)], fill=OUTLINE)
        draw.point([(x + 20, head_y + 8)], fill=CYAN)

    # Camada frontal da mochila (alças sobre ombros/corpo)
    if with_backpack and direction in ('down', 'left', 'right'):
        draw_backpack(draw, x, y, direction, body_top, bob, layer='front')

    # Braços
    arm_y = body_top + 3
    if direction == 'left':
        draw.line([(x + 10, arm_y), (x + 7, arm_y + 4 + leg_shift // 2)], fill=OUTLINE, width=2)
        draw.line([(x + 21, arm_y), (x + 23, arm_y + 3)], fill=OUTLINE, width=2)
    elif direction == 'right':
        draw.line([(x + 21, arm_y), (x + 24, arm_y + 4 - leg_shift // 2)], fill=OUTLINE, width=2)
        draw.line([(x + 10, arm_y), (x + 8, arm_y + 3)], fill=OUTLINE, width=2)
    else:
        swing = leg_shift // 2
        draw.line([(x + 10, arm_y), (x + 8, arm_y + 4 + swing)], fill=OUTLINE, width=2)
        draw.line([(x + 21, arm_y), (x + 23, arm_y + 4 - swing)], fill=OUTLINE, width=2)


def _generate_player_sheet(with_backpack: bool) -> Image.Image:
    frame_w, frame_h = 32, 32
    directions = ['down', 'up', 'left', 'right']
    sheet = Image.new("RGBA", (frame_w * 4, frame_h * 4), TRANSPARENT)
    d = ImageDraw.Draw(sheet)
    for r, direction in enumerate(directions):
        for c in range(4):
            draw_chibi(d, c * frame_w, r * frame_h, direction, c, with_backpack=with_backpack)
    return sheet


def generate_player_spritesheets() -> list[str]:
    """Gera player_base.png, player_with_backpack.png e player_spritesheet.png (alias base)."""
    base = _generate_player_sheet(False)
    pack = _generate_player_sheet(True)
    p_base = os.path.join(ASSETS_DIR, "player_base.png")
    p_pack = os.path.join(ASSETS_DIR, "player_with_backpack.png")
    p_compat = os.path.join(ASSETS_DIR, "player_spritesheet.png")
    save_png(p_base, base)
    save_png(p_pack, pack)
    save_png(p_compat, base)  # compatibilidade
    return [p_base, p_pack, p_compat]


def generate_obj_backpack() -> str:
    """Mochila pixel art retrô com detalhes neon (objeto no laboratório)."""
    w, h = 24, 24
    img = Image.new("RGBA", (w, h), TRANSPARENT)
    d = ImageDraw.Draw(img)
    # corpo da mochila
    d.rectangle([5, 6, 18, 20], fill=PACK, outline=OUTLINE)
    d.rectangle([6, 7, 17, 11], fill=PACK_LIGHT)
    d.rectangle([6, 12, 17, 19], fill=PACK_DARK)
    # bolso frontal
    d.rectangle([8, 13, 15, 17], fill=(40, 55, 85, 255), outline=OUTLINE)
    # alças
    d.arc([4, 3, 10, 12], start=180, end=360, fill=PACK_DARK, width=2)
    d.arc([13, 3, 19, 12], start=180, end=360, fill=PACK_DARK, width=2)
    # detalhe neon
    d.line([(7, 9), (16, 9)], fill=NEON_GREEN)
    d.point((11, 15), fill=CYAN)
    d.point((12, 15), fill=CYAN)
    # fivela
    d.rectangle([10, 18, 13, 19], fill=(180, 180, 80, 255), outline=OUTLINE)
    out = os.path.join(ASSETS_DIR, "obj_backpack.png")
    save_png(out, img)
    return out


def generate_pc_sprite() -> str:
    w, h = 48, 48
    img = Image.new("RGBA", (w, h), TRANSPARENT)
    d = ImageDraw.Draw(img)
    table_top = 30
    d.rectangle([4, table_top, 43, table_top + 6], fill=(35, 38, 50, 255), outline=OUTLINE)
    d.rectangle([6, table_top - 1, 41, table_top + 1], fill=(55, 60, 75, 255))
    d.rectangle([8, table_top + 6, 11, 44], fill=(30, 32, 42, 255), outline=OUTLINE)
    d.rectangle([36, table_top + 6, 39, 44], fill=(30, 32, 42, 255), outline=OUTLINE)
    d.rectangle([20, table_top - 4, 27, table_top], fill=(40, 42, 55, 255), outline=OUTLINE)
    d.rectangle([14, table_top - 6, 33, table_top - 4], fill=(40, 42, 55, 255), outline=OUTLINE)
    screen = [10, 8, 37, 26]
    for pad, col in [(3, (0, 255, 255, 30)), (2, (0, 255, 255, 50)), (1, (0, 255, 255, 70))]:
        d.rectangle([screen[0]-pad, screen[1]-pad, screen[2]+pad, screen[3]+pad], outline=col)
    d.rectangle(screen, fill=(5, 20, 28, 255), outline=CYAN)
    for i, yy in enumerate(range(screen[1] + 3, screen[3] - 2, 3)):
        lw = 18 - (i % 3) * 4
        d.line([(screen[0] + 3, yy), (screen[0] + 3 + lw, yy)], fill=(0, 220, 220, 200))
    d.line([(screen[0] + 2, screen[1] + 2), (screen[0] + 10, screen[1] + 2)], fill=(120, 255, 255, 120))
    d.point((33, table_top - 5), fill=NEON_GREEN)
    out = os.path.join(ASSETS_DIR, "pc_sprite.png")
    save_png(out, img)
    return out


# ===== Floresta =====
def grass_tile(base, noise_seed, flowers=False, dirt=False):
    rnd = random.Random(noise_seed)
    img = Image.new("RGBA", (32, 32), base)
    d = ImageDraw.Draw(img)
    for _ in range(40):
        x, y = rnd.randint(0, 31), rnd.randint(0, 31)
        delta = rnd.randint(-12, 12)
        c = tuple(max(0, min(255, base[i] + delta)) for i in range(3)) + (255,)
        d.point((x, y), fill=c)
    if dirt:
        for _ in range(18):
            x, y = rnd.randint(4, 27), rnd.randint(4, 27)
            d.point((x, y), fill=(120 + rnd.randint(-10, 10), 85 + rnd.randint(-8, 8), 50, 255))
    if flowers:
        cols = [(255, 120, 180, 255), (255, 230, 80, 255), (180, 120, 255, 255), (255, 255, 255, 255)]
        for _ in range(4):
            x, y = rnd.randint(4, 27), rnd.randint(4, 27)
            d.point((x, y), fill=rnd.choice(cols))
            d.point((x, y+1), fill=(40, 120, 40, 255))
    d.point([(0,0),(31,0),(0,31),(31,31)], fill=(0,0,0,20))
    return img


def generate_tileset_forest() -> str:
    tiles = [
        grass_tile((34, 90, 40, 255), 1),
        grass_tile((28, 78, 34, 255), 2),
        grass_tile((70, 95, 45, 255), 3, dirt=True),
        grass_tile((36, 95, 42, 255), 4, flowers=True),
    ]
    sheet = Image.new("RGBA", (32 * len(tiles), 32), TRANSPARENT)
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * 32, 0))
    out = os.path.join(ASSETS_DIR, "tileset_forest.png")
    save_png(out, sheet)
    return out


def generate_obj_tree() -> str:
    w, h = 64, 80
    img = Image.new("RGBA", (w, h), TRANSPARENT)
    d = ImageDraw.Draw(img)
    for ox, oy, rx, ry, col in [
        (32, 26, 28, 22, (20, 70, 30, 255)),
        (22, 30, 18, 16, (30, 90, 35, 255)),
        (42, 30, 18, 16, (28, 85, 32, 255)),
        (32, 18, 22, 16, (40, 110, 45, 255)),
        (32, 34, 24, 14, (18, 60, 28, 255)),
    ]:
        d.ellipse([ox-rx, oy-ry, ox+rx, oy+ry], fill=col, outline=(10, 40, 15, 255))
    d.ellipse([20, 12, 34, 24], fill=(60, 140, 60, 120))
    d.rectangle([27, 44, 36, 74], fill=(90, 55, 30, 255), outline=(50, 30, 15, 255))
    d.rectangle([29, 46, 31, 72], fill=(110, 70, 40, 255))
    d.rectangle([33, 48, 34, 70], fill=(70, 40, 20, 255))
    d.ellipse([22, 68, 41, 78], fill=(80, 50, 28, 255), outline=(50, 30, 15, 255))
    out = os.path.join(ASSETS_DIR, "obj_tree.png")
    save_png(out, img)
    return out


def generate_obj_bush() -> str:
    w, h = 32, 32
    img = Image.new("RGBA", (w, h), TRANSPARENT)
    d = ImageDraw.Draw(img)
    for ox, oy, rx, ry, col in [
        (16, 20, 13, 9, (25, 80, 35, 255)),
        (10, 22, 8, 7, (30, 95, 40, 255)),
        (22, 22, 8, 7, (28, 90, 38, 255)),
        (16, 15, 10, 7, (40, 115, 50, 255)),
    ]:
        d.ellipse([ox-rx, oy-ry, ox+rx, oy+ry], fill=col, outline=(12, 45, 18, 255))
    for x, y, c in [(12,18,(180,60,80,255)),(20,16,(200,70,90,255)),(16,22,(180,60,80,255))]:
        d.point((x,y), fill=c)
    out = os.path.join(ASSETS_DIR, "obj_bush.png")
    save_png(out, img)
    return out


def generate_obj_lab_exterior() -> str:
    w, h = 128, 128
    img = Image.new("RGBA", (w, h), TRANSPARENT)
    d = ImageDraw.Draw(img)
    d.ellipse([14, 108, 114, 124], fill=(0, 0, 0, 80))
    body = [18, 28, 109, 112]
    d.rectangle(body, fill=(30, 34, 46, 255), outline=(70, 78, 95, 255))
    d.rectangle([22, 32, 105, 108], fill=(40, 45, 60, 255))
    for y in range(40, 105, 12):
        d.line([(24, y), (103, y)], fill=(55, 62, 78, 255))
    for x in range(32, 104, 16):
        d.line([(x, 34), (x, 106)], fill=(50, 56, 72, 255))
    for wx, wy in [(30, 40), (74, 40), (30, 64), (74, 64)]:
        d.rectangle([wx, wy, wx+22, wy+14], fill=(5, 20, 30, 255), outline=CYAN)
        d.rectangle([wx+2, wy+2, wx+20, wy+12], fill=(0, 80, 100, 120))
        d.line([(wx+3, wy+4), (wx+12, wy+4)], fill=(120, 255, 255, 160))
    d.rectangle([40, 18, 88, 28], fill=(35, 40, 55, 255), outline=(80, 90, 110, 255))
    d.rectangle([60, 6, 66, 18], fill=(60, 65, 80, 255), outline=OUTLINE)
    d.ellipse([59, 2, 67, 10], fill=(138, 43, 226, 220), outline=PURPLE)
    d.rectangle([44, 52, 84, 60], fill=(10, 12, 20, 255), outline=NEON_GREEN)
    door = [52, 78, 76, 112]
    for pad, col in [(4,(57,255,20,30)), (2,(57,255,20,60))]:
        d.rectangle([door[0]-pad, door[1]-pad, door[2]+pad, door[3]+pad], outline=col)
    d.rectangle(door, fill=(8, 18, 12, 255), outline=NEON_GREEN)
    d.line([(64, 80), (64, 110)], fill=(57, 255, 20, 120))
    d.rectangle([55, 82, 61, 96], fill=(0, 40, 20, 255), outline=(57,255,20,100))
    d.rectangle([67, 82, 73, 96], fill=(0, 40, 20, 255), outline=(57,255,20,100))
    d.point((61, 96), fill=CYAN)
    d.point((67, 96), fill=CYAN)
    d.rectangle([20, 30, 22, 110], fill=(57,255,20,80))
    d.rectangle([105, 30, 107, 110], fill=(57,255,20,80))
    out = os.path.join(ASSETS_DIR, "obj_lab_exterior.png")
    save_png(out, img)
    return out


def generate_obj_mountain() -> str:
    rnd = random.Random(42)
    w, h = 32, 32
    img = Image.new("RGBA", (w, h), TRANSPARENT)
    d = ImageDraw.Draw(img)
    base_pts = [(0, 31), (4, 18), (10, 10), (16, 6), (22, 9), (28, 16), (31, 31)]
    d.polygon(base_pts, fill=(55, 58, 65, 255), outline=(30, 32, 38, 255))
    d.polygon([(3,31),(8,20),(14,12),(16,8),(20,12),(26,20),(29,31)], fill=(70, 74, 82, 255))
    for _ in range(20):
        x, y = rnd.randint(4, 28), rnd.randint(12, 29)
        d.point((x, y), fill=(90 + rnd.randint(-15,15), 92, 100, 255))
    d.polygon([(10,10),(16,6),(22,9),(19,12),(13,12)], fill=(235, 240, 245, 255))
    d.line([(11,11),(21,10)], fill=(200,210,220,255))
    for x in range(2, 30, 3):
        d.point((x, 29 - (x % 2)), fill=(60, 90, 50, 200))
    out = os.path.join(ASSETS_DIR, "obj_mountain.png")
    save_png(out, img)
    return out


def generate_tileset_farm() -> str:
    rnd = random.Random(7)
    img = Image.new("RGBA", (32, 32), (120, 85, 50, 255))
    d = ImageDraw.Draw(img)
    for _ in range(80):
        x, y = rnd.randint(0, 31), rnd.randint(0, 31)
        delta = rnd.randint(-18, 18)
        c = (max(60, min(170, 120 + delta)), max(40, min(130, 85 + delta//2)), max(25, min(90, 50 + delta//3)), 255)
        d.point((x, y), fill=c)
    for _ in range(6):
        x, y = rnd.randint(2, 29), rnd.randint(2, 29)
        d.point((x, y), fill=(150, 140, 120, 220))
    out = os.path.join(ASSETS_DIR, "tileset_farm.png")
    save_png(out, img)
    return out


def draw_fence_piece(kind: str) -> Image.Image:
    img = Image.new("RGBA", (32, 32), TRANSPARENT)
    d = ImageDraw.Draw(img)
    wood = (140, 95, 45, 255)
    wood_dark = (100, 65, 30, 255)
    wood_light = (170, 120, 60, 255)
    shadow = (0, 0, 0, 60)

    def plank(x1,y1,x2,y2):
        d.rectangle([x1,y1,x2,y2], fill=wood, outline=wood_dark)
        d.line([(x1+1,y1+1),(x2-1,y1+1)], fill=wood_light)
    def post(xc):
        d.rectangle([xc-3, 8, xc+3, 31], fill=wood, outline=wood_dark)
        d.rectangle([xc-1, 9, xc, 30], fill=wood_light)
        d.ellipse([xc-3, 6, xc+3, 12], fill=wood, outline=wood_dark)

    if kind == 'horizontal':
        d.rectangle([0,22,2,31], fill=wood_dark)
        d.rectangle([29,22,31,31], fill=wood_dark)
        plank(0, 14, 31, 18)
        plank(0, 22, 31, 26)
        d.point([(8,16),(16,24),(24,16)], fill=wood_dark)
    elif kind == 'vertical':
        post(16)
        plank(10, 14, 22, 17)
        plank(10, 22, 22, 25)
    elif kind == 'post':
        post(16)
        d.ellipse([10,28,22,31], fill=shadow)
    elif kind == 'gate':
        post(4); post(27)
        plank(6, 14, 25, 17)
        plank(6, 22, 25, 25)
        d.rectangle([12, 18, 19, 21], outline=wood_light)
        d.point([(6,16),(25,24)], fill=(180,180,80,255))
    return img


def generate_obj_fence() -> str:
    kinds = ['horizontal', 'vertical', 'post', 'gate']
    sheet = Image.new("RGBA", (32 * len(kinds), 32), TRANSPARENT)
    for i, k in enumerate(kinds):
        sheet.paste(draw_fence_piece(k), (i*32, 0))
    out = os.path.join(ASSETS_DIR, "obj_fence.png")
    save_png(out, sheet)
    return out




def _forest_tile_image(frame: int):
    """Retorna tile PIL 32x32 equivalente ao frame do tileset_forest."""
    # frames: 0 grama1, 1 grama2, 2 terra, 3 flores
    if frame == 0:
        return grass_tile((34, 90, 40, 255), 1)
    if frame == 1:
        return grass_tile((28, 78, 34, 255), 2)
    if frame == 2:
        return grass_tile((70, 95, 45, 255), 3, dirt=True)
    return grass_tile((36, 95, 42, 255), 4, flowers=True)


def generate_forest_ground(mw: int = 40, mh: int = 30, tile: int = 32) -> str:
    """Gera imagem única do chão da floresta (cache de cenário estático)."""
    img = Image.new("RGBA", (mw * tile, mh * tile), (0, 0, 0, 255))
    # pré-renderiza os 4 tiles de floresta
    tiles = [_forest_tile_image(i) for i in range(4)]
    for y in range(mh):
        for x in range(mw):
            r = (x * 7 + y * 13 + ((x * y) % 5)) % 10
            frame = 0
            if r == 0:
                frame = 1
            elif r == 1:
                frame = 2
            elif r == 2 or r == 3:
                frame = 3
            img.paste(tiles[frame], (x * tile, y * tile))
    # área do cercado (terra batida) - deve coincidir com game.js
    ranch = {"x1": 26, "y1": 18, "x2": 33, "y2": 23}
    farm = None
    # mesmo padrão determinístico do tileset_farm
    farm = Image.new("RGBA", (tile, tile), (120, 85, 50, 255))
    d = ImageDraw.Draw(farm)
    rnd = random.Random(7)
    for _ in range(80):
        px, py = rnd.randint(0, 31), rnd.randint(0, 31)
        delta = rnd.randint(-18, 18)
        c = (max(60, min(170, 120 + delta)), max(40, min(130, 85 + delta//2)), max(25, min(90, 50 + delta//3)), 255)
        d.point((px, py), fill=c)
    for _ in range(6):
        px, py = rnd.randint(2, 29), rnd.randint(2, 29)
        d.point((px, py), fill=(150, 140, 120, 220))
    for y in range(ranch["y1"], ranch["y2"] + 1):
        for x in range(ranch["x1"], ranch["x2"] + 1):
            img.paste(farm, (x * tile, y * tile))
    out = os.path.join(ASSETS_DIR, "forest_ground.png")
    save_png(out, img)
    return out



def generate_obj_cow_skate() -> str:
    """Vaca andando de skate - easter egg (2 frames simples)."""
    fw, fh = 48, 48
    frames = 2
    img = Image.new("RGBA", (fw * frames, fh), TRANSPARENT)

    for i in range(frames):
        ox = i * fw
        d = ImageDraw.Draw(img)
        bob = -1 if i == 0 else 0
        # sombra
        d.ellipse([ox + 8, 40, ox + 40, 46], fill=(0, 0, 0, 70))
        # skate deck
        deck_y = 34 + bob
        d.rounded_rectangle([ox + 6, deck_y, ox + 42, deck_y + 5], radius=2, fill=(220, 60, 80, 255), outline=(120, 20, 35, 255))
        d.line([ox + 10, deck_y + 2, ox + 38, deck_y + 2], fill=(255, 220, 120, 255))
        # rodas
        wy = deck_y + 6
        wx_shift = 0 if i == 0 else 1
        for wx in [14, 34]:
            d.ellipse([ox + wx - 3 + wx_shift, wy - 2, ox + wx + 3 + wx_shift, wy + 4], fill=(40, 40, 50, 255), outline=(15, 15, 20, 255))
            d.point((ox + wx + wx_shift, wy + 1), fill=(180, 180, 190, 255))
        # trucks
        d.rectangle([ox + 12, deck_y + 4, ox + 16, deck_y + 6], fill=(150, 150, 160, 255))
        d.rectangle([ox + 32, deck_y + 4, ox + 36, deck_y + 6], fill=(150, 150, 160, 255))
        # corpo da vaca
        body_y = 22 + bob
        d.ellipse([ox + 14, body_y, ox + 36, body_y + 14], fill=(245, 245, 240, 255), outline=(40, 35, 30, 255))
        # manchas
        d.ellipse([ox + 18, body_y + 2, ox + 23, body_y + 7], fill=(35, 30, 28, 255))
        d.ellipse([ox + 27, body_y + 6, ox + 33, body_y + 11], fill=(35, 30, 28, 255))
        d.ellipse([ox + 22, body_y + 8, ox + 25, body_y + 11], fill=(35, 30, 28, 255))
        # cabeça
        head_y = 14 + bob
        d.ellipse([ox + 30, head_y, ox + 42, head_y + 12], fill=(245, 245, 240, 255), outline=(40, 35, 30, 255))
        # chifres
        d.line([ox + 33, head_y + 1, ox + 31, head_y - 3], fill=(230, 220, 180, 255), width=1)
        d.line([ox + 39, head_y + 1, ox + 41, head_y - 3], fill=(230, 220, 180, 255), width=1)
        # orelhas
        d.ellipse([ox + 29, head_y + 3, ox + 32, head_y + 6], fill=(255, 180, 190, 255), outline=(40,35,30,255))
        d.ellipse([ox + 40, head_y + 3, ox + 43, head_y + 6], fill=(255, 180, 190, 255), outline=(40,35,30,255))
        # focinho
        d.ellipse([ox + 34, head_y + 6, ox + 42, head_y + 11], fill=(255, 190, 200, 255), outline=(40,35,30,255))
        d.point((ox + 37, head_y + 8), fill=(60,40,40,255))
        d.point((ox + 39, head_y + 8), fill=(60,40,40,255))
        # olhos
        d.point((ox + 35, head_y + 4), fill=(20,20,20,255))
        d.point((ox + 38, head_y + 4), fill=(20,20,20,255))
        # patas no skate
        leg_y = body_y + 13
        d.line([ox + 18, leg_y, ox + 18, deck_y], fill=(245,245,240,255))
        d.line([ox + 22, leg_y, ox + 22, deck_y], fill=(245,245,240,255))
        d.line([ox + 28, leg_y, ox + 28, deck_y], fill=(245,245,240,255))
        d.line([ox + 32, leg_y, ox + 32, deck_y], fill=(245,245,240,255))
        # cascos
        for lx in [18, 22, 28, 32]:
            d.point((ox + lx, deck_y), fill=(50,40,30,255))
            d.point((ox + lx, deck_y - 1), fill=(50,40,30,255))
        # rabinho
        tail_x = ox + 13
        tail_y = body_y + 4
        d.line([tail_x, tail_y, tail_x - 3, tail_y - 2 + (1 if i==0 else 0)], fill=(245,245,240,255))
        d.point((tail_x - 3, tail_y - 2 + (1 if i==0 else 0)), fill=(35,30,28,255))

    out = os.path.join(ASSETS_DIR, "obj_cow_skate.png")
    save_png(out, img)
    return out


def main() -> None:
    ensure_dir(ASSETS_DIR)
    outputs = [
        generate_tileset_lab(),
        generate_pc_sprite(),
        generate_tileset_forest(),
        generate_obj_tree(),
        generate_obj_bush(),
        generate_obj_lab_exterior(),
        generate_obj_mountain(),
        generate_tileset_farm(),
        generate_obj_fence(),
        generate_obj_backpack(),
        generate_forest_ground(),
        generate_obj_cow_skate(),
    ]
    outputs.extend(generate_player_spritesheets())
    for p in outputs:
        print(f"OK: {p}")


if __name__ == "__main__":
    main()

# === Cow Skate (vaca) ===
PURPLE_RGB = (90, 46, 123)      # túnica roxa #5A2E7B
GOLD_RGB = (241, 196, 15)      # detalhes dourados #F1C40F
BOOT_COLOR = (70, 10, 180)     # botas roxas escuras
HEAD_BG = (255, 255, 255)      # cabeça branca (máscara)
EYE_BG = (0, 0, 0)             # olhos pretos vazados
PARTICLE_COLOR = (255, 255, 255)  # pixels soltos brancos

def draw_rect(ctx, x, y, w, h, fill, outline=None):
    ctx.fillStyle = fill
    ctx.rect(x, y, w, h, fill=fill)
    if outline:
        ctx.lineWidth = 1
        ctx.strokeStyle = outline
        ctx.strokeRect(x, y, w, h)

def draw_ellipse(ctx, cx, cy, rx, ry, fill, outline=None):
    ctx.ellipse(cx, cy, rx-rx, ry-ry, fill=fill)
    if outline:
        ctx.ellipse(cx, cy, rx-rx, ry-ry, outline=outline)

def draw_line(ctx, x1, y1, x2, y2, fill='rgba(255,255,255,0.25)'):
    ctx.lineWidth = 1
    ctx.strokeStyle = fill
    ctx.lineTo(x2, y2)
    ctx.stroke()

def draw_point(ctx, px, py, fill='rgba(255,255,255,0.6)'):
    ctx.fillStyle = fill
    ctx.ellipse(px, py, 3, 3, fill=fill)

def draw_pixel(ctx, x, y, fill='rgba(255,255,255,0.9)'):
    ctx.fillStyle = fill
    ctx.fillRect(x, y, 1, 1)


def generate_cow_skate_personal():
    """Crea um spritesheet para a vaca/cow: 4 frames (Idle, Walk Down, Up, Left/Right).
       Retorna caminho do arquivo PNG."""
    TILE = 32
    W, H = TILE * 4, TILE * 4  # 4 frames x 4 tiles
    img = Image.new("RGBA", (W, H), TRANSPARENT)
    draw_rect(img, 0, 0, W, H, TRANSPARENT)
    # corpo (túnica) em roxo com bordas douradas e gema central
    draw_rect(img, 0, 0, W, H, PURPLE_RGB, outline=GOLD_RGB)
    # gema central no peito (coração)
    cx, cy = W // 2, H // 2
    draw_rect(img, cx-2, cy-2, 4, 4, GOLD_RGB)
    draw_ellipse(img, cx, cy, 2, 2, GOLD_RGB)
    # cabeça em branco (máscara) no canto superior-esquerdo (16x16)
    draw_rect(img, 0, 0, W, H, HEAD_BG)
    draw_rect(img, 0, 0, W, 16, HEAD_BG)
    draw_rect(img, 0, 16, W, 16, HEAD_BG)
    draw_rect(img, 0, 32, W, 32, HEAD_BG)
    draw_rect(img, 32, 0, W, 32, HEAD_BG)
    draw_rect(img, 32, 32, W, H, HEAD_BG)
    # olhos escuros vazados (pontos negros pequenos)
    draw_ellipse(img, 8, 8, 4, 4, EYE_BG)
    draw_ellipse(img, W-8, 8, 4, 4, EYE_BG)
    # pequenas partículas (pixels) flutuantes ao redor da cabeça
    for _ in range(12):
        bx = 8 + int((Math.random()-0.5)*W)
        by = 8 + int((Math.random()-0.5)*H)
        draw_pixel(img, bx, by, PARTICLE_COLOR)
    return str(img.tobytes()).decode().strip()
