"""Handing a generated file to the rest of the device.

On Android the file is published to the Downloads collection through
MediaStore, which returns a ``content://`` URI, and that URI is offered to the
system share sheet with ACTION_SEND.

MediaStore rather than FileProvider, deliberately. Since Android 7 a ``file://``
URI passed between apps raises FileUriExposedException, so a file has to be
handed over as ``content://``. The usual answer is a FileProvider — but that
needs a ``<provider>`` in the manifest pointing at an ``@xml/file_paths``
resource, Briefcase has no standard way to place that resource in the
generated Gradle project, and a manifest entry naming a resource that does not
exist fails the *build* rather than the feature. MediaStore needs no manifest
entry, no resource, and on Android 10+ no permission — and it puts the file in
Downloads, where the user can find it again on their own.

Every step is guarded. This module must never be the reason an export is lost:
the spreadsheet is written to the app's own directory first, so a failure here
costs the share, not the work.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Tuple

#: MIME types for what the app can produce.
MIME = {
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".json": "application/json",
    ".csv": "text/csv",
}


def mime_for(path: Path) -> str:
    return MIME.get(Path(path).suffix.lower(), "application/octet-stream")


def share(path: Path, title: str = "") -> Tuple[bool, Optional[str]]:
    """Publish ``path`` and open the share sheet for it.

    Returns ``(shared, reason)``; ``reason`` names the step that was missing
    when sharing did not happen, so the caller can say something specific.
    """
    path = Path(path)
    if not path.exists():
        return False, "the file was not created"

    activity = _activity()
    if activity is None:
        return False, "sharing is not available on this platform"
    try:
        uri = _publish(activity, path)
        if uri is None:
            return False, "could not publish the file"
        _send(activity, uri, mime_for(path), title)
        return True, None
    except Exception as err:  # noqa: BLE001 - see module docstring
        # Deliberately broad: the Java bridge raises platform exception types
        # that share no Python base class, and losing a written export to an
        # unanticipated one would be worse than reporting it.
        return False, f"sharing failed: {err}"


def _activity():
    """The Android Activity, or None anywhere else."""
    try:
        from android.content import Intent  # noqa: F401 - probing availability
    except ImportError:
        return None
    try:
        import toga
        return toga.App.app._impl.native
    except (ImportError, AttributeError):
        return None


def _publish(activity, path: Path):
    """Copy the file into Downloads via MediaStore and return its content URI.

    The bytes are copied rather than moved: the app keeps its own copy, so a
    later export overwrites a known location instead of depending on whatever
    the user did with the shared one.
    """
    from android.content import ContentValues
    from android.provider import MediaStore

    values = ContentValues()
    values.put(MediaStore.MediaColumns.DISPLAY_NAME, path.name)
    values.put(MediaStore.MediaColumns.MIME_TYPE, mime_for(path))
    values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download")

    resolver = activity.getContentResolver()
    uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
    if uri is None:
        return None

    stream = resolver.openOutputStream(uri)
    try:
        stream.write(path.read_bytes())
    finally:
        stream.close()
    return uri


def _send(activity, uri, mime: str, title: str) -> None:
    from android.content import Intent

    intent = Intent(Intent.ACTION_SEND)
    intent.setType(mime)
    intent.putExtra(Intent.EXTRA_STREAM, uri)
    if title:
        intent.putExtra(Intent.EXTRA_SUBJECT, title)
    # Without this the receiving app gets a URI it is not allowed to open,
    # which fails after the share sheet has already been shown — the worst
    # place for it, because the user believes the share succeeded.
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

    activity.startActivity(Intent.createChooser(intent, title or "Share"))
