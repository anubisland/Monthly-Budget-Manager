from __future__ import annotations


class ThemeColors:
    primary = "#1A73E8"
    primary_dark = "#1558B0"
    accent = "#00BFA6"
    danger = "#EA4335"
    warning = "#FBBC04"
    bg = "#F8F9FA"
    card_bg = "#FFFFFF"
    text = "#202124"
    text_secondary = "#5F6368"
    border = "#DADCE0"
    sidebar_bg = "#1A1A2E"
    sidebar_hover = "#16213E"
    sidebar_active = "#0F3460"
    sidebar_text = "#E0E0E0"
    sidebar_text_active = "#FFFFFF"
    positive = "#00BFA6"
    negative = "#EA4335"
    chart_colors = [
        "#1A73E8", "#00BFA6", "#EA4335", "#FBBC04", "#9C27B0",
        "#00BCD4", "#8BC34A", "#FF9800", "#E91E63", "#795548",
        "#607D8B", "#3F51B5", "#009688", "#FF5722", "#673AB7",
    ]
    card_shadow = "#00000010"
    input_bg = "#FFFFFF"
    input_border = "#DADCE0"
    input_text = "#202124"
    success = "#00BFA6"
    info = "#1A73E8"
    gradient_start = "#1A73E8"
    gradient_end = "#00BFA6"


class DarkThemeColors:
    primary = "#4A9AF5"
    primary_dark = "#3B82F6"
    accent = "#00E5BF"
    danger = "#EF5350"
    warning = "#FFD54F"
    bg = "#121212"
    card_bg = "#1E1E1E"
    text = "#E0E0E0"
    text_secondary = "#9E9E9E"
    border = "#333333"
    sidebar_bg = "#0D0D1A"
    sidebar_hover = "#1A1A2E"
    sidebar_active = "#162447"
    sidebar_text = "#B0B0B0"
    sidebar_text_active = "#FFFFFF"
    positive = "#00E5BF"
    negative = "#EF5350"
    chart_colors = [
        "#4A9AF5", "#00E5BF", "#EF5350", "#FFD54F", "#CE93D8",
        "#4DD0E1", "#AED581", "#FFB74D", "#F06292", "#A1887F",
        "#90A4AE", "#7986CB", "#80CBC4", "#FF8A65", "#BA68C8",
    ]
    card_shadow = "#00000030"
    input_bg = "#2A2A2A"
    input_border = "#444444"
    input_text = "#E0E0E0"
    success = "#00E5BF"
    info = "#4A9AF5"
    gradient_start = "#4A9AF5"
    gradient_end = "#00E5BF"


def get_colors(dark: bool = False) -> ThemeColors | DarkThemeColors:
    return DarkThemeColors() if dark else ThemeColors()


_theme_dark = False
_current_colors: ThemeColors | DarkThemeColors = ThemeColors()


def set_dark_mode(dark: bool) -> None:
    global _theme_dark, _current_colors
    _theme_dark = dark
    _current_colors = get_colors(dark)


def is_dark_mode() -> bool:
    return _theme_dark


def colors() -> ThemeColors | DarkThemeColors:
    return _current_colors
