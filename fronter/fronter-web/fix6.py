# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\components\Layout\MainLayout.tsx')
content = p.read_text(encoding='utf-8')

old = """    if (path.startsWith('/home')) return '/home';
    if (path.startsWith('/robot-control')) {"""

new = """    if (path.startsWith('/home')) return '/home';
    if (path.startsWith('/calibration')) return '/calibration';
    if (path.startsWith('/robot-control')) {"""

if old in content:
    content = content.replace(old, new, 1)
    p.write_text(content, encoding='utf-8')
    print('Done - added calibration route detection')
else:
    print('ERROR: pattern not found')
    # Try to find what's there
    idx = content.find("path.startsWith('/home')")
    if idx >= 0:
        print('Context:', repr(content[idx:idx+200]))
