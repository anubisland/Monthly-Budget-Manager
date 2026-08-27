"""A minimal stand-in for toga, so app.py can be imported and run in tests.

app.py is the wiring between the data layer and the WebView. Testing it any
other way means testing a copy of it, which is how wiring bugs survive a green
suite. The stub covers exactly the toga surface app.py touches — six names —
and records what the app did with them so the test can assert on it.
"""

import sys
import types
from pathlib import Path


class _Paths:
    def __init__(self, data):
        self.data = data


class App:
    """Stands in for toga.App, which normally calls startup() itself."""

    def __init__(self, formal_name="Test", app_id="test.app", data_dir=None):
        self.formal_name = formal_name
        self.paths = _Paths(Path(data_dir) if data_dir else None)


class MainWindow:
    def __init__(self, title=None):
        self.title = title
        self.content = None
        self.shown = False

    def show(self):
        self.shown = True


class WebView:
    def __init__(self, url=None, style=None):
        self.url = url
        self.style = style


class Pack:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


def install():
    """Put the stub in sys.modules under the names app.py imports."""
    toga = types.ModuleType("toga")
    toga.App = App
    toga.MainWindow = MainWindow
    toga.WebView = WebView

    style = types.ModuleType("toga.style")
    style.Pack = Pack
    toga.style = style

    sys.modules.setdefault("toga", toga)
    sys.modules.setdefault("toga.style", style)
    return toga
