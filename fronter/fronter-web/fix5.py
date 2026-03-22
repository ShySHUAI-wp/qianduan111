# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\pages\Calibration.tsx')
content = p.read_text(encoding='utf-8')
lines = content.splitlines()

# Find and fix the antd import line
new_lines = []
for line in lines:
    if "from 'antd'" in line and 'Input' not in line and 'Button' in line:
        # Add Input back
        line = line.replace(
            'import { Button, Form, Modal,',
            'import { Button, Form, Input, Modal,'
        )
        print('Fixed:', line)
    new_lines.append(line)

p.write_text('\n'.join(new_lines), encoding='utf-8')
print('Done')
