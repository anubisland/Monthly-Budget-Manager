#!/usr/bin/env python3
"""
Budget Manager — Modern GUI (v2.0)
====================================
A bilingual (English / Arabic) personal finance tool with:
  - Modern sidebar navigation
  - Dark/light theme toggle
  - Live charts and dashboard
  - CSV import/export

Usage:
    python budget_manager_gui.py

Requires: customtkinter, openpyxl
"""
from __future__ import annotations

import os
import sys

# Ensure the package is importable from the project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from monthly_budget.gui import main

if __name__ == "__main__":
    raise SystemExit(main())
