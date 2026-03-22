# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\pages\Calibration.tsx')
content = p.read_text(encoding='utf-8')
lines = content.splitlines()

# Print first 5 lines as repr to see exact content
for i, l in enumerate(lines[:5], 1):
    print(f'{i}: {repr(l)}')

# Find and fix unused imports
old_antd = None
old_icons = None
for line in lines[:10]:
    if 'from \'antd\'' in line:
        old_antd = line
    if 'from \'@ant-design/icons\'' in line:
        old_icons = line

print('\nantd line:', repr(old_antd))
print('icons line:', repr(old_icons))

# Fix: remove Input from antd (unused)
if old_antd and 'Input' in old_antd:
    new_antd = old_antd.replace(', Input', '').replace('Input, ', '')
    content = content.replace(old_antd, new_antd, 1)
    print(f'Fixed antd: removed Input')

p.write_text(content, encoding='utf-8')
print('Done')
