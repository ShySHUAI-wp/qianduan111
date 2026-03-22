# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\pages\Calibration.tsx')
content = p.read_text(encoding='utf-8')

# Fix 1: Remove unused Typography from antd import
content = content.replace(
    "import { Button, Form, Input, Modal, Select, Steps, Typography, message } from 'antd';",
    "import { Button, Form, Input, Modal, Select, Steps, message } from 'antd';"
)

# Fix 2: Replace React.ReactNode state with just a plain any type to avoid needing React namespace
content = content.replace(
    "useState<React.ReactNode>(null);",
    "useState<React.ReactNode>(null); // eslint-disable-line"
)

# Check if React.ReactNode is used
if 'React.ReactNode' in content:
    print('React.ReactNode found - React import is needed')
else:
    print('React.ReactNode NOT found')
    # Remove React from import since it may be unused
    # But keep it since JSX needs it in some configs
    pass

# Fix 3: replace stepModalContent state type  
content = content.replace(
    'useState<React.ReactNode>(null); // eslint-disable-line',
    'useState<React.ReactNode>(null)'
)

p.write_text(content, encoding='utf-8')
print('Fixed Typography import')

# Show line 1-4
lines = content.splitlines()
for i, l in enumerate(lines[:5], 1):
    print(f'{i}: {l}')
