"""Tiny JS syntax highlighter for the code blocks on the demo pages."""
import html, re

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
