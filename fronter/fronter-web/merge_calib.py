# -*- coding: utf-8 -*-
from pathlib import Path

base = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\calib_parts')
out  = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\pages\Calibration.tsx')

parts = [
    'p1_imports.txt',
    'p2_constants.txt',
    'p3_styles.txt',
    'p4_component_top.txt',
    'p5_handlers.txt',
    'p6_jsx_left.txt',
    'p7_jsx_center.txt',
    'p8_jsx_right_modals.txt',
]

combined = ''
for name in parts:
    content = (base / name).read_text(encoding='utf-8')
    combined += content
    print(f'  + {name}: {len(content)} chars')

out.write_text(combined, encoding='utf-8')
print(f'\nDone! Total: {len(combined)} chars, {len(combined.splitlines())} lines')
print(f'Written to: {out}')
