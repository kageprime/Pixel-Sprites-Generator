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
src=open('combat.src.html').read()
os.makedirs('out',exist_ok=True)
open('out/combat.html','w').write(src.replace('/*DATA*/null',json.dumps({'M':M,'img':img},separators=(',',':'))))
print(len(os.path.getsize('out/combat.html').__str__()),os.path.getsize('out/combat.html')//1024,'KB')
