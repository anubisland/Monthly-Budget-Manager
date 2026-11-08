"""The launcher icon, checked as files on disk rather than as drawing code.

A missing or mis-sized icon family is the quietest failure in this project:
nothing errors, no test fails, and the launcher simply falls back to the
Briefcase template's own artwork. That is exactly what happened once — the
square family was supplied, Android 8 and above read the adaptive family it
did not find, and the BeeWare mascot sat on the home screen while every test
passed. These check the artefacts the device actually reads.
"""

import importlib.util
from pathlib import Path

import pytest
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]


def _make_icon():
    spec = importlib.util.spec_from_file_location(
        "make_icon", ROOT / "mobile" / "tools" / "make_icon.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    #: The generator is written to run from the repository root; the suite is
    #: not, so give it absolute paths rather than depending on the cwd.
    module.SOURCE = ROOT / "mobile" / "tools" / "icon-source" / "icon.png"
    return module


MAKE = _make_icon()
BASE = ROOT / "mobile" / "src" / "budget_manager_mobile" / "resources" / \
    "budget_manager_mobile"


def _expected():
    """Every file the Briefcase Android template asks for, and its size."""
    yield Path(f"{BASE}.png"), 512
    for size in sorted(set(MAKE.SQUARE_SIZES) | set(MAKE.SPLASH_SIZES)):
        yield Path(f"{BASE}-square-{size}.png"), size
    for size in MAKE.SQUARE_SIZES:
        yield Path(f"{BASE}-{size}.png"), size
    for size in MAKE.ROUND_SIZES:
        yield Path(f"{BASE}-round-{size}.png"), size
    for size in MAKE.ADAPTIVE_SIZES:
        yield Path(f"{BASE}-adaptive-{size}.png"), size


@pytest.mark.parametrize("path,size", list(_expected()),
                         ids=lambda v: v.name if isinstance(v, Path) else v)
def test_every_file_the_launcher_reads_exists_at_its_size(path, size):
    assert path.exists(), f"{path.name} is missing; the launcher falls back"
    with Image.open(path) as img:
        assert img.size == (size, size), f"{path.name} is {img.size}"


@pytest.mark.parametrize("size", MAKE.ADAPTIVE_SIZES)
def test_an_adaptive_canvas_is_opaque_to_its_edges(size):
    """The launcher composites this over a background layer the Android
    template owns and we do not. Filling our own canvas means the mask always
    crops our colour, whatever that layer turns out to be."""
    with Image.open(f"{BASE}-adaptive-{size}.png") as img:
        alpha = img.convert("RGBA").getchannel("A")
    corners = [alpha.getpixel(p) for p in
               ((0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1))]
    assert corners == [255] * 4, f"adaptive-{size} would show the layer behind"


@pytest.mark.parametrize("size", MAKE.SQUARE_SIZES)
def test_a_legacy_icon_carries_no_page_behind_the_artwork(size):
    """The artwork is exported on a white page and its plate is round-
    cornered. Left in, those corners are white triangles on the home screen."""
    with Image.open(f"{BASE}-{size}.png") as img:
        alpha = img.convert("RGBA").getchannel("A")
    assert alpha.getpixel((0, 0)) == 0, f"{size}px icon has an opaque corner"


def test_the_adaptive_artwork_stays_inside_the_guaranteed_area():
    """Only the middle 72dp of a 108dp canvas survives every launcher mask.
    Artwork outside it is cropped on ordinary devices, not just round ones."""
    size = max(MAKE.ADAPTIVE_SIZES)
    with Image.open(f"{BASE}-adaptive-{size}.png") as img:
        art = img.convert("RGB")
    flat = Image.new("RGB", art.size, MAKE.FILL[:3])
    box = ImageChops.difference(art, flat).convert("L").point(
        lambda v: 255 if v > 12 else 0).getbbox()

    margin = size * (1 - MAKE.ADAPTIVE_SAFE) / 2
    assert box is not None, "the canvas is a flat colour; the artwork is gone"
    assert box[0] >= margin - 1 and box[1] >= margin - 1, box
    assert box[2] <= size - margin + 1 and box[3] <= size - margin + 1, box


def test_the_committed_icons_match_the_artwork(tmp_path, monkeypatch):
    """Otherwise the artwork can be replaced and the icons left as they were —
    the repository would then hold a source file that describes nothing, and
    the old icon would ship with no sign anything was missed.
    """
    monkeypatch.setattr(MAKE, "BASE", str(tmp_path / "icon"))
    MAKE.main()

    for committed, _ in _expected():
        suffix = committed.name[len("budget_manager_mobile"):]
        fresh = tmp_path / f"icon{suffix}"
        with Image.open(committed) as a, Image.open(fresh) as b:
            diff = ImageChops.difference(a.convert("RGBA"), b.convert("RGBA"))
        #: Not byte-exact: a Pillow point release may resample a hair
        #: differently. Anything the eye could see is far above this.
        worst = max(channel[1] for channel in diff.getextrema())
        assert worst <= 8, (
            f"{committed.name} does not match the artwork — "
            f"run: python mobile/tools/make_icon.py")
