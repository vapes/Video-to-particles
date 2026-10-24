"""Build fire-coin-win/index.html: inject the module source (highlighted for display, raw for execution)."""
import gzip, html, re, sys
D = str(__import__('pathlib').Path(__file__).resolve().parents[1] / 'fire-coin-win')
mod = open(f'{D}/fire-coin-win.js').read()
usage = open(f'{D}/usage.js').read()
CDN = 'https://cdn.jsdelivr.net/npm/pixi.js@8.22.0/dist/pixi.min.mjs'
KW = r'\b(import|from|export|const|let|var|class|extends|new|return|if|else|for|while|of|in|this|await|async|function|continue|break|super|typeof|null|true|false)\b'
TOK = re.compile(r"(?P<c>//[^\n]*|/\*[\s\S]*?\*/)|(?P<s>'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\"(?:\\.|[^\"\\\n])*\")|(?P<n>\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b)|(?P<k>\b(?:" + KW[3:-3] + r")\b)")
def hl(src):
    out, pos = [], 0
    for m in TOK.finditer(src):
        # keywords: only whole words
        if m.lastgroup == 'k' and not re.fullmatch(KW, m.group(0)):
            continue
        out.append(html.escape(src[pos:m.start()], quote=False))
        out.append(f'<span class="{m.lastgroup}">{html.escape(m.group(0), quote=False)}</span>')
        pos = m.end()
    out.append(html.escape(src[pos:], quote=False))
    return ''.join(out)
tpl = open(f'{D}/page.tpl.html').read()
nb = len(mod.encode()); gz = len(gzip.compress(mod.encode(), 9))
page = (tpl.replace('__USAGE_HTML__', hl(usage.rstrip('\n')))
           .replace('__MODULE_HTML__', hl(mod.rstrip('\n')))
           .replace('__MODULE_JS__', mod.replace("from 'pixi.js'", f"from '{CDN}'"))
           .replace('__MODULE_LINES__', str(mod.count('\n')))
           .replace('__MODULE_KB__', f"{nb / 1024:.0f} КБ, в gzip {gz / 1024:.0f} КБ".replace('.', ','))
           .replace('__MODULE_MB__', f"{nb / 1048576:.2f} МБ".replace('.', ',')))
assert '__' not in re.sub(r'__vs|__proto__|__MEGA_HREF__', '', page.split('<script type="module">')[0]), 'placeholder left'
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
from htmldoc import to_document
open(f'{D}/index.html', 'w').write(to_document(page.replace('__MEGA_HREF__', '../mega-win/')))
# GitHub Pages home page: the same demo at the repo root, assets stay in fire-coin-win/
home = page.replace('__MEGA_HREF__', 'mega-win/')
for old, new in (('src="clip.mp4"', 'src="fire-coin-win/clip.mp4"'), ("fetch('coin.avif')", "fetch('fire-coin-win/coin.avif')")):
    assert home.count(old) == 1, old
    home = home.replace(old, new)
open(str(__import__('pathlib').Path(D).parent / 'index.html'), 'w').write(to_document(home))
print('module', nb, 'bytes, gzip', gz, '| page', len(page.encode()))
