#!/usr/bin/env python3
"""v4 시안 렌더러: screens/*.html 템플릿 → build/*.html → ../<name>.png (780px, @2x).

템플릿 지시어
  <!--@status light|dark-->   상태 표시줄
  <!--@nav N-->                하단 내비(0 내 분석, 1 퍼스널컬러, 2 추구미, 3 내 기록)
  <!--@home light|dark-->     홈 인디케이터만
  <!--@i name-->              아이콘 SVG
사용: python3 render.py [02 03 ...]
"""
import os, re, subprocess, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

ICONS = {
    "back": '<path d="M15 5l-7 7 7 7"/>',
    "x": '<path d="M6 6l12 12M18 6L6 18"/>',
    "share": '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V12"/>',
    "search": '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    "scan": '<path d="M4 8.5V6a2 2 0 012-2h2.5M15.5 4H18a2 2 0 012 2v2.5M20 15.5V18a2 2 0 01-2 2h-2.5M8.5 20H6a2 2 0 01-2-2v-2.5"/><circle cx="12" cy="11" r="2.6"/><path d="M8 17c.8-1.7 2.3-2.6 4-2.6s3.2.9 4 2.6"/>',
    "palette": '<circle cx="9" cy="12" r="5.2"/><circle cx="15" cy="12" r="5.2"/>',
    "library": '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 9.5h16M10 9.5V20"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "upload": '<path d="M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15M12 15V4M7.5 8.5L12 4l4.5 4.5"/>',
    "imgplus": '<rect x="3.5" y="5" width="13" height="13" rx="2"/><path d="M3.5 15l3.5-3.5 3 3 2-2 4.5 4.5"/><circle cx="8.3" cy="9.3" r="1.2"/><path d="M19.5 3v6M16.5 6h6"/>',
    "chev": '<path d="M9 6l6 6-6 6"/>',
    "flip": '<path d="M4 9a8 8 0 0114.5-3.5L20 7M20 15a8 8 0 01-14.5 3.5L4 17"/><path d="M20 3v4h-4M4 21v-4h4"/>',
    "bolt": '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
    "refresh": '<path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6"/>',
    "trash": '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    "edit": '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
}


def icon(name):
    return f'<svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>'


def status(mode):
    cls = " on-dark" if mode == "dark" else ""
    return f'''<div class="status{cls}"><span>9:41</span><span class="sys">
<svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx="1"/><rect x="5" y="5.5" width="3.2" height="6.5" rx="1"/><rect x="10" y="3" width="3.2" height="9" rx="1"/><rect x="15" y="0" width="3.2" height="12" rx="1"/></svg>
<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.4 0 4.6.9 6.2 2.5l1.2-1.2A10.4 10.4 0 008.5.6 10.4 10.4 0 001.1 3.6l1.2 1.2A8.7 8.7 0 018.5 2.3zm0 3.4c1.5 0 2.8.6 3.8 1.5l1.2-1.2A7 7 0 008.5 4a7 7 0 00-5 2l1.2 1.2c1-.9 2.3-1.5 3.8-1.5zm0 3.4c.6 0 1.1.2 1.5.6L8.5 11.2 7 9.7c.4-.4.9-.6 1.5-.6z"/></svg>
<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.2"/><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" opacity=".45"/></svg>
</span></div>'''


NAV = [("scan", "내 분석"), ("palette", "퍼스널컬러"), ("search", "추구미"), ("library", "내 기록")]


def nav(active):
    a = int(active)
    tabs = []
    for i, (ic, label) in enumerate(NAV):
        on = " on" if i == a else ""
        tabs.append(f'<div class="tab{on}" aria-label="{label}">{icon(ic)}<span>{label}</span></div>')
    return f'<div class="nav-wrap"><div class="nav">{"".join(tabs)}</div></div><div class="home-ind"></div>'


def expand(src):
    src = re.sub(r"<!--@status (\w+)-->", lambda m: status(m.group(1)), src)
    src = re.sub(r"<!--@nav (\d)-->", lambda m: nav(m.group(1)), src)
    src = re.sub(r"<!--@home (\w+)-->", lambda m: f'<div class="home-ind{" on-dark" if m.group(1)=="dark" else ""}"></div>', src)
    src = re.sub(r"<!--@i ([\w-]+)-->", lambda m: icon(m.group(1)), src)
    return src


MEASURE = '<script>window.addEventListener("load",()=>document.fonts.ready.then(()=>{document.title="H"+Math.ceil(document.querySelector(".screen").getBoundingClientRect().height)}))</script>'


def chrome(*args):
    return subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                           "--force-device-scale-factor=2", "--virtual-time-budget=6000", *args],
                          capture_output=True, text=True, timeout=180)


def render(path):
    name = os.path.splitext(os.path.basename(path))[0]
    html = expand(open(path, encoding="utf-8").read()).replace("</body>", MEASURE + "</body>")
    built = os.path.join(HERE, f"_{name}.html")
    open(built, "w", encoding="utf-8").write(html)
    dom = chrome("--window-size=390,844", "--dump-dom", "file://" + built).stdout
    m = re.search(r"<title>H(\d+)</title>", dom)
    h = int(m.group(1)) if m else 844
    png = os.path.join(OUT, name + ".png")
    chrome(f"--window-size=390,{h}", f"--screenshot={png}", "file://" + built)
    print(f"{name}.png  390x{h}pt → 780x{h*2}px")


if __name__ == "__main__":
    want = sys.argv[1:]
    for p in sorted(glob.glob(os.path.join(HERE, "screens", "*.html"))):
        n = os.path.basename(p)
        if not want or any(n.startswith(w) for w in want):
            render(p)
