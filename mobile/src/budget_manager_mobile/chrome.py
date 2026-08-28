"""Removing the platform's own window decoration.

The green bar at the top of every screen is Android's ActionBar, owned by the
Activity rather than by the Toga window — which is why `toolbar.clear()` did
nothing: that empties a toolbar's buttons, it does not remove the bar.

The page already draws its own heading, translated and changing with the tab,
so the bar only repeated it in English and took a strip of a phone screen to
do so.

Like share.py, none of this can run off a device, so it is written to fail
soft and report which step was missing rather than to assume.
"""

from __future__ import annotations

from typing import Optional, Tuple


def hide_title_bar() -> Tuple[bool, Optional[str]]:
    """Hide the Activity's ActionBar. Returns (hidden, reason)."""
    try:
        import toga
        activity = toga.App.app._impl.native
    except (ImportError, AttributeError) as err:
        return False, f"no activity to work with: {err}"

    try:
        # Two APIs, because which one exists depends on whether the Activity
        # extends AppCompatActivity. Toga's does, but asking for both costs
        # nothing and means a change upstream degrades instead of breaking.
        for getter in ("getSupportActionBar", "getActionBar"):
            method = getattr(activity, getter, None)
            if method is None:
                continue
            bar = method()
            if bar is not None:
                bar.hide()
                return True, None
        return False, "this activity has no action bar"
    except Exception as err:  # noqa: BLE001 - platform bridge, see module doc
        return False, f"could not hide the title bar: {err}"
