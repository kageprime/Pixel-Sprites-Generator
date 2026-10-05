import json,base64,os
R='../veilspire_iso'
d=json.load(open(f'{R}/veilspire_iso.json'))
ch=d['characters']
M={'animations':d['animations'],'characters':[{'id':c['id'],'name':c['name'],'weapon':c['weapon'],'role':c['role'],'title':c['title'],'attacks':c['attacks']} for c in ch]}
import io
from PIL import Image
def b64(p):
    if p.endswith('shadow_standard.png'): return 'data:image/png;base64,'+base64.b64encode(open(p,'rb').read()).decode()
    q=Image.open(p).convert('RGBA').quantize(256,method=Image.FASTOCTREE,dither=Image.NONE); o=io.BytesIO(); q.save(o,'PNG',optimize=True)
    return 'data:image/png;base64,'+base64.b64encode(o.getvalue()).decode()
img={'shadow':b64(f'{R}/shadow_standard.png')}
for c in ch:
    i=c['id']
    for a in c['sheets']:
        img[f'{i}/{a}']=b64(f'{R}/{i}/{a}.png')
        for p in ['p16','p38']:
            q=f'{R}/{i}/{p}/{a}.png'
            if os.path.exists(q): img[f'{i}/{p}/{a}']=b64(q)
import glob
ad='../veilspire_iso/arena'
if os.path.isdir(ad):
    for p in sorted(glob.glob(f'{ad}/*.png')):
        img['arena/'+os.path.splitext(os.path.basename(p))[0]]=b64(p)
vd='../veilspire_iso/vfx'
if os.path.isdir(vd):
    for p in sorted(glob.glob(f'{vd}/*.png')):
        img['vfx/'+os.path.splitext(os.path.basename(p))[0]]=b64(p)
import shutil
src_combat=open('combat.src.html').read()
os.makedirs('out',exist_ok=True)
payload_combat=json.dumps({'M':M,'img':img},separators=(',',':'))
open('out/combat.html','w').write(src_combat.replace('/*DATA*/null',payload_combat))
print('combat',os.path.getsize('out/combat.html')//1024,'KB')
shutil.copyfile('out/combat.html','../combat.html')
# hollow level art: cursed ground sheet, undead/city props, swordwarrior foe sheets
td='art/tiles'
if os.path.isdir(td):
    for p in sorted(glob.glob(f'{td}/*.png')):
        img['tile/'+os.path.splitext(os.path.basename(p))[0]]=b64(p)
pd='art/props'
if os.path.isdir(pd):
    for p in sorted(glob.glob(f'{pd}/*.png')):
        img['prop/'+os.path.splitext(os.path.basename(p))[0]]=b64(p)
fd='art/foes'
if os.path.isdir(fd):
    for p in sorted(glob.glob(f'{fd}/*.png')):
        img['foe/'+os.path.splitext(os.path.basename(p))[0]]=b64(p)
try:
    src_hollow=open('hollow.src.html').read()
    payload_hollow=json.dumps({'M':M,'img':img},separators=(',',':'))
    open('out/hollow.html','w').write(src_hollow.replace('/*DATA*/null',payload_hollow))
    print('hollow',os.path.getsize('out/hollow.html')//1024,'KB')
    shutil.copyfile('out/hollow.html','../hollow.html')
except FileNotFoundError:
    pass
