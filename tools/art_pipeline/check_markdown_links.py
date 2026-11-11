#!/usr/bin/env python3
"""Проверка локальных Markdown-ссылок в отслеживаемых и новых файлах ветки.

HTTP(S), другие URI и якоря внутри страницы не проверяются. Проверяются
обычные ссылки, изображения и определения ссылок; примеры в блоках кода
и встроенный код пропускаются. Код возврата 1 означает отсутствующие пути.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]


def mask_code(text: str) -> str:
    lines, fence = [], None
    for line in text.splitlines(keepends=True):
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            token = marker.group(1)
            if fence is None:
                fence = token
            elif token[0] == fence[0] and len(token) >= len(fence):
                fence = None
            lines.append(re.sub(r'[^\r\n]', ' ', line))
        elif fence:
            lines.append(re.sub(r'[^\r\n]', ' ', line))
        else:
            # Код внутри подписи ссылки допустим: [`file`](path) должен проверяться.
            lines.append(re.sub(r'(`+).*?\1', lambda m: ' ' * len(m.group()), line))
    return ''.join(lines)


def destinations(text: str):
    text = mask_code(text)
    for match in re.finditer(r'(?<!!)\[[^\]\n]*\]\(|!\[[^\]\n]*\]\(', text):
        start = match.end()
        depth, angle, escaped = 1, False, False
        for end in range(start, len(text)):
            char = text[end]
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '<':
                angle = True
            elif char == '>':
                angle = False
            elif not angle and char == '(':
                depth += 1
            elif not angle and char == ')':
                depth -= 1
                if depth == 0:
                    yield text.count('\n', 0, match.start()) + 1, text[start:end].strip()
                    break
    for match in re.finditer(r'^\s{0,3}\[[^\]]+\]:\s*(.+)$', text, re.M):
        yield text.count('\n', 0, match.start()) + 1, match.group(1).strip()


def target_path(destination: str) -> str | None:
    if destination.startswith('<'):
        destination = destination[1:destination.find('>')]
    else:
        destination = re.split(r'\s+[\'\"]', destination, maxsplit=1)[0]
    if not destination or destination.startswith('#') or re.match(r'^[a-z][a-z\d+.-]*:', destination, re.I):
        return None
    destination = re.sub(r'\\([ ()\[\]])', r'\1', destination)
    return unquote(destination.split('#', 1)[0].split('?', 1)[0]) or None


def check(root: Path = ROOT) -> tuple[list[dict], int, int]:
    names = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    files = sorted({root / name for name in names.decode('utf-8').split('\0') if name.lower().endswith('.md')})
    errors, count, scanned = [], 0, 0
    for path in files:
        if not path.is_file():
            continue
        scanned += 1
        for line, destination in destinations(path.read_text(encoding='utf-8-sig')):
            target = target_path(destination)
            if target is None:
                continue
            count += 1
            resolved = (root / target.lstrip('/')) if target.startswith('/') else (path.parent / target)
            if not resolved.exists():
                errors.append({'file': path.relative_to(root).as_posix(), 'line': line, 'target': target})
    return errors, scanned, count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', action='store_true', help='Вывести полный результат в JSON')
    args = parser.parse_args()
    errors, files, count = check()
    if args.json:
        print(json.dumps({'files': files, 'links': count, 'errors': errors}, ensure_ascii=False, indent=2))
    else:
        for error in errors:
            print(f"{error['file']}:{error['line']}: отсутствует {error['target']}")
        print(f'Файлов: {files}; локальных ссылок: {count}; отсутствующих путей: {len(errors)}')
    return bool(errors)


if __name__ == '__main__':
    raise SystemExit(main())
