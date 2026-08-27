from __future__ import annotations

import json
import os
import locale
from pathlib import Path
from typing import Optional


_RTL_LANGUAGES = {"ar"}
_SUPPORTED_LANGUAGES = {"en", "ar"}
_DEFAULT_LANGUAGE = "en"


class I18n:
    _instance: Optional["I18n"] = None

    def __init__(self, lang: str = "") -> None:
        self._lang = _DEFAULT_LANGUAGE
        self._strings: dict[str, str] = {}
        self._locale_dir = Path(__file__).parent / "locale"
        if lang and lang in _SUPPORTED_LANGUAGES:
            self._lang = lang
        else:
            detected = self._detect_language()
            if detected in _SUPPORTED_LANGUAGES:
                self._lang = detected
        self._load()

    @staticmethod
    def get_instance(lang: str = "") -> "I18n":
        if I18n._instance is None:
            I18n._instance = I18n(lang)
        elif lang and lang in _SUPPORTED_LANGUAGES:
            I18n._instance.set_language(lang)
        return I18n._instance

    @staticmethod
    def _detect_language() -> str:
        try:
            sys_lang, _ = locale.getlocale()
            if sys_lang:
                code = sys_lang[:2].lower()
                if code in _SUPPORTED_LANGUAGES:
                    return code
        except Exception:
            pass
        env_lang = os.environ.get("LANG", "").lower()
        if env_lang:
            code = env_lang[:2]
            if code in _SUPPORTED_LANGUAGES:
                return code
        return _DEFAULT_LANGUAGE

    def _load(self) -> None:
        path = self._locale_dir / f"{self._lang}.json"
        try:
            with open(path, encoding="utf-8") as f:
                self._strings = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            fallback = self._locale_dir / f"{_DEFAULT_LANGUAGE}.json"
            try:
                with open(fallback, encoding="utf-8") as f:
                    self._strings = json.load(f)
            except Exception:
                self._strings = {}

    def set_language(self, lang: str) -> None:
        if lang in _SUPPORTED_LANGUAGES and lang != self._lang:
            self._lang = lang
            self._load()

    @property
    def lang(self) -> str:
        return self._lang

    @property
    def is_rtl(self) -> bool:
        return self._lang in _RTL_LANGUAGES

    def t(self, key: str, **kwargs: object) -> str:
        val = self._strings.get(key, key)
        if kwargs:
            try:
                val = val.format(**kwargs)
            except KeyError:
                pass
        return val

    def anchor(self) -> str:
        return "e" if self.is_rtl else "w"

    def justify(self) -> str:
        return "right" if self.is_rtl else "left"

    def opposite_anchor(self) -> str:
        return "w" if self.is_rtl else "e"

    def column_swap(self, cols: int, col: int) -> int:
        if self.is_rtl and cols > 1:
            return cols - 1 - col
        return col

    def supported_languages(self) -> list[tuple[str, str]]:
        return [("en", "English"), ("ar", "العربية")]

    def reload(self) -> None:
        self._load()
