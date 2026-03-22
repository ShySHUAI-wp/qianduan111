# -*- coding: utf-8 -*-
from pathlib import Path

p = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\pages\Calibration.tsx')
content = p.read_text(encoding='utf-8')

# Fix 1: add React import
content = content.replace(
    "import { useState, useRef, useEffect } from 'react';",
    "import React, { useState, useRef, useEffect } from 'react';"
)

# Fix 2: remove unused Text destructure
content = content.replace("\nconst { Text } = Typography;\n", "\n")

# Fix 3: remove unused Typography import if Text not used elsewhere
if 'Text' not in content:
    content = content.replace(
        'import { Button, Form, Input, Modal, Select, Steps, Typography, message } from \'antd\';',
        'import { Button, Form, Input, Modal, Select, Steps, message } from \'antd\';'
    )

p.write_text(content, encoding='utf-8')
lines = content.splitlines()
print(f'Done. {len(lines)} lines')
print('First 3 lines:')
for l in lines[:3]:
    print(' ', l)
