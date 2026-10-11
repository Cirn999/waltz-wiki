"""Resolve original client UI codes, including packed/rotated atlas sprites."""
import io
import plistlib
import re
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw
from decode_configs import config_path
from inspect_ui_attribute_icons import parse_ui_styles
from export_ui_images import sprite_image

ROOT = Path(__file__).resolve().parents[2]

class StageAssets:
    def __init__(self, check=False):
        self.check = check
        self.styles = {r['code']: r for r in parse_ui_styles(config_path('UIStyle.dat'))}
        self.archives = [zipfile.ZipFile(p) for p in (
            ROOT/'钢铁华尔兹.apk', ROOT/'base(1).apk',
            ROOT/'analysis_apk/official_patch_2_38.zip', ROOT/'analysis_apk/official_summary_2.zip') if p.exists()]
        self.members = [(z, set(z.namelist())) for z in self.archives]
        self.atlases = {}
        self.exports = {}
        self.missing = set()
        self.out = ROOT/'steel-maiden-browser/public/art/stages'
        if not check: self.out.mkdir(parents=True, exist_ok=True)

    def read(self, name):
        for root in ('patch/_1.18/ui', 'Resources/ui', 'analysis_apk/apk_ui_heads', 'analysis_apk/apk_ui_assets'):
            path = ROOT/root/name
            if path.is_file(): return path.read_bytes()
        for z, names in self.members:
            for prefix in ('assets/Resources/ui/', 'Resources/ui/', 'ui/', ''):
                if prefix+name in names: return z.read(prefix+name)
        return None

    def image(self, code):
        style = self.styles.get(code)
        if not style: return None
        raw = self.read(style['file'])
        if raw: return Image.open(io.BytesIO(raw)).convert('RGBA')
        atlas = style['atlas']
        if not atlas: return None
        if atlas not in self.atlases:
            meta, image = self.read(atlas+'.plist'), self.read(atlas+'.pn_')
            self.atlases[atlas] = (plistlib.loads(meta)['frames'], Image.open(io.BytesIO(image)).convert('RGBA')) if meta and image else None
        sheet = self.atlases[atlas]
        if not sheet or style['file'] not in sheet[0]: return None
        return sprite_image(sheet[1], sheet[0][style['file']])

    def export(self, code):
        if not code or code == 'tm-001': return ''  # Native transparent placeholder, not an icon.
        if code in self.exports: return self.exports[code]
        image = self.image(code)
        if image is None or not image.width or not image.height:
            self.missing.add(code)
            return ''
        name = re.sub(r'[^\w.-]', '_', code)+'.webp'
        image.thumbnail((720, 440))
        if self.check:
            assert (self.out/name).is_file(), f'Missing exported asset {name}'
        else:
            image.save(self.out/name, 'WEBP', quality=88, method=4)
        self.exports[code] = '/art/stages/'+name
        return self.exports[code]

    def close(self):
        for z in self.archives: z.close()

if __name__ == '__main__':
    a = StageAssets()
    codes = [c for c,s in a.styles.items() if s['atlas']=='rollout' or c.startswith('tsgk-') or c in ('gkh-01','gkh-02','gkh-03')]
    sheet = Image.new('RGB', (1000, ((len(codes)+4)//5)*180), '#dce4d9')
    draw = ImageDraw.Draw(sheet)
    for i,c in enumerate(codes):
        im = a.image(c)
        if im is not None:
            im.thumbnail((190,150)); sheet.paste(im,(i%5*200+(200-im.width)//2,i//5*180),im)
        draw.text((i%5*200+8,i//5*180+155),c,fill='black')
    sheet.save(ROOT/'analysis_apk/output/stage-entry-contact.png')
    a.close()
