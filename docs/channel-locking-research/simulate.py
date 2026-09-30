import csv, re, sys
from datetime import datetime, timedelta, timezone
from collections import defaultdict

GAP_H = float(sys.argv[1]) if len(sys.argv) > 1 else 24
PRE_MIN, POST_MIN, EXTRA = 60, 30, 0.25
rows = [r for r in csv.DictReader(open("cambridge_2026_timetables_parsed.csv")) if r["qual"] in ("AS", "AL")]

def dur_min(s):
    h = re.search(r"(\d+)h", s); m = re.search(r"(\d+)m", s)
    return (int(h.group(1)) if h else 0) * 60 + (int(m.group(1)) if m else 0)

def report(series):
    rs = [r for r in rows if r["series"] == series]
    papers = defaultdict(list)  # (syllabus, paper digit) -> sittings
    for r in rs:
        k = datetime.strptime(r["key_time_utc"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)
        papers[(r["syllabus"], r["paper_number"])].append((k, int(r["zone"]), r["component"], dur_min(r["duration"])))
    clusters = []
    for key, sits in papers.items():
        sits.sort()
        cur = [sits[0]]
        for s in sits[1:]:
            gap = (s[0] - cur[-1][0]).total_seconds() / 3600
            zones_in = {c[1] for c in cur}
            if gap > GAP_H or s[1] in zones_in:
                clusters.append((key, cur)); cur = [s]
            else:
                cur.append(s)
        clusters.append((key, cur))
    multi = defaultdict(int)
    for key, _ in clusters: multi[key] += 1
    lens = []
    for key, c in clusters:
        kf, kl = c[0][0], c[-1][0]
        d = max(x[3] for x in c)
        lock = kf - timedelta(minutes=PRE_MIN)
        unlock = kl + timedelta(minutes=round(d * (1 + EXTRA)) + POST_MIN)
        lens.append(((unlock - lock).total_seconds() / 3600, key, lock, unlock, len({x[1] for x in c})))
    lens.sort()
    import statistics
    hs = [l[0] for l in lens]
    print(f"== {series} AS/AL | gap threshold {GAP_H}h ==")
    print(f"rows {len(rs)}, syllabuses {len({r['syllabus'] for r in rs})}, logical papers {len(papers)}, lock clusters {len(clusters)}")
    print(f"papers split into >1 cluster: {sum(1 for v in multi.values() if v > 1)}")
    print(f"cluster lock length h: min {min(hs):.1f} median {statistics.median(hs):.1f} max {max(hs):.1f}")
    print("longest 5:", [(f'{l[1][0]}/P{l[1][1]}', round(l[0],1), l[4]) for l in lens[-5:]])
    print("split papers:", sorted(f"{k[0]}/P{k[1]}" for k, v in multi.items() if v > 1))
    # per syllabus locked hours after today
    today = datetime(2026, 9, 30, tzinfo=timezone.utc)
    future = [l for l in lens if l[3] > today]
    print(f"clusters not yet finished as of 2026-09-30: {len(future)}")
    # zones count distribution
    zc = defaultdict(int)
    for l in lens: zc[l[4]] += 1
    print("zones per cluster:", dict(sorted(zc.items())))
    print()

for s in ("june-2026", "november-2026"):
    report(s)
