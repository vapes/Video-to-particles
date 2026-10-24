"""Build mega-win/index.html: inject the MegaWin module (highlighted for display, raw for execution)."""
import gzip, os, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from codehl import hl
from htmldoc import to_document

D = pathlib.Path(__file__).resolve().parents[1] / 'mega-win'
CDN = 'https://cdn.jsdelivr.net/npm/pixi.js@8.22.0/dist/pixi.min.mjs'
mod = (D / 'mega-win.js').read_text()
usage = (D / 'usage.js').read_text()
tpl = (D / 'page.tpl.html').read_text()
nb = len(mod.encode()); gz = len(gzip.compress(mod.encode(), 9))
mb = lambda b: f"{b / 1048576:.2f} МБ".replace('.', ',')
page = (tpl.replace('__USAGE_HTML__', hl(usage.rstrip('\n')))
           .replace('__MODULE_HTML__', hl(mod.rstrip('\n')))
           .replace('__MODULE_JS__', mod.replace("from 'pixi.js'", f"from '{CDN}'"))
           .replace('__MODULE_LINES__', str(mod.count('\n')))
           .replace('__MODULE_KB__', f"{nb / 1024:.0f} КБ, в gzip {gz / 1024:.0f} КБ".replace('.', ','))
           .replace('__MODULE_MB__', mb(nb))
           .replace('__VIDEO_MB__', mb(os.path.getsize(D / 'video.mp4'))))
head = page.split('<script type="module">')[0]
assert '__' not in head.replace('__mw', ''), 'placeholder left'
(D / 'index.html').write_text(to_document(page))
print('module', nb, 'bytes, gzip', gz, '| page', len(page.encode()))
