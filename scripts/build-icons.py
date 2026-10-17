import cairosvg, io, os, json, shutil
from PIL import Image, ImageDraw
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import sys; O=sys.argv[1] if len(sys.argv)>1 else 'branding/icon'; os.makedirs(O+'/svg',exist_ok=True)
NAVY_T,NAVY_B='#1d3160','#070c1a'
DEFS='''<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e3463"/><stop offset=".55" stop-color="#101d3c"/><stop offset="1" stop-color="#070c1a"/></linearGradient>
<radialGradient id="halo" cx="512" cy="480" r="400" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffb84a" stop-opacity=".6"/><stop offset=".45" stop-color="#f59e2a" stop-opacity=".18"/><stop offset="1" stop-color="#f59e2a" stop-opacity="0"/></radialGradient>
<linearGradient id="beamL" x1="380" y1="0" x2="150" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd890" stop-opacity=".9"/><stop offset=".45" stop-color="#f5a524" stop-opacity=".4"/><stop offset="1" stop-color="#f5a524" stop-opacity="0"/></linearGradient>
<linearGradient id="beamR" x1="644" y1="0" x2="874" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd890" stop-opacity=".9"/><stop offset=".45" stop-color="#f5a524" stop-opacity=".4"/><stop offset="1" stop-color="#f5a524" stop-opacity="0"/></linearGradient>
<radialGradient id="lamp" cx="512" cy="480" r="130" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffbe8"/><stop offset=".4" stop-color="#ffdc8a"/><stop offset=".85" stop-color="#f7a832"/><stop offset="1" stop-color="#e48a17"/></radialGradient>
<linearGradient id="dome" x1="0" y1="296" x2="0" y2="404" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2c4c94"/><stop offset="1" stop-color="#101f47"/></linearGradient>
<radialGradient id="domeHi" cx="470" cy="330" r="90" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9fbcf5" stop-opacity=".45"/><stop offset="1" stop-color="#8fb0ee" stop-opacity="0"/></radialGradient>
<linearGradient id="tower" x1="404" y1="0" x2="620" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#22355f"/><stop offset=".45" stop-color="#18284d"/><stop offset="1" stop-color="#0a1229"/></linearGradient>
<linearGradient id="towerWarm" x1="0" y1="592" x2="0" y2="700" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f5a524" stop-opacity=".45"/><stop offset="1" stop-color="#f5a524" stop-opacity="0"/></linearGradient>
<linearGradient id="brass" x1="0" y1="262" x2="0" y2="300" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9c47a"/><stop offset="1" stop-color="#9c7432"/></linearGradient>
<linearGradient id="deck" x1="0" y1="560" x2="0" y2="592" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3a5a9c"/><stop offset="1" stop-color="#1a2c58"/></linearGradient>
</defs>'''
M='#13224a'  # mullion / ironwork
def art():
  rail=''.join(f'<rect x="{x-3}" y="520" width="6" height="40" rx="2" fill="#0b1430"/>' for x in range(388,637,31))
  mull=''.join(f'<rect x="{x-4}" y="418" width="8" height="142" fill="#3a2410" opacity=".85"/>' for x in (458,512,566))
  tower=f'<g transform="translate(512 520) scale(1.28) translate(-512 -520)">' + f'''
<path d="M402 592 L622 592 L604 742 L420 742 Z" fill="url(#tower)"/>
<path d="M402 592 L622 592 L604 742 L420 742 Z" fill="url(#towerWarm)"/>
<rect x="404" y="738" width="216" height="22" rx="8" fill="#14224a"/>
<rect x="404" y="410" width="216" height="152" rx="6" fill="url(#lamp)"/>
<rect x="404" y="410" width="216" height="10" fill="#0f1a38"/>
{mull}
<rect x="400" y="410" width="12" height="152" rx="4" fill="#0f1a38"/>
<rect x="612" y="410" width="12" height="152" rx="4" fill="#0f1a38"/>
<path d="M386 404 C386 338 444 296 512 296 C580 296 638 338 638 404 Z" fill="url(#dome)"/>
<path d="M386 404 C386 338 444 296 512 296 C580 296 638 338 638 404 Z" fill="url(#domeHi)"/>
<rect x="374" y="398" width="276" height="18" rx="9" fill="#172a58"/>
<rect x="374" y="412" width="276" height="4" rx="2" fill="#ffc35a" opacity=".45"/>
<rect x="506" y="282" width="12" height="20" rx="3" fill="url(#brass)"/>
<circle cx="512" cy="274" r="13" fill="url(#brass)"/>
{rail}
<rect x="376" y="514" width="272" height="8" rx="4" fill="#0b1430"/>
<rect x="362" y="558" width="300" height="24" rx="8" fill="url(#deck)"/>
<rect x="362" y="558" width="300" height="5" rx="2.5" fill="#ffc35a" opacity=".6"/></g>'''
  return f'''<circle cx="512" cy="480" r="400" fill="url(#halo)"/>
<path d="M380 400 L150 290 L150 690 L380 610 Z" fill="url(#beamL)" opacity=".35"/>
<path d="M644 400 L874 290 L874 690 L644 610 Z" fill="url(#beamR)" opacity=".35"/>
<path d="M380 422 L150 350 L150 630 L380 586 Z" fill="url(#beamL)" opacity=".6"/>
<path d="M644 422 L874 350 L874 630 L644 586 Z" fill="url(#beamR)" opacity=".6"/>
<path d="M380 444 L170 404 L170 576 L380 566 Z" fill="url(#beamL)" opacity=".7"/>
<path d="M644 444 L854 404 L854 576 L644 566 Z" fill="url(#beamR)" opacity=".7"/>
{tower}'''
def svg(body,vb="0 0 1024 1024",label="Beacon"):
  return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{label}"><title>{label}</title>{body}</svg>'
BG='<rect width="1024" height="1024" fill="url(#bg)"/>'
def w(name,s): open(f'{O}/svg/{name}','w').write(s); return f'{O}/svg/{name}'
master=w('app-icon-master.svg',svg(DEFS+BG+art()))
w('app-icon-maskable.svg',svg(DEFS+BG+f'<g transform="translate(512 512) scale(.86) translate(-512 -520)">{art()}</g>'))
w('app-icon-adaptive-foreground.svg',svg(DEFS+f'<g transform="translate(512 512) scale(.80) translate(-512 -520)">{art()}</g>'))
w('app-icon-adaptive-background.svg',svg(DEFS+BG))
# small mark (64 grid)
def small(c=None):
  t,d,a,f=('#0f1a33','#3a5eae','#f7a92a','#f7a92a') if not c else (None,c,c,c)
  tile=f'<rect width="64" height="64" rx="14" fill="{t}"/>' if t else ''
  return tile+f'''<circle cx="32" cy="9" r="3" fill="{f}"/>
<path d="M18 25 C18 17 24 13 32 13 C40 13 46 17 46 25 Z" fill="{d}"/>
<rect x="20" y="27" width="24" height="15" rx="1.5" fill="{a}"/>
<path d="M16 30 L3 25 V44 L16 39 Z" fill="{a if c else '#ffd27a'}"/>
<path d="M48 30 L61 25 V44 L48 39 Z" fill="{a if c else '#ffd27a'}"/>
<rect x="15" y="44" width="34" height="5" rx="2" fill="{d}"/>
<path d="M22 51 H42 L40 59 H24 Z" fill="{d}"/>'''
w('favicon.svg',svg(small(),"0 0 64 64"))
w('icon-mono.svg',svg(small('currentColor'),"0 0 64 64"))
# wordmark via Inter paths
f=TTFont(''+os.environ['INTER_TTF']+'')
f=instancer.instantiateVariableFont(f,{'wght':650,'opsz':32})
gs=f.getGlyphSet(); cmap=f.getBestCmap(); upm=f['head'].unitsPerEm
def textpath(s,size,x0,base,track=0):
  pen=SVGPathPen(gs); x=0; sc=size/upm
  for ch in s:
    g=cmap.get(ord(ch),cmap[32]); tp=TransformPen(pen,(sc,0,0,-sc,x0+x*sc,base)); gs[g].draw(tp); x+=f['hmtx'][g][0]+track
  return pen.getCommands(), x*sc
wm,wl=textpath('Beacon',64,0,64)
w('wordmark.svg',svg(f'<path fill="currentColor" d="{wm}"/>',f"0 0 {wl:.0f} 80"))
# HA logo 250x100 lockup (horizontal): small tile icon + wordmark
lk,ll=textpath('Beacon',40,100,64)
w('horizontal-lockup.svg',svg(f'<g transform="translate(8 14) scale(.0703)"><clipPath id="sq"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#sq)">{DEFS}{BG}{art()}</g></g><path fill="#1d2b4f" d="{lk}"/>',"0 0 250 100"))
# OG
t1,_=textpath('Beacon',120,600,300); t2,_=textpath('Your family command center',40,604,370); t3,_=textpath('Calendar · chores · meals · photos',28,606,430)
w('og.svg',svg(DEFS.replace('<defs>','<defs><linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3463"/><stop offset="1" stop-color="#070c1a"/></linearGradient>')+'<rect width="1200" height="630" fill="url(#ogbg)"/>'+f'<g transform="translate(70 75) scale(.469)"><clipPath id="sq"><rect width="1024" height="1024" rx="230"/></clipPath><g clip-path="url(#sq)">{BG}{art()}</g></g><path fill="#ffffff" d="{t1}"/><path fill="#ffd27a" d="{t2}"/><path fill="#9fb3d9" d="{t3}"/>',"0 0 1200 630"))
# ---------- raster exports ----------
def png(src,size,out,h=None):
  os.makedirs(os.path.dirname(out),exist_ok=True)
  cairosvg.svg2png(url=src,write_to=out,output_width=size,output_height=h or size)
def squircle(src,size,out,r=.2237,circle=False):
  os.makedirs(os.path.dirname(out),exist_ok=True); im=Image.open(io.BytesIO(cairosvg.svg2png(url=src,output_width=size*4))).convert('RGBA')
  m=Image.new('L',im.size,0);dr=ImageDraw.Draw(m)
  (dr.ellipse if circle else (lambda b,fill:dr.rounded_rectangle(b,radius=int(size*4*r),fill=fill)))([0,0,size*4-1,size*4-1],fill=255)
  im.putalpha(m);im.resize((size,size),Image.LANCZOS).save(out)
S=O+'/svg/';E=O+'/export/'
MAP={}
def add(local,*repo): MAP[local]=list(repo)
for n in [192,256,512]:
  squircle(S+'app-icon-master.svg',n,E+f'web/beacon-app-icon-{n}.png'); add(f'export/web/beacon-app-icon-{n}.png',f'src/assets/beacon-app-icon-{n}.png',f'beacon/src/assets/beacon-app-icon-{n}.png')
  squircle(S+'app-icon-master.svg',n,E+f'web/beacon-icon-{n}.png'); add(f'export/web/beacon-icon-{n}.png',f'src/assets/beacon-icon-{n}.png',f'beacon/src/assets/beacon-icon-{n}.png') if n!=192 else None
for n in [16,32,64]:
  png(S+'favicon.svg',n,E+f'web/beacon-app-icon-{n}.png'); add(f'export/web/beacon-app-icon-{n}.png',f'src/assets/beacon-app-icon-{n}.png',f'beacon/src/assets/beacon-app-icon-{n}.png')
png(S+'favicon.svg',64,E+'web/beacon-icon-64.png'); add('export/web/beacon-icon-64.png','src/assets/beacon-icon-64.png','beacon/src/assets/beacon-icon-64.png')
png(S+'favicon.svg',32,E+'web/beacon-favicon-32.png'); add('export/web/beacon-favicon-32.png','src/assets/beacon-favicon-32.png','beacon/src/assets/beacon-favicon-32.png')
for n in [192,512]:
  png(S+'app-icon-maskable.svg',n,E+f'web/beacon-app-icon-{n}-maskable.png')
add('export/web/beacon-app-icon-192-maskable.png','src/assets/beacon-app-icon-192-maskable.png','beacon/src/assets/beacon-app-icon-192-maskable.png')
add('export/web/beacon-app-icon-512-maskable.png','NEW: src/assets/beacon-app-icon-512-maskable.png (+beacon/ copy; add to manifest.json purpose:maskable)')
add('svg/app-icon-master.svg','src/assets/beacon-app-icon.svg','beacon/src/assets/beacon-app-icon.svg')
add('svg/app-icon-maskable.svg','src/assets/beacon-app-icon-maskable.svg','beacon/src/assets/beacon-app-icon-maskable.svg')
add('svg/favicon.svg','docs-site/public/favicon.svg','NEW: public/favicon.svg (point index.html <link rel=icon> here instead of the full app icon)')
add('svg/wordmark.svg','src/assets/beacon-wordmark.svg','beacon/src/assets/beacon-wordmark.svg')
add('svg/horizontal-lockup.svg','src/assets/beacon-logo-horizontal.svg','beacon/src/assets/beacon-logo-horizontal.svg')
add('svg/og.svg','src/assets/beacon-og.svg','beacon/src/assets/beacon-og.svg')
png(S+'og.svg',1200,E+'web/beacon-og.png',630); add('export/web/beacon-og.png','src/assets/beacon-og.png','beacon/src/assets/beacon-og.png')
png(S+'horizontal-lockup.svg',1000,E+'web/beacon-logo-horizontal.png',400); add('export/web/beacon-logo-horizontal.png','src/assets/beacon-logo-horizontal.png','beacon/src/assets/beacon-logo-horizontal.png')
# HA
squircle(S+'app-icon-master.svg',128,E+'ha/icon.png'); add('export/ha/icon.png','beacon/icon.png')
png(S+'horizontal-lockup.svg',250,E+'ha/logo.png',100); add('export/ha/logo.png','beacon/logo.png')
# Android
for d,n in dict(mdpi=48,hdpi=72,xhdpi=96,xxhdpi=144,xxxhdpi=192).items():
  b=f'android/app/src/main/res/mipmap-{d}/'
  squircle(S+'app-icon-master.svg',n,E+b+'ic_launcher.png',r=.18); add('export/'+b+'ic_launcher.png',b+'ic_launcher.png')
  squircle(S+'app-icon-master.svg',n,E+b+'ic_launcher_round.png',circle=True); add('export/'+b+'ic_launcher_round.png',b+'ic_launcher_round.png')
  png(S+'app-icon-adaptive-foreground.svg',int(n*2.25),E+b+'ic_launcher_foreground.png'); add('export/'+b+'ic_launcher_foreground.png',b+'ic_launcher_foreground.png')
png(S+'app-icon-adaptive-background.svg',432,E+'android/ic_launcher_background.png'); add('export/android/ic_launcher_background.png','NEW: android/app/src/main/res/drawable/ic_launcher_background.png (or keep values/ic_launcher_background.xml color #101d3c; check mipmap-anydpi-v26/ic_launcher.xml)')
# iOS (opaque, no alpha)
png(S+'app-icon-master.svg',1024,E+'ios/AppIcon-512@2x.png')
Image.open(E+'ios/AppIcon-512@2x.png').convert('RGB').save(E+'ios/AppIcon-512@2x.png')
add('export/ios/AppIcon-512@2x.png','ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
json.dump(MAP,open(O+'/manifest.json','w'),indent=1)
# Copy files to repo paths per manifest
print("\nCopying files to repository paths...")
for src_path, repo_paths in MAP.items():
  src_file = os.path.join(O, src_path) if not src_path.startswith(O) else src_path
  if not os.path.exists(src_file):
    src_file = src_path
  if not os.path.exists(src_file):
    print(f"WARNING: Source file not found: {src_file}")
    continue
  for repo_path in repo_paths:
    if repo_path.startswith('NEW:'):
      print(f"  NEW: {repo_path[5:].strip()} (needs review)")
      dest = repo_path.split('(')[0].replace('NEW:', '').strip()
    else:
      dest = repo_path
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copy2(src_file, dest)
    print(f"  {src_file} -> {dest}")
print("\nIcon build complete! Generated files in", O)
