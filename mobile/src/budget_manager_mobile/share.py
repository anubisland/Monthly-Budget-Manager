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

    try:
        # Inside the try: _activity() reaches into the Java bridge, which
        # raises platform types beyond the ImportError and AttributeError it
        # catches. One escaping from here would lose the caller its (shared,
        # reason) pair — and with it the path to a file that does exist.
        activity = _activity()
        if activity is None:
            return False, "no android bridge (running off-device?)"
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


def _jclass(name: str):
    """A Java class by name, or None if there is no bridge.

    Briefcase packages this app with Chaquopy, whose bridge is `java.jclass`.
    The first version probed for `android.content.Intent` as a plain import,
    which is the Pyjnius idiom rather than the Chaquopy one — so the import
    failed on a real phone and the app concluded that sharing was "not
    available on this platform". It was available; the way in was wrong, and
    the message blamed the platform for it.
    """
    try:
        from java import jclass
    except ImportError:
        return None
    try:
        return jclass(name)
    except Exception:  # noqa: BLE001 - the bridge raises platform types
        return None


def _activity():
    """The Android Activity, or None anywhere else."""
    if _jclass("android.content.Intent") is None:
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
    ContentValues = _jclass("android.content.ContentValues")
    MediaStore = _jclass("android.provider.MediaStore")
    if ContentValues is None or MediaStore is None:
        return None

    values = ContentValues()
    values.put(MediaStore.MediaColumns.DISPLAY_NAME, path.name)
    values.put(MediaStore.MediaColumns.MIME_TYPE, mime_for(path))
    values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download")
    # Pending until the bytes are all there. Without this the row is visible
    # to every app the moment it is created, so a failed write leaves a
    # zero-byte budget-2026-08.xlsx in Downloads that the user finds, opens,
    # and is told is corrupt.
    values.put(MediaStore.MediaColumns.IS_PENDING, 1)

    resolver = activity.getContentResolver()
    uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
    if uri is None:
        return None

    try:
        stream = resolver.openOutputStream(uri)
        if stream is None:
            # Documented as possible, and calling write() on it would raise an
            # AttributeError that close() then replaces with a second one,
            # burying the real cause in the reason string.
            raise OSError("could not open the destination for writing")
        try:
            stream.write(path.read_bytes())
        finally:
            stream.close()
    except Exception:
        # The row exists and is empty. Removing it is better than leaving a
        # broken file behind under a name that promises a report.
        try:
            resolver.delete(uri, None, None)
        except Exception:  # noqa: BLE001 - cleanup must not mask the original
            pass
        raise

    done = ContentValues()
    done.put(MediaStore.MediaColumns.IS_PENDING, 0)
    resolver.update(uri, done, None, None)
    return uri


def _send(activity, uri, mime: str, title: str) -> None:
    Intent = _jclass("android.content.Intent")
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
