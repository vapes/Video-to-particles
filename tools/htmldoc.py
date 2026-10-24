"""Turn a page fragment (title + style + body content, as published to Claude artifacts)
into a standalone HTML document that opens from any static server. Idempotent.

usage: python3 tools/htmldoc.py <page.html> [...]
"""
import sys

HEAD = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style>\n')


def to_document(fragment: str) -> str:
    if fragment.lstrip().lower().startswith('<!doctype'):
        return fragment
    i = fragment.index('<main')
    return HEAD + fragment[:i].rstrip() + '\n</head>\n<body>\n' + fragment[i:].rstrip() + '\n</body>\n</html>\n'


if __name__ == '__main__':
    for path in sys.argv[1:]:
        s = open(path, encoding='utf-8').read()
        open(path, 'w', encoding='utf-8').write(to_document(s))
        print('ok', path)
