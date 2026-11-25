"""Find client APKs in the dated apks directory, with legacy path fallback."""
from pathlib import Path
import os
import re


def client_apks(root: Path) -> list[Path]:
    directory = root / 'apks'
    dated = sorted((p for p in directory.glob('*.apk') if re.fullmatch(r'钢铁华尔兹_\d{6}\.apk', p.name)), reverse=True)
    selected = os.environ.get('STEEL_ARCHIVE_APK')
    candidates = ([Path(selected)] if selected else []) + dated + [directory / '钢铁华尔兹.apk', root / '钢铁华尔兹.apk',
                          directory / 'base(1).apk', root / 'base(1).apk']
    return list(dict.fromkeys(p for p in candidates if p.is_file()))


def base_apk(root: Path) -> Path:
    for p in (root / 'apks/base(1).apk', root / 'base(1).apk', *client_apks(root)):
        if p.is_file():
            return p
    raise FileNotFoundError('No client APK found in apks/ or workspace root')
