"""Recolour the storefront stylesheets to the Ruchs brand palette.

Brand colours (from the Ruchs logo artwork and the ruchs.in theme):
  wine       #4b1539  - logo background, primary buttons, footer
  wine dark  #330d26
  rose gold  #b85c64 -> #e6b19b  - logo metal; accents
  ivory      #fffff0  - page background

Every old tone maps to its brand equivalent, keeping the same light/dark role.
Run once: python scripts/brand_palette.py  (idempotent; unknown colours are kept).
"""
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'scripts'
FILES = ['remap.css', 'shop.css', 'showcase.css', 'tryon.css', 'live-tryon.css']

MAP = {
    # Dark plums / inks -> wine family
    '#43162b': '#4b1539', '#481b2c': '#4b1539', '#6d3b50': '#4b1539',
    '#321020': '#330d26', '#35202a': '#330d26', '#301a29': '#330d26',
    '#211a1b': '#2a1420', '#241e1c': '#2a1420', '#342a25': '#3a2230',
    # Muted text -> wine-tinted grey
    '#655c5c': '#6c5560', '#635c54': '#6c5560', '#6b545d': '#6c5560',
    '#605749': '#6c5560', '#675a52': '#6c5560', '#554b45': '#5e4652',
    # Rose accents -> rose gold
    '#a45870': '#b85c64', '#b7738b': '#b85c64',
    # Page backgrounds -> ivory
    '#f6f1e7': '#fffff0', '#faf9f3': '#fffff0', '#fbf7ed': '#fffff0',
    '#fffaf0': '#fffdf5', '#fffaef': '#fffdf5', '#fffefa': '#fffdf5',
    '#fffcf5': '#fffdf5', '#fffaf2': '#fffdf5',
    # Pale panels and lines -> blush tones from the rose gold
    '#e7d4d3': '#f2dfd8', '#f3e8e5': '#f9eee9', '#eee5dd': '#f9eee9',
    '#ede8df': '#f5e9e2', '#ece8de': '#f5e9e2', '#e9e4da': '#f1e3dc',
    '#e8e1d6': '#f1e3dc', '#e7dbc9': '#ecd8cf', '#e9dad8': '#efdcd6',
    '#e6d7dc': '#efdcd6', '#f1e5e9': '#f8ebe6', '#f7eeea': '#f9eee9',
    '#f5edeb': '#f9eee9', '#efe0df': '#f2dfd8', '#e6ddd6': '#ead6ce',
    '#ddd5d0': '#e7d5cd', '#d4ccc0': '#e2cbc1', '#d0c8bc': '#e2cbc1',
    '#c9beb1': '#dcc3b8', '#cbbaba': '#d9bdb4',
    'rgba(250,249,243,.97)': 'rgba(255,255,240,.97)',
}

TOKENS = ('--rose-gold:#b85c64;--rose-gold-light:#e6b19b;'
          '--rose-gold-sheen:linear-gradient(100deg,#a64b5b 0%,#c97a74 38%,#e6b19b 50%,#c97a74 62%,#a64b5b 100%);')

for name in FILES:
    path = root / name
    css = path.read_text(encoding='utf-8')
    before = css
    for old, new in MAP.items():
        css = css.replace(old, new).replace(old.upper(), new)
    if name == 'remap.css' and '--rose-gold:' not in css:
        css = css.replace(':root{', ':root{' + TOKENS, 1)
    if css != before:
        path.write_text(css, encoding='utf-8')
        print('recoloured', name)
