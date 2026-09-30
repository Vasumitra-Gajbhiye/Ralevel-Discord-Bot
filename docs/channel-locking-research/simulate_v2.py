"""Lock-window simulation with the final plan rules:
- A Level = syllabus code starting 8 or 9
- paper = first component digit, except single-variant '0N' components -> paper N
- clusters split only on gaps > 24h between consecutive sittings (no zone-repeat rule)
- lockAt = firstKey - 60m; unlockAt = lastKey + ceil(maxDur*1.25) + 30m
"""
import csv, re, math, statistics
from datetime import datetime, timedelta, timezone
from collections import defaultdict
ALL = list(csv.DictReader(open("cambridge_2026_timetables_parsed.csv")))
def dur(s):
    h=re.search(r"(\d+)h",s); m=re.search(r"(\d+)m",s); return (int(h.group(1)) if h else 0)*60+(int(m.group(1)) if m else 0)
def K(r): return datetime.strptime(r["key_time_utc"],"%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
def paper_of(c): return c[1] if c[0]=="0" else c[0]
def windows(series):
    rows=[r for r in ALL if r["series"]==series and r["syllabus"][0] in "89"]
    papers=defaultdict(list)
    for r in rows: papers[(r["syllabus"],paper_of(r["component"]))].append((K(r),int(r["zone"]),dur(r["duration"]),r["component"]))
    out=[]
    for k,s in papers.items():
        s.sort(); cl=[[s[0]]]
        for x in s[1:]:
            if (x[0]-cl[-1][-1][0]).total_seconds()/3600>24: cl.append([x])
            else: cl[-1].append(x)
        comp_cl=defaultdict(set)
        for i,c in enumerate(cl):
            for y in c: comp_cl[y[3]].add(i)
        assert all(len(v)==1 for v in comp_cl.values()), (k, comp_cl)
        for i,c in enumerate(cl):
            d=max(y[2] for y in c)
            out.append(dict(key=k,idx=i,n=len(cl),lock=c[0][0]-timedelta(minutes=60),unlock=c[-1][0]+timedelta(minutes=math.ceil(d*1.25)+30),zones=sorted({y[1] for y in c})))
    return rows,papers,out
for series in ("june-2026","november-2026"):
    rows,papers,w=windows(series)
    hs=[(x["unlock"]-x["lock"]).total_seconds()/3600 for x in w]
    split={x["key"] for x in w if x["n"]>1}
    ev=sorted({x["lock"] for x in w}|{x["unlock"] for x in w})
    peak=max(len({x["key"][0] for x in w if x["lock"]<=t<x["unlock"]}) for t in ev)
    starts=defaultdict(int)
    for x in w: starts[x["lock"]]+=1
    left=sum(1 for x in w if x["unlock"]>datetime(2026,9,30,12,tzinfo=timezone.utc))
    print(f"{series}: rows {len(rows)} syllabuses {len({r['syllabus'] for r in rows})} papers {len(papers)} windows {len(w)} split-papers {len(split)} median {statistics.median(hs):.1f}h max {max(hs):.1f}h peak {peak} max-starts {max(starts.values())} unfinished@30Sep12Z {left}")
