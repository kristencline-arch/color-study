"""Create credited photographic study cards; no generated or reconstructed art."""
import hashlib,json
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1];PUBLIC=ROOT/'public'
ORIGIN='https://color-study-painted-surfaces.kristen368163.chatgpt.site'
def font(size):
    for candidate in ['/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if Path(candidate).exists():return ImageFont.truetype(candidate,size)
    return ImageFont.load_default(size=size)
def lines(draw,text,typeface,width):
    rows=['']
    for word in text.split():
        candidate=(rows[-1]+' '+word).strip()
        if rows[-1] and draw.textlength(candidate,font=typeface)>width:rows.append(word)
        else:rows[-1]=candidate
    return rows
def main():
    sources=json.loads((PUBLIC/'sources.json').read_text());pairs={p['id']:p for p in json.loads((PUBLIC/'showcase.json').read_text())}
    out=PUBLIC/'social';out.mkdir(exist_ok=True);manifest=[]
    for s in sources:
        pair=pairs.get(s['id']);card=Image.new('RGB',(1200,630),'#efe9de');d=ImageDraw.Draw(card)
        d.text((32,18),'COLOR STUDY  /  LOOK A LITTLE CLOSER',font=font(19),fill='#465948')
        titlefont=font(32);title=lines(d,s['short_title'],titlefont,1136)
        if len(title)>2:titlefont=font(26);title=lines(d,s['short_title'],titlefont,1136)
        for i,line in enumerate(title):d.text((32,48+i*34),line,font=titlefont,fill='#263a2c')
        paths=[pair['files'][kind]['path'] for kind in ['original','enhanced']] if pair else [s['thumbnail_file']]
        labels=['SOURCE PHOTOGRAPH','FALSE-COLOR ENHANCEMENT'] if pair else ['SOURCE PHOTOGRAPH / OPEN IN THE IMAGE LAB']
        width=552 if pair else 1136
        for i,(path,label) in enumerate(zip(paths,labels)):
            x=32+i*584;d.text((x,124),label,font=font(17),fill='#465948')
            d.rectangle((x,151,x+width,513),fill='#28312b')
            with Image.open(PUBLIC/path) as raw:im=ImageOps.contain(ImageOps.exif_transpose(raw).convert('RGB'),(width,362),Image.Resampling.LANCZOS)
            card.paste(im,(x+(width-im.width)//2,151+(362-im.height)//2))
        credit='Photo: '+s['author']+' · '+s['license']+'. '+('Modified with RGB decorrelation stretch.' if pair else 'Resized preview; original preserved.')
        for i,line in enumerate(lines(d,credit,font(16),1136)):d.text((32,529+i*20),line,font=font(16),fill='#465948')
        d.text((32,599),'Source, license and full-resolution photograph: color-study-painted-surfaces.kristen368163.chatgpt.site/study/'+s['id'],font=font(12),fill='#465948')
        path=out/(s['id']+'.jpg');card.save(path,quality=86,optimize=True)
        manifest.append(dict(id=s['id'],file='social/'+path.name,source_sha256=s['sha256'],sha256=hashlib.sha256(path.read_bytes()).hexdigest(),credit=s['author'],license=s['license'],license_url=s['license_url'],source_page=s['source_page'],modifications='Resized and placed in a labeled photographic card'+('; includes the recorded false-color comparison' if pair else ''),comparison_settings=pair['settings'] if pair else None,comparison_region=pair['region'] if pair else None))
    (PUBLIC/'social-previews.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    urls=[ORIGIN+'/']+[ORIGIN+'/study/'+s['id'] for s in sources]
    (PUBLIC/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join('  <url><loc>'+url+'</loc></url>\n' for url in urls)+'</urlset>\n')
    (PUBLIC/'robots.txt').write_text('User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: '+ORIGIN+'/sitemap.xml\n')
    print('Created',len(manifest),'photographic cards and a study sitemap.')
if __name__=='__main__':main()
