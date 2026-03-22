# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\components\Layout\MainLayout.tsx')
content = p.read_text(encoding='utf-8')
print('file size:', len(content))

# Search for the calibration check
if '/calibration' in content:
    print('calibration already in file')
else:
    print('calibration NOT in file - need to add')
    # Find insertion point
    marker = "/home') return '/home';"
    idx = content.find(marker)
    if idx >= 0:
        insert_after = idx + len(marker)
        addition = "\n    if (path.startsWith('/calibration')) return '/calibration';"
        content = content[:insert_after] + addition + content[insert_after:]
        p.write_text(content, encoding='utf-8')
        print('Added calibration detection')
    else:
        print('Cannot find marker:', repr(marker))
