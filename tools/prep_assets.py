"""Turn the raw AI-generated images in art/raw into game-ready files in src/assets/img.

- paintings and paper: centre-cropped from 16:9 to 2:1 and resized to the play field (1184 x 592)
- sprite sheets: the white background connected to the image border is made transparent
  (so white eyes inside a sprite stay white), loose ink specks are dropped, and each of the
  four sprites is cut out, scaled and packed into one row. The rectangles are printed so they
  can be pasted into src/js/assets.js (MR.SPRITES for sprites.png, MR.KING_SPRITES for sprites-king.png).

Run from the project root:  python3 tools/prep_assets.py
"""
import numpy as np
from PIL import Image
from scipy import ndimage

RAW, OUT = "art/raw/", "src/assets/img/"
FIELD = (1184, 592)


def crop_2to1(name, out, q=86, size=FIELD):
    im = Image.open(RAW + name).convert("RGB")
    w, h = im.size
    th = w // 2
    top = (h - th) // 2
    im = im.crop((0, top, w, top + th)).resize(size, Image.LANCZOS)
    im.save(OUT + out, quality=q, optimize=True)
    print(out, im.size)


def cut_sprites(name, out, cells, pad=6):
    im = np.asarray(Image.open(RAW + name).convert("RGB")).astype(np.float32)
    lo = im.min(axis=2)
    # background = near-white pixels connected to the image border
    white = lo > 232
    lab, _ = ndimage.label(white)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, border[border > 0])
    # soft alpha only along the outside edge; the inside of a sprite stays opaque
    near_bg = ndimage.binary_dilation(bg, iterations=3)
    soft = np.clip((250.0 - lo) / 45.0, 0.0, 1.0)
    alpha = np.where(near_bg, soft, 1.0)
    alpha[bg] = np.minimum(alpha[bg], soft[bg])
    safe = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((im - (1.0 - alpha[..., None]) * 255.0) / safe, 0, 255)

    h, w = lo.shape
    solid = ndimage.binary_dilation(alpha > 0.35, iterations=4)
    lab2, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, lab2, range(1, n + 1))
    boxes = ndimage.find_objects(lab2)
    pieces = []
    for key, (cx, cy), target_h in cells:
        # the biggest blob whose centre lies in this quadrant; everything else (ink specks) is dropped
        best = None
        for i, sl in enumerate(boxes):
            mx, my = (sl[1].start + sl[1].stop) / 2, (sl[0].start + sl[0].stop) / 2
            if (mx < w / 2) == (cx == 0) and (my < h / 2) == (cy == 0):
                if best is None or sizes[i] > sizes[best]:
                    best = i
        sl = boxes[best]
        keep = lab2[sl] == best + 1
        a = alpha[sl] * keep
        rgba = np.dstack([rgb[sl], a * 255.0]).astype(np.uint8)
        piece = Image.fromarray(rgba, "RGBA")
        scale = target_h / piece.height
        piece = piece.resize((max(1, round(piece.width * scale)), target_h), Image.LANCZOS)
        pieces.append((key, piece))

    sheet_w = sum(p.width + pad for _, p in pieces) + pad
    sheet_h = max(p.height for _, p in pieces) + pad * 2
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))
    x = pad
    print(out, "rectangles:")
    for key, p in pieces:
        sheet.paste(p, (x, pad))
        print(f"  {key}: {{ x: {x}, y: {pad}, w: {p.width}, h: {p.height} }},")
        x += p.width + pad
    sheet.save(OUT + out, optimize=True)
    print(out, sheet.size)


crop_2to1("painting-lotus-v1.jpg", "painting-lotus.jpg")
crop_2to1("painting-mountain-v1.jpg", "painting-mountain.jpg")
crop_2to1("painting-plum-v1.jpg", "painting-plum.jpg")
crop_2to1("painting-scroll-v1.jpg", "painting-scroll.jpg")
crop_2to1("paper-v1.jpg", "paper.jpg", q=82)
# (key, quadrant (col, row), height in the sheet in pixels: about twice the on-screen size)
cut_sprites("sprites-v1.jpg", "sprites.png", [
    ("drop", (0, 0), 132),
    ("silverfish", (1, 0), 190),
    ("grub", (0, 1), 240),
    ("moth", (1, 1), 150),
])
# the Bookworm King (head, one body segment, the tail) and the incense burner
cut_sprites("sprites-king-v1.jpg", "sprites-king.png", [
    ("kingHead", (0, 0), 230),
    ("kingSeg", (1, 0), 190),
    ("kingTail", (0, 1), 200),
    ("burner", (1, 1), 200),
])
