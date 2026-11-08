"""Generate the launcher icon at every size Briefcase may ask for.

The artwork lives in ``icon-source/`` and is resized here rather than being
twenty-six hand-exported binaries, so changing the icon means replacing one
file and running this again.

Run from the repository root:  python mobile/tools/make_icon.py
"""

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

SOURCE = Path("mobile/tools/icon-source/icon.png")
BASE = "mobile/src/budget_manager_mobile/resources/budget_manager_mobile"

#: Sizes the Briefcase Android template asks for, read from its briefcase.toml
#: rather than guessed. Getting any family wrong is invisible until the app is
#: on a phone: the launcher silently falls back to the template's own artwork.
SQUARE_SIZES = (48, 72, 96, 144, 192)
ROUND_SIZES = (48, 72, 96, 144, 192)
#: Splash screens reuse the square family at these sizes.
SPLASH_SIZES = (320, 480, 640, 960, 1280)
#: Adaptive foregrounds: 108dp at each density. Android 8 and above prefer
#: this family and ignore the square one entirely, which is why supplying only
#: the others once left the template's default face on the home screen.
ADAPTIVE_SIZES = (108, 162, 216, 324, 432)

#: Only the middle 72dp of a 108dp adaptive canvas is guaranteed to survive
#: the launcher's mask — a third of the width is cropped on every device, not
#: just the ones that use circles. Sizing the artwork to exactly that square
#: keeps the whole design on screen under a squircle or rounded mask, and
#: costs only the corners of its gold frame under a circular one. Filling the
#: canvas instead would cut away the frame, the plant and the pie chart.
ADAPTIVE_SAFE = 72 / 108

#: The deep blue inside the frame, measured from the artwork rather than
#: picked by eye. The adaptive canvas is filled with it so the launcher's mask
#: always crops this colour — never whatever the Android template happens to
#: put in its background layer, which we do not control.
FILL = (0, 84, 156, 255)

#: Anything at least this bright on all three channels, reachable from a
#: corner, is the page the artwork was exported on rather than the artwork.
PAGE = 235


def plate() -> Image.Image:
    """The artwork alone: page removed, trimmed, and square.

    The source is exported on a white page, and the rounded plate does not
    reach the corners. Pasted as-is, every launcher icon would carry white
    triangles. Flooding inward from the corners clears both at once and stops
    at the first pixel of the artwork, so a white highlight inside the drawing
    is kept rather than punched out.
    """
    img = Image.open(SOURCE).convert("RGBA")
    width, height = img.size
    pixels = img.load()

    seen = {(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)}
    queue = deque(seen)
    while queue:
        x, y = queue.popleft()
        red, green, blue, _ = pixels[x, y]
        if min(red, green, blue) <= PAGE:
            continue
        pixels[x, y] = (red, green, blue, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in seen:
                seen.add((nx, ny))
                queue.append((nx, ny))

    img = img.crop(img.getbbox())
    side = max(img.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2))
    return square


def draw(art: Image.Image, size: int, shape: str = "square") -> Image.Image:
    """One icon.

    ``shape`` is "square", "round", or "adaptive".
    """
    if shape == "adaptive":
        canvas = Image.new("RGBA", (size, size), FILL)
        inner = max(1, round(size * ADAPTIVE_SAFE))
        offset = (size - inner) // 2
        canvas.alpha_composite(art.resize((inner, inner), Image.LANCZOS),
                               (offset, offset))
        return canvas

    scaled = art.resize((size, size), Image.LANCZOS)
    if shape != "round":
        return scaled

    # The round family is used as it arrives — the launcher does not crop it,
    # so it has to be round already. Backing it with the frame's own blue
    # means the clipped corners read as part of the design instead of as a
    # hole, which is the same thing the adaptive canvas is doing.
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    canvas.paste(Image.new("RGBA", (size, size), FILL), (0, 0), mask)
    canvas.alpha_composite(Image.composite(
        scaled, Image.new("RGBA", (size, size), (0, 0, 0, 0)), mask))
    return canvas


def main() -> None:
    art = plate()
    written = 1
    draw(art, 512).save(f"{BASE}.png")
    for size in sorted(set(SQUARE_SIZES) | set(SPLASH_SIZES)):
        draw(art, size).save(f"{BASE}-square-{size}.png")
        written += 1
    for size in SQUARE_SIZES:
        draw(art, size).save(f"{BASE}-{size}.png")
        written += 1
    for size in ROUND_SIZES:
        draw(art, size, "round").save(f"{BASE}-round-{size}.png")
        written += 1
    for size in ADAPTIVE_SIZES:
        draw(art, size, "adaptive").save(f"{BASE}-adaptive-{size}.png")
        written += 1
    print(f"wrote {written} icon files from {SOURCE}")


if __name__ == "__main__":
    main()
