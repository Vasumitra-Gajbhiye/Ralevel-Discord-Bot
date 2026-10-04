import csv, re
from datetime import datetime, timedelta, timezone
from collections import defaultdict
rows = [r for r in csv.DictReader(open("cambridge_2026_timetables_parsed.csv")) if r["series"]=="november-2026" and r["qual"] in ("AS","AL")]
def dur(s):
    h=re.search(r"(\d+)h",s); m=re.search(r"(\d+)m",s); return (int(h.group(1)) if h else 0)*60+(int(m.group(1)) if m else 0)
def K(r): return datetime.strptime(r["key_time_utc"],"%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
for syl in ("9709","9701","9274"):
    print("--", syl)
    by=defaultdict(list)
    for r in rows:
        if r["syllabus"]==syl: by[(K(r),r["component"])].append(r["zone"])
    for (k,c),zs in sorted(by.items()): print(f"  {k:%a %d %b %H:%M}Z  {syl}/{c}  zones {','.join(sorted(zs))}")
# channel-level: merge windows per syllabus (as if 1 channel per syllabus), per-cluster policy vs whole-span policy
def windows(syl, whole_span=False, gap=24):
    papers=defaultdict(list)
    for r in rows:
        if r["syllabus"]==syl: papers[r["paper_number"]].append((K(r),int(r["zone"]),dur(r["duration"])))
    out=[]
    for p,s in papers.items():
        s.sort(); cl=[[s[0]]]
        for x in s[1:]:
            if not whole_span and ((x[0]-cl[-1][-1][0]).total_seconds()/3600>gap or x[1] in {y[1] for y in cl[-1]}): cl.append([x])
            else: cl[-1].append(x)
        for c in cl:
            d=max(y[2] for y in c); out.append((c[0][0]-timedelta(minutes=60), c[-1][0]+timedelta(minutes=round(d*1.25)+30)))
    out.sort(); merged=[]
    for a,b in out:
        if merged and a<=merged[-1][1]+timedelta(minutes=60): merged[-1][1]=max(merged[-1][1],b)
        else: merged.append([a,b])
    return merged
print()
for syl in ("9709","9701","9702","9700","9708","9618"):
    for ws in (False, True):
        m=windows(syl, whole_span=ws); hrs=sum((b-a).total_seconds() for a,b in m)/3600
        print(f"{syl} {'whole-span' if ws else 'per-cluster'}: {len(m)} lock periods, {hrs:.0f}h locked total ({hrs/24:.1f} days), longest {max((b-a).total_seconds()/3600 for a,b in m):.0f}h")
