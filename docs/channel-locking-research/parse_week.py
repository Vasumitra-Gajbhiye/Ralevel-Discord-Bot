import re,glob,json
from datetime import datetime
day=re.compile(r'^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) (\d{1,2}) ([A-Za-z]+)\s*$')
row=re.compile(r'(?:(IG|9–1|OL|AS|AL)\s+)?(\S.*?)?\s+(\d{4}/\d{2})\s+((?:\d+h)?(?:\s?\d+m)?)\s+(AM|PM|EV)\b')
out={}
for f in sorted(glob.glob('*timetable.txt')):
    L=open(f).read().split('\n')
    # find start of syllabus view (second occurrence of 'Syllabus view (A–Z)')
    idx=[i for i,l in enumerate(L) if l.strip().startswith('Syllabus view (A–Z)')]
    end=idx[1] if len(idx)>1 else len(L)
    cur=None; rows=[]
    for l in L[:end]:
        m=day.match(l)
        if m:
            dt=datetime.strptime(f"{m.group(2)} {m.group(3)} 2026","%d %B %Y")
            if dt.strftime('%A')!=m.group(1):
                for mon in ['April','May','June','September','October','November']:
                    alt=datetime.strptime(f"{m.group(2)} {mon} 2026","%d %B %Y")
                    if alt.strftime('%A')==m.group(1): print('FIXED',f,m.group(0).strip(),'->',alt.date()); dt=alt; break
            cur=dt.date().isoformat(); continue
        if cur is None: continue
        for r in row.finditer(l):
            q,name,code,dur,sess=r.groups()
            rows.append({'date':cur,'qual':q,'name':(name or '').strip(),'code':code,'dur':dur.strip(),'sess':sess})
    out[f]=rows
    print(f,len(rows),len({x['code'] for x in rows}))
json.dump(out,open('../tt_week.json','w'),indent=1,ensure_ascii=False)
