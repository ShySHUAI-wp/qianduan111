# -*- coding: utf-8 -*-
from pathlib import Path
import re

p = Path(r'C:\Users\宋昊阳\Desktop\project\fronter\fronter-web\src\pages\Calibration.tsx')
content = p.read_text(encoding='utf-8')

# Find which icons are actually used in JSX (after the imports)
body = content.split('from \'@ant-design/icons\';', 1)[1] if '\'@ant-design/icons\'' in content else content
antd_body = content.split('from \'antd\';', 1)[1] if '\'antd\'' in content else content

icons_used = []
for icon in ['UsbOutlined', 'CheckCircleOutlined', 'PlayCircleOutlined', 'StopOutlined', 'SettingOutlined']:
    if icon in body:
        icons_used.append(icon)
        print(f'USED: {icon}')
    else:
        print(f'UNUSED: {icon}')

antd_used = []
for comp in ['Button', 'Form', 'Input', 'Modal', 'Select', 'Steps', 'message']:
    if comp in antd_body:
        antd_used.append(comp)
        print(f'USED antd: {comp}')
    else:
        print(f'UNUSED antd: {comp}')

# Fix icon imports
new_icons = ', '.join(icons_used)
content = re.sub(
    r'import \{[^}]+\} from \'@ant-design/icons\';',
    f"import {{ {new_icons} }} from '@ant-design/icons';",
    content
)

# Fix antd imports  
new_antd = ', '.join(antd_used)
content = re.sub(
    r"import \{[^}]+\} from 'antd';",
    f"import {{ {new_antd} }} from 'antd';",
    content
)

p.write_text(content, encoding='utf-8')
print('\nDone! New imports:')
for line in content.splitlines()[:6]:
    print(line)
