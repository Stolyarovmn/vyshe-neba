#!/usr/bin/env python3
"""Совместимый вход к выгрузке из main:manifest.js; ручная таблица удалена.

Запуск: python game/tools/island-layout.py ../vn-clean/game/src/render/manifest.js
Предпочтительная команда: tools/hd_pixel/export_island_layout.py с теми же аргументами.
"""
from pathlib import Path
import runpy


if __name__ == '__main__':
    exporter = Path(__file__).resolve().parents[2] / 'tools/hd_pixel/export_island_layout.py'
    runpy.run_path(str(exporter), run_name='__main__')
