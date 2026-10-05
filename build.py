"""Build the AI Behavioral Profile website: six pages in English and Chinese.

Inputs:
  content/copy.json, content/methods.json, content/ui_extra.json, config.json
  data/releases/<release>/results.json and RELEASE.json (results.json is checked against the checksum in RELEASE.json)

Output: the folder given by --out (by default a local folder on this computer, never inside OneDrive).
Pages show saved results only. Numbers are rounded for display; nothing is re-estimated.

Usage:
  python -B build.py                 # build the current release
  python -B build.py --out DIR       # another output folder outside OneDrive
  python -B build.py --data FILE     # local test fixture instead of the release (not for publication)
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import sys
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import markdown
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
from markupsafe import Markup

SITE = Path(__file__).resolve().parent
# the home folder: one place for every tool on this computer, outside OneDrive (a packaged app may see a private copy
# of the usual local app data folder, so that folder is not used)
DEFAULT_OUT = Path.home() / "llm_behavioral_profile_site" / "dist"
LANGS = ("en", "zh")
HTML_LANG = {"en": "en", "zh": "zh-CN"}
AUTONYM = {"en": "English", "zh": "中文"}
PAGES = ("home", "explore", "robustness", "methods", "about", "ratings")
PAGE_PATH = {"home": "", "explore": "explore/", "robustness": "robustness/", "methods": "methods/",
             "about": "about/", "ratings": "rate-responses/"}
NAV_KEY = {"home": "nav_home", "explore": "nav_explore", "robustness": "nav_robustness",
           "ratings": "nav_rate", "methods": "nav_methods", "about": "nav_about"}
NAV_ORDER = ("home", "explore", "robustness", "ratings", "methods", "about")
MINUS = "−"
DIST_MARKER = ".llm-behavioral-profile-dist"
HEADERS = ("/*\n  X-Frame-Options: DENY\n  Content-Security-Policy: frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n"
           "  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n")
# link previews and search engines, used only when config.json names the public address (see public_base)
SHARE_IMAGE = {"en": "share/share-en.png", "zh": "share/share-zh.png", "root": "share/share.png"}   # in static/, made by tools/make_share_images.py
SHARE_SIZE = (1200, 630)
OG_LOCALE = {"en": "en_US", "zh": "zh_CN"}


# --------------------------------------------------------------------------- inputs


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def output_dir(path) -> Path:
    out = Path(path).resolve()
    # a OneDrive root is a folder named "OneDrive" or "OneDrive - <org>" (also given by the OneDrive* variables);
    # other folder names that merely contain the word, such as a temp folder, are fine
    roots = [Path(os.environ[k]).resolve() for k in ("OneDrive", "OneDriveConsumer", "OneDriveCommercial") if os.environ.get(k)]
    if any(p.lower() == "onedrive" or p.lower().startswith("onedrive - ") for p in out.parts) or any(r == out or r in out.parents for r in roots):
        raise SystemExit(f"Refusing to write generated pages inside OneDrive: {out}")
    if out.exists() and any(out.iterdir()) and not (out / DIST_MARKER).exists():
        raise SystemExit(f"Refusing to clear a folder this script did not create: {out}")
    return out


def load_inputs(args):
    cfg = read_json(SITE / "config.json")
    release = args.release or cfg["release"]
    rel_dir = SITE / "data" / "releases" / release
    meta = read_json(rel_dir / "RELEASE.json")
    data_path = Path(args.data).resolve() if args.data else rel_dir / meta["results_file"]
    raw = data_path.read_bytes()
    if not args.data and hashlib.sha256(raw).hexdigest() != meta["results_sha256"]:
        raise SystemExit("results.json does not match the checksum in RELEASE.json; the release files must not be edited")
    results = json.loads(raw.decode("utf-8-sig"))
    fmt, fmt_raw = (meta.get("supplements") or {}).get("gr_format"), None
    if fmt:   # answer-format details: read at build time only, not shipped (the site offers no downloads)
        fmt_raw = (rel_dir / fmt["json_file"]).read_bytes()
        if hashlib.sha256(fmt_raw).hexdigest() != fmt["json_sha256"]:
            raise SystemExit(f"{fmt['json_file']} does not match the checksum in RELEASE.json; the release files must not be edited")
    if results.get("release_id") != release and not args.data:
        raise SystemExit("results release id does not match the requested release")
    return {
        "cfg": cfg,
        "release": meta,
        "results": results,
        "results_bytes": raw,
        "fixture": bool(args.data or args.idea_endpoint or args.idea_closed),
        "idea_override": ({"enabled": True, "endpoint": args.idea_endpoint, "timeout_ms": args.idea_timeout} if args.idea_endpoint
                          else {"enabled": False, "endpoint": None, "preview": False} if args.idea_closed else None),
        "copy": read_json(SITE / "content" / "copy.json"),
        "methods": read_json(SITE / "content" / "methods.json"),
        "extra": read_json(SITE / "content" / "ui_extra.json"),
        "gr_format": json.loads(fmt_raw.decode("utf-8-sig")) if fmt else None,
    }


# --------------------------------------------------------------------------- numbers


def round_text(v: float, places: int) -> str:
    """Same result as JavaScript Number.prototype.toFixed: exact binary value, ties away from zero."""
    q = Decimal(1).scaleb(-places)
    d = Decimal(v).quantize(q, rounding=ROUND_HALF_UP)
    s = format(d, "f")
    return "0." + "0" * places if d == 0 else s


def fmt_num(v, places=1, signed=False, percent_scale=False) -> str:
    """Display text for a saved value. Nonzero values that would round to zero keep their direction."""
    if v is None:
        return ""
    if abs(v) < 1e-9:   # floating-point residue of an exact zero (e.g. 4.4e-16) is zero, not "<0.1"
        v = 0.0
    if percent_scale:
        v = v * 100
    s = round_text(abs(v), places)
    step = "0." + "0" * (places - 1) + "1"
    if v != 0 and float(s) == 0:
        body = "<" + step
        return ("+" if v > 0 else MINUS) + body if (signed or v < 0) else body
    if float(s) == 0:
        return s
    if v < 0:
        return MINUS + s
    return ("+" + s) if signed else s


def is_small(v, places=1, percent_scale=False) -> bool:
    if v is None or abs(v) < 1e-9:
        return False
    if percent_scale:
        v = v * 100
    return float(round_text(abs(v), places)) == 0


def pos(v, dom) -> float:
    lo, hi = dom
    v = min(hi, max(lo, v))
    return round((v - lo) / (hi - lo) * 100, 4)


def fill(template: str, **kw) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: str(kw[m.group(1)]) if m.group(1) in kw else m.group(0), template)


def share_text(part: int, whole: int) -> str:
    """Share of answers as display text: one decimal place, a trailing .0 dropped (29, 41.4, 3.6, 100)."""
    s = format((Decimal(100 * part) / Decimal(whole)).quantize(Decimal("0.1"), ROUND_HALF_UP), "f")
    return s[:-2] if s.endswith(".0") else s


# --------------------------------------------------------------------------- markdown with math


MATH = re.compile(r"(\\\[.*?\\\]|\\\(.*?\\\))", re.S)
EXTERNAL = re.compile(r'<a href="(https?://[^"]+)">')
# a URL written out in running text (e.g. a DOI in a reference list); not one inside a tag or already a link's text
BARE_URL = re.compile(r"""(?<![="'>/\w])https?://(?:[^\s<>"'()（）]|\([^\s<>"'()]*\))+""")


def link_bare_urls(out: str) -> str:
    def one(m):
        url = m.group(0).rstrip(".,;:，。；：")
        return f'<a href="{url}">{url}</a>{m.group(0)[len(url):]}'
    return BARE_URL.sub(one, out)


EXAMPLE = re.compile(r'<p><strong>(Examples?\.|Example, [A-Z]\d\.|例子。|以[A-Z]\d为例。)</strong>(.*?)</p>'
                     r'(\s*<div class="math-display">.*?</div>(?:\s*<p>(?:(?!<strong>).)*?</p>)?)?', re.S)


EXAMPLE_LEAD = re.compile(r'<p><strong>(Examples?\.|Example, [A-Z]\d\.|例子。|以[A-Z]\d为例。)</strong>')


def example_blocks(out: str, to_end: bool = False) -> str:
    """Worked examples ("Example." / "例子。" paragraphs) become a highlighted block. An example that ends with a
    colon runs on into the formula below it and the sentence after that, so those join the block too.
    In a measure section the worked example is the last part (`to_end`): the block then holds everything from
    its first paragraph to the end, so a multi-part example (table, formulas, several paragraphs) stays one group."""
    if to_end:
        m = EXAMPLE_LEAD.search(out)
        if not m:
            return out
        body = out[m.start():].replace("<strong>", '<strong class="m-example-label">', 1).rstrip()
        return out[:m.start()] + f'<div class="m-example">{body}</div>\n'

    def one(m):
        label, rest, tail = m.group(1), m.group(2), m.group(3) or ""
        lead = f'<p><strong class="m-example-label">{label}</strong>{rest}</p>'
        if re.sub(r"<[^>]+>", "", rest).rstrip().endswith((":", "：")):
            return f'<div class="m-example">{lead}{tail}</div>'
        return f'<div class="m-example">{lead}</div>{tail}'
    return EXAMPLE.sub(one, out)


def md_html(text: str, lang: str, external_label: str, sub_level: int = 4, example_to_end: bool = False) -> str:
    """Markdown to HTML, keeping LaTeX for KaTeX, marking stand-alone bold lines as subheadings (at the given
    heading level), marking paragraphs that open with a bold lead-in ("Task 1: …") and highlighting worked examples."""
    stash = []

    def keep(m):
        stash.append(m.group(1))
        return f"\u0000M{len(stash) - 1}\u0000"
    protected = MATH.sub(keep, text)
    out = markdown.markdown(protected, extensions=["tables", "sane_lists"], output_format="html")
    if lang == "zh":
        # a line break or space between Chinese sentences in the source (e.g. after a bold lead-in "**第一层：…。** 按照")
        # would show as a gap: Chinese text meets without one (formulas are stashed away, so they are untouched)
        cjk = "\u3000-\u303f\u4e00-\u9fff\uff00-\uffef\u2018\u2019\u201c\u201d"
        out = re.sub(rf"([{cjk}])((?:</(?:strong|em|b|a)>)?)[ \n]+(?=(?:<(?:strong|em|b)>)?[{cjk}])", r"\1\2", out)
        # and after full-width punctuation nothing follows a space, not even a code or a formula ("**例子。** BF07")
        out = re.sub(r"([。，、；：！？）」』”])((?:</(?:strong|em|b|a)>)?)[ \n]+(?=\S)", r"\1\2", out)

    def restore(m):
        tex = stash[int(m.group(1))]
        cls = "math-display" if tex.startswith("\\[") else "math-inline"
        tag = "div" if cls == "math-display" else "span"
        return f'<{tag} class="{cls}">{html.escape(tex, quote=False)}</{tag}>'
    out = re.sub(r"\u0000M(\d+)\u0000", restore, out)
    out = re.sub(r"<p>(<div class=\"math-display\">.*?</div>)</p>", r"\1", out, flags=re.S)
    # a stand-alone bold line is a subheading, unless it is a sentence (ends with a full stop): that stays emphasis
    out = re.sub(r"<p><strong>([^<]{1,119}[^<.。])</strong></p>", rf'<h{sub_level} class="md-sub">\1</h{sub_level}>', out)
    out = example_blocks(out, example_to_end)
    # a paragraph opening with a bold lead-in starts a new step (a task, how it is scored, how results combine)
    out = out.replace("<p><strong>", '<p class="m-lead"><strong>')
    out = link_bare_urls(out)
    out = EXTERNAL.sub(lambda m: f'<a href="{m.group(1)}" target="_blank" rel="noopener noreferrer" '
                                 f'data-external="{html.escape(external_label)}">', out)
    return label_tables(out)


WIDE_CHAR = re.compile(r"[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]")


def text_em(fragment: str) -> float:
    """Rough rendered width of a cell's text in em: CJK and full-width characters count 1, others 0.55; tags and
    TeX markup are dropped (the typeset symbol is about one character wide)."""
    t = re.sub(r"<[^>]+>", "", fragment)
    t = re.sub(r"\\[()\[\]]", "", t)
    t = re.sub(r"\\[A-Za-z]+", "", t)
    t = re.sub(r"[{}_^]", "", t).strip()
    return sum(1.0 if WIDE_CHAR.match(ch) else 0.55 for ch in t)


NUMBER = re.compile(r"^[−+\-]?[\d.,]+%?$")


def mark_number_columns(table: str) -> str:
    """Right-aligned columns that hold only numbers (e.g. the low/middle/high condition values) get class "num", so
    they take only the width they need and every such table keeps the same shape whatever its text columns hold."""
    heads = re.findall(r"<th(\s[^>]*)?>(.*?)</th>", table, re.S)
    rows = [re.findall(r"<td(?:\s[^>]*)?>(.*?)</td>", r, re.S) for r in re.findall(r"<tr>(.*?)</tr>", table, re.S)]
    rows = [r for r in rows if r]
    cols = set()
    for i, (attrs, _) in enumerate(heads):
        vals = [re.sub(r"<[^>]+>", "", r[i]).strip() for r in rows if i < len(r)]
        if "right" in (attrs or "") and vals and all(NUMBER.match(v) for v in vals):
            cols.add(i)
    if not cols:
        return table

    def row(rm):
        index = iter(range(1000))

        def cell(cm):
            return f'<{cm.group(1)}{cm.group(2) or ""} class="num">' if next(index) in cols else cm.group(0)
        return re.sub(r"<(t[hd])(\s[^>]*)?>", cell, rm.group(0))
    return re.sub(r"<tr>.*?</tr>", row, table, flags=re.S)


def label_tables(fragment: str) -> str:
    """Prepare tables for narrow screens, where rows become stacked cards. Each cell repeats its column heading
    in a .cell-label span (shown only on phones); it is a real element, not a CSS attr(), so headings with
    math ("Position \\(r\\)", "\\(w_j\\)") are typeset by KaTeX. A table that already fits a phone stays a table
    ("compact"): two columns keyed by short values (the 0-4 rubric ratings), or a small grid such as a game's
    payoff matrix, whose meaning depends on reading it as rows and columns (at most four columns, every cell
    short, and the widest cells of all columns together within a 320 px screen)."""
    def one(m):
        table = mark_number_columns(m.group(0))
        heads = [h.strip() for h in re.findall(r"<th(?:\s[^>]*)?>(.*?)</th>", table, re.S)]  # not <thead>
        keys = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<tr>\s*<td(?:\s[^>]*)?>(.*?)</td>", table, re.S)]
        rows = [re.findall(r"<td(?:\s[^>]*)?>(.*?)</td>", r, re.S) for r in re.findall(r"<tr>(.*?)</tr>", table, re.S)]
        rows = [r for r in rows if r]
        widest = [max((text_em(r[i]) for r in rows if i < len(r)), default=0.0) for i in range(len(heads))]
        small_grid = (len(heads) <= 4 and rows and max(widest) <= 10 and sum(widest) <= 16
                      and max(text_em(h) for h in heads) <= 18)
        if len(heads) == 2 and keys and all(len(k) <= 3 for k in keys):
            return '<div class="table-wrap">' + table.replace("<table>", '<table class="compact">', 1) + "</div>"
        if small_grid:
            return '<div class="table-wrap">' + table.replace("<table>", '<table class="compact grid">', 1) + "</div>"

        def row(rm):
            cells = iter(heads)
            return re.sub(r"<td(\s[^>]*)?>", lambda cm: f'<td{cm.group(1) or ""}><span class="cell-label">{next(cells, "")}</span>',
                          rm.group(0))
        table = re.sub(r"<tr>.*?</tr>", row, table, flags=re.S)
        return '<div class="table-wrap">' + table.replace("<table>", '<table class="stack">', 1) + "</div>"
    return re.sub(r"<table>.*?</table>", one, fragment, flags=re.S)


# --------------------------------------------------------------------------- view model


class Site:
    def __init__(self, inputs):
        self.cfg = inputs["cfg"]
        self.release = inputs["release"]
        self.results = inputs["results"]
        self.results_bytes = inputs["results_bytes"]
        self.fixture = inputs["fixture"]
        self.copy = inputs["copy"]
        self.methods = inputs["methods"]
        self.extra = inputs["extra"]
        self.gr_format = inputs.get("gr_format") or {}          # answer-format details; totals still come from results.json
        self.ideas_cfg = {**(self.cfg.get("idea_collection") or {}), **(inputs.get("idea_override") or {})}
        mc = self.copy["measures"]
        self.measure_copy = {m["id"]: m for m in mc["measures"]}
        self.measure_ids = [m["id"] for m in mc["measures"]]
        self.groups = mc["groups"]
        self.model_ids = list(self.results["model_order"])
        self.models = {k: self.results["models"][k] for k in self.model_ids}
        self.items = {k: {it["item"]: it for it in m.get("items", [])} for k, m in self.models.items()}
        cfg = self.copy["explore"]["config"]
        self.pairs = [p for p in cfg["version_pairs"] if p["old_model"] in self.models and p["new_model"] in self.models]
        self.diff_units = cfg["difference_units"]
        self.bindings = cfg["deployment_note_bindings"]
        self.changes = {}
        for g in self.results.get("generation_changes", []):
            self.changes.setdefault(g["pair"], {})[g["item"]] = g

    # ------------------------------------------------------------------ strings
    def strings(self, lang):
        pages = self.copy["pages"]
        return {
            "common": self.copy["measures"]["common"][lang],
            "home": self.copy["home"][lang],
            "explore": self.copy["explore"][lang],
            "robustness": pages["robustness"][lang],
            "about": pages["about"][lang],
            "ratings": pages["ratings"][lang],
            "materials": pages["materials"][lang],
            "versions": pages["versions"][lang],
            "gr_conditions": pages["gr_conditions"][lang],
            "gr_format": pages.get("gr_format", {}).get(lang, {}),
            "ideas": pages.get("ideas", {}).get(lang, {}),
            "extra": self.extra[lang],
            "groups": {g["id"]: g[lang] for g in self.groups},
        }

    def font_gaps(self):
        """Chinese characters in the page text that the subset fonts (static/fonts/charset.txt) do not cover."""
        cover = SITE / "static" / "fonts" / "charset.txt"
        have = set(cover.read_text(encoding="utf-8")) if cover.is_file() else set()
        text = json.dumps([self.copy, self.methods, self.extra], ensure_ascii=False)
        return sorted({c for c in text if ord(c) >= 0x2E80} - have)

    # ------------------------------------------------------------------ measures
    def axis(self, mid):
        m = self.measure_copy[mid]
        a = m["axis"]
        dom = (a["min"], a["max"])
        signed = dom[0] < 0
        vals = [-100, -50, 0, 50, 100] if signed else [0, 25, 50, 75, 100]
        pct = m["unit"] == "percent"
        ticks = []
        for v in vals:
            label = (("+" if v > 0 else "") + str(v).replace("-", MINUS)) if signed else str(v)
            ticks.append({"pos": pos(v, dom), "label": label + ("%" if pct else ""),
                          "minor": (abs(v) == 50) if signed else v in (25, 75)})
        return {"dom": dom, "signed": signed, "ref": a.get("reference"), "ref_pos": pos(a["reference"], dom) if a.get("reference") is not None else None,
                "ticks": ticks, "poles": (a.get("low_code"), a.get("high_code")) if a.get("low_code") else None,
                "percent": pct}

    def type_info(self, model_id, mid):
        t = self.models[model_id].get("self_described_type") or {}
        for p in t.get("pairs", []):
            if p["task_id"] == mid:
                return p
        return None

    def notes_for(self, model_id, mid, lang):
        S = self.copy["explore"][lang]
        out = []
        for target, key in self.bindings.get(model_id, {}).items():
            if target == "profile":
                continue
            if target == mid or (len(target) == 1 and mid.startswith(target)):
                out.append(S[key])
        return out

    def row(self, model_id, mid, lang, ax):
        S = self.strings(lang)
        C = S["common"]
        it = self.items[model_id].get(mid)
        m = self.models[model_id]
        mcopy = self.measure_copy[mid][lang]
        sep, stop = ("", "。") if lang == "zh" else (" ", ".")   # Chinese sentences join without a space
        base = {"model": model_id, "name": m["name"], "provider": m.get("provider", ""), "notes": self.notes_for(model_id, mid, lang),
                "missing": False, "center": None, "center_text": "", "unit_suffix": "", "inner": None, "outer": None,
                "outer_missing": True, "inner_text": "", "outer_text": "", "c": None, "il": None, "iw": None, "ol": None, "ow": None,
                "inner_zero": False, "outer_zero": False, "small": [], "type_letter": None, "type_boundary": False, "type_basis": None}
        if not it or it.get("center") is None or not it.get("reference_range"):
            return {**base, "missing": True,
                    "sr": f"{m['name']}. {mcopy['title']}. {C['unavailable']}."}
        c, inner, outer = it["center"], it["reference_range"], it.get("validation_expanded_range")
        signed, dom = ax["signed"], ax["dom"]
        f = lambda v: fmt_num(v, 1, signed)
        row = {**base, "missing": False, "center": c, "center_text": f(c), "unit_suffix": "%" if ax["percent"] else "",
               "inner": inner, "outer": outer, "outer_missing": outer is None,
               "inner_text": fill(C["range_template"], low=f(inner[0]), high=f(inner[1])),
               "outer_text": fill(C["range_template"], low=f(outer[0]), high=f(outer[1])) if outer else C["outer_unavailable"],
               "c": pos(c, dom), "il": pos(inner[0], dom), "iw": round(pos(inner[1], dom) - pos(inner[0], dom), 4),
               "inner_zero": abs(inner[1] - inner[0]) < 1e-12,
               "small": [v for v in (c, inner[0], inner[1], *(outer or [])) if is_small(v)]}
        if outer:
            row.update(ol=pos(outer[0], dom), ow=round(pos(outer[1], dom) - pos(outer[0], dom), 4),
                       outer_zero=abs(outer[1] - outer[0]) < 1e-12)
        scale = fill(S["extra"]["chart_scale"], label=mcopy["axis_label"],
                     min=ax["ticks"][0]["label"], max=ax["ticks"][-1]["label"])
        sr = fill(C["chart_text"], model=m["name"], measure=mcopy["title"], center=row["center_text"] + row["unit_suffix"],
                  inner_min=f(inner[0]), inner_max=f(inner[1]),
                  outer_min=f(outer[0]) if outer else "—", outer_max=f(outer[1]) if outer else "—", scale=scale)
        if not outer:
            sr += sep + C["outer_unavailable"] + stop
        tinfo = self.type_info(model_id, mid) if ax["poles"] else None
        if tinfo:
            row["type_letter"] = tinfo["letter"]
            row["type_boundary"] = bool(tinfo.get("range_reaches_midpoint"))
            row["type_basis"] = tinfo.get("range_basis")
            sr += sep + fill(S["extra"]["type_letter"], letter=tinfo["letter"]) + stop
            if row["type_boundary"]:
                sr += sep + S["extra"]["reaches_midpoint"] + stop
        row["sr"] = sr
        return row

    def mini_svg(self, rows, ax):
        n = max(1, len(rows))
        w, h, pad = 124, 48, 5
        lh = (h - 2 * pad) / n
        out = [f'<svg class="mini" viewBox="0 0 {w} {h}" width="{w}" height="{h}" aria-hidden="true" focusable="false" data-y0="{pad}" data-lh="{lh:.4f}">',
               f'<rect class="mini-bg" x="0" y="0" width="{w}" height="{h}" rx="5"/>']
        for g in (0, 50, 100) if not ax["signed"] else (-100, 0, 100):
            x = pad + pos(g, ax["dom"]) / 100 * (w - 2 * pad)
            out.append(f'<rect class="mini-grid" x="{x - .5:.2f}" y="3" width="1" height="{h - 6}"/>')
        X = lambda v: pad + pos(v, ax["dom"]) / 100 * (w - 2 * pad)
        x_zero = X(0) if ax["dom"][0] <= 0 <= ax["dom"][1] else None

        def span(lo, hi, least=0.8):
            """Pixel span of a nonzero range, at least `least` wide so it stays as visible as a zero-width marker;
            the extra width grows away from a zero end (never across 0) and stays inside the plot."""
            x0, x1 = X(lo), X(hi)
            if x1 - x0 < least:
                if x_zero is not None and abs(x1 - x_zero) < 1e-9:
                    x0 = x1 - least
                elif x_zero is not None and abs(x0 - x_zero) < 1e-9:
                    x1 = x0 + least
                else:
                    mid = (x0 + x1) / 2
                    x0, x1 = mid - least / 2, mid + least / 2
                shift = max(0, pad - x0) - max(0, x1 - (w - pad))
                x0, x1 = x0 + shift, x1 + shift
            return x0, x1 - x0

        for i, r in enumerate(rows):
            y = pad + i * lh
            parts = [f'<rect class="mini-hl" x="1" y="{-.6:.2f}" width="{w - 2}" height="{lh + 1.2:.2f}" rx="1.5"/>']
            if not r["missing"]:
                if r.get("outer"):
                    if r.get("outer_zero"):
                        parts.append(f'<rect class="mini-o is-zero" x="{X(r["outer"][0]) - .4:.4f}" y="{lh / 2 - 1:.2f}" width="0.8" height="2"/>')
                    else:
                        ox, ow = span(*r["outer"])
                        parts.append(f'<rect class="mini-o" x="{ox:.4f}" y="{lh / 2 - .5:.2f}" width="{ow:.4f}" height="1"/>')
                iw = X(r["inner"][1]) - X(r["inner"][0])
                if r.get("inner_zero"):
                    parts.append(f'<rect class="mini-i is-zero" x="{X(r["inner"][0]) - .4:.4f}" y="{lh * .2:.2f}" width="0.8" height="{lh * .6:.2f}"/>')
                else:
                    ix, iw_drawn = span(*r["inner"])
                    parts.append(f'<rect class="mini-i" x="{ix:.4f}" y="{lh * .2:.2f}" width="{iw_drawn:.4f}" height="{lh * .6:.2f}" rx="{min(lh * .3, iw_drawn / 2):.2f}"/>')
                if iw >= 3:
                    parts.append(f'<rect class="mini-c" x="{X(r["center"]) - .6:.2f}" y="{lh * .2:.2f}" width="1.2" height="{lh * .6:.2f}"/>')
            out.append(f'<g class="mini-line" data-model="{r["model"]}" data-i="{i}" transform="translate(0 {y:.2f})">{"".join(parts)}</g>')
        out.append("</svg>")
        return Markup("".join(out))

    def measures(self, lang):
        S = self.strings(lang)
        out = []
        for mid in self.measure_ids:
            mc = self.measure_copy[mid]
            ax = self.axis(mid)
            rows = [self.row(k, mid, lang, ax) for k in self.model_ids]
            notes = []
            for r in rows:
                for n in r["notes"]:
                    notes.append(f"{r['name']}{'：' if lang == 'zh' else ': '}{n}")
            boundary = [r for r in rows if r.get("type_boundary")]
            out.append({
                "id": mid, "cat": mid[0], "unit": mc["unit"], "kind": mc["evidence_kind"], "ax": ax,
                "text": mc[lang], "rows": rows, "mini": self.mini_svg(rows, ax),
                "notes": notes, "boundary": bool(boundary),
                "type_tie": any(r.get("type_letter") == "X" for r in rows),
                "type_inner_only": any(r.get("type_basis") == "inner_range" for r in rows),
                "available": sum(1 for r in rows if not r["missing"]),
            })
        return out

    def group_list(self, lang, measures):
        by_cat = {}
        for m in measures:
            by_cat.setdefault(m["cat"], []).append(m)
        out = []
        for g in self.groups:
            gl = g[lang]
            ms = by_cat.get(g["id"], [])
            blocks = None
            if g["id"] == "E" and gl.get("first_block"):
                blocks = [{"title": gl["first_block"], "measures": [m for m in ms if m["id"] in ("E1", "E2", "E3", "E4", "E5")]},
                          {"title": gl["second_block"], "measures": [m for m in ms if m["id"] in ("E6", "E7", "E8", "E9")]}]
            out.append({"id": g["id"], "title": gl["title"], "description": gl["description"], "measures": ms, "blocks": blocks,
                        "super": "decision" if g["id"] in "ABCD" else "personality"})
        return out

    # ------------------------------------------------------------------ robustness
    GR_KEYS = {"open_ended": [str(i) for i in range(11)], "binary": ["selfish", "equal"]}
    GR_BRANCHES = ("open_ended", "binary")
    GR_EXAMPLE = ("luna56", "BI-ORD")   # worked example on the page; its fixed sentence is checked against the data

    @classmethod
    def gr_complete(cls, entry, branch):
        """A condition counts only with its full answer tally: every valid answer key, whole counts, summing to n."""
        dist, n = (entry or {}).get("distribution"), (entry or {}).get("n")
        if not isinstance(dist, dict) or not isinstance(n, int) or set(dist) != set(cls.GR_KEYS[branch]):
            return False
        return all(isinstance(v, int) and v >= 0 for v in dist.values()) and sum(dist.values()) == n

    def gr_check(self, c, ref, S):
        """One comparison: matching / different / missing, the before-and-after reading, and its saved change with CI."""
        R, E, C = S["robustness"], S["extra"], S["common"]
        branch = c["branch"]
        if not ref or not self.gr_complete(c, branch) or not self.gr_complete(ref, branch):
            state = "missing"
        elif c["n"] == ref["n"] and c["distribution"] == ref["distribution"]:
            state = "same"          # every answer appeared the same number of times as in the original question
        else:
            state = "different"
        chk = {"id": c["condition_id"], "label": S["gr_conditions"].get(c["condition_id"], c["condition_id"]), "branch": branch,
               "secondary": c.get("evidence_class") == "secondary", "state": state, "answer_keys": self.GR_KEYS[branch],
               "dist": c.get("distribution") or {}, "ref_dist": (ref or {}).get("distribution") or {}, "share": None}
        sides = []
        if branch == "open_ended":
            chk["metrics"] = [
                self.gr_metric(R["mean_shift"], c.get("delta_mean_dollars"), c.get("delta_mean_ci_95"), (-10, 10), True, R["dollars"], False),
                self.gr_metric(R["distribution_shift"], c.get("wasserstein_1_dollars"), c.get("wasserstein_1_ci_95"), (0, 10), False, R["dollars"], False)]
            chk["help"] = [R["mean_help"], R["distribution_help"]]
            for e in (ref, c):
                m = (e or {}).get("mean_dollars")
                sides.append({"text": fill(E["gr_avg_amount"], amount=fmt_num(m, 2)) if m is not None else C["unavailable"],
                              "bar": pos(m, (0, 10)) if m is not None else None})
        else:
            chk["metrics"] = [self.gr_metric(R["probability_shift"], c.get("delta_p"), c.get("delta_p_ci_95"), (-100, 100), True, R["percentage_points"], True)]
            chk["help"] = [R["probability_help"]]
            for e in (ref, c):
                if self.gr_complete(e, branch):
                    sides.append({"text": fill(E["gr_even_split"], equal=e["distribution"]["equal"], n=e["n"]),
                                  "equal": e["distribution"]["equal"], "n": e["n"]})
                else:
                    sides.append({"text": C["unavailable"], "equal": None, "n": None})
            pe = [(e or {}).get("p_equal") for e in (ref, c)]
            if None not in pe:
                chk["share"] = fill(E["gr_share_equal"], before=fmt_num(pe[0], 2, percent_scale=True) + "%",
                                    after=fmt_num(pe[1], 2, percent_scale=True) + "%")
        chk["before"], chk["after"] = sides
        return chk

    def gr_page(self, lang):
        """Robustness page: eight-model summary, per-model changed checks, one shared record of format and settings."""
        S = self.strings(lang)
        R, E, V = S["robustness"], S["extra"], S["versions"]
        titles = {"open_ended": E["gr_branch_open"], "binary": E["gr_branch_binary"]}
        sep = "，" if lang == "zh" else " · "
        models, records, sizes = [], [], {b: set() for b in self.GR_BRANCHES}
        for k in self.model_ids:
            m = self.models[k]
            gr = m.get("general_robustness")
            row = {"id": k, "name": m["name"], "provider": m.get("provider", ""), "branches": [], "unavailable": not gr}
            if not gr:
                models.append(row)
                continue
            refs = {r["condition_id"]: r for r in gr.get("references", [])}
            for b in self.GR_BRANCHES:
                checks = [self.gr_check(c, refs.get(c.get("reference_condition_id")), S) for c in gr.get("comparisons", []) if c["branch"] == b]
                n = {st: sum(1 for ch in checks if ch["state"] == st) for st in ("same", "different", "missing")}
                if not n["different"] and not n["missing"]:
                    cell = fill(E["gr_cell_same"], same=n["same"])
                elif not n["same"] and not n["missing"]:
                    cell = fill(E["gr_cell_diff"], different=n["different"])
                elif not n["missing"]:
                    cell = fill(E["gr_cell_mixed"], same=n["same"], different=n["different"])
                else:
                    parts = ([fill(E["gr_cell_same"], same=n["same"])] if n["same"] else []) + \
                            ([fill(E["gr_cell_diff"], different=n["different"])] if n["different"] else [])
                    cell = sep.join(parts + [fill(E["gr_cell_missing"], missing=n["missing"])])
                sizes[b].add(len(checks))
                row["branches"].append({"id": b, "title": titles[b], "checks": checks, "cell": cell, "states": [ch["state"] for ch in checks],
                                        "changed": [ch for ch in checks if ch["state"] == "different"],
                                        "matching": [ch for ch in checks if ch["state"] == "same"],
                                        "incomplete": [ch for ch in checks if ch["state"] == "missing"], **n})
            tot = {st: sum(br[st] for br in row["branches"]) for st in ("same", "different", "missing")}
            total = sum(len(br["checks"]) for br in row["branches"])
            row.update(tot, total=total, all_same=total > 0 and tot["same"] == total,
                       all_same_text=fill(E["gr_all_same"], total=total), other_same_text=fill(E["gr_other_same"], same=tot["same"]),
                       diff_heading=fill(E["gr_diff_heading"], different=tot["different"]),
                       missing_heading=fill(E["gr_missing_heading"], missing=tot["missing"]))
            models.append(row)
            cov = gr.get("coverage", [])
            fs = gr.get("format_summary")
            st = gr.get("recorded_settings", {})
            model_desc = st.get("model")
            transport = st.get("transport")
            if not transport and "ordinary target API" in (m.get("deployment_note") or ""):
                transport = "ordinary"   # historical Luna and DeepSeek: GR record omits the field; deployment note and Methods R01 say ordinary requests
            start, end = (gr.get("run_started_at") or "")[:10], (gr.get("run_last_record_at") or "")[:10]
            records.append({
                "id": k, "name": m["name"],
                "format": f"{fs['strictly_compliant']} / {fs['denominator']}" if fs else None,
                "format_sr": fill(R["format_count"], compliant=fs["strictly_compliant"], total=fs["denominator"]) if fs else R["format_unavailable"],
                "valid": sum(c.get("valid", 0) for c in cov), "scheduled": sum(c.get("scheduled", 0) for c in cov),
                "per_version": {c.get("scheduled") for c in cov}, "versions": len(cov),
                "complete": bool(cov) and all(c.get("valid") == c.get("scheduled") for c in cov) and gr.get("status") == "complete",
                "model_id": st.get("model_id") or (model_desc.get("model") if isinstance(model_desc, dict) else model_desc),
                "reasoning": V["high"] if st.get("reasoning_effort") == "high" else st.get("reasoning_effort"),
                "max_output": f"{st['max_output_tokens']:,}" if st.get("max_output_tokens") else None,   # 16,384, as on Methods
                "transport": E.get(f"transport_{transport}", transport) if transport else None,
                "dates": start + (f" – {end}" if end and end != start else ""),
            })
        uniform = (records and all(r["complete"] for r in records) and len({(r["scheduled"], r["versions"]) for r in records}) == 1
                   and all(len(r["per_version"]) == 1 for r in records) and len({next(iter(r["per_version"])) for r in records}) == 1)
        coverage_text = fill(E["gr_coverage_all"], scheduled=records[0]["scheduled"], versions=records[0]["versions"],
                             n=next(iter(records[0]["per_version"]))) if uniform else None
        for r in records:
            r["coverage"] = f"{r['valid']} / {r['scheduled']}"
        heads = [{"id": b, "title": titles[b], "count": fill(E["gr_checks_count"], count=next(iter(sizes[b]))) if len(sizes[b]) == 1 else None}
                 for b in self.GR_BRANCHES]
        return {"models": models, "records": records, "coverage_text": coverage_text, "heads": heads,
                "example": self.gr_example(models, lang, E)}

    # the two literal replies: their title, explanation and (for the excerpt) translation keys in pages.gr_format
    FORMAT_EXAMPLES = {"formatting-marks": ("marks_title", "marks_explanation", None),
                       "added-explanation": ("explanation_title", "explanation_explanation", "explanation_excerpt_translation")}
    FORMAT_COUNTS = ("denominator", "strictly_compliant", "not_strictly_compliant", "outcome_valid")

    def gr_format_view(self, lang):
        """Answer-format section: each model's total from results.json (the supplement must agree), its two question
        types and the two literal replies from the supplement. A model without data shows the unavailable text, never zero."""
        S = self.strings(lang)
        F, R = S["gr_format"], S["robustness"]
        if not F:
            return None
        detail = self.gr_format.get("models", {})
        kinds = {"open_ended": (F["amount_title"], F["amount_help"]), "binary": (F["choice_title"], F["choice_help"])}
        rows, totals = [], set()
        for k in self.model_ids:
            m = self.models[k]
            fs = (m.get("general_robustness") or {}).get("format_summary")
            d = detail.get(k)
            row = {"id": k, "name": m["name"], "provider": m.get("provider", ""), "unavailable": not fs, "branches": None,
                   "text": R["format_unavailable"]}
            if fs:
                if d and any(d["summary"][f] != fs[f] for f in self.FORMAT_COUNTS):
                    raise SystemExit(f"answer-format details for {k} disagree with results.json")
                n, t = fs["strictly_compliant"], fs["denominator"]
                totals.add(t)
                pct = share_text(n, t)
                row.update(compliant=n, total=t, width=round(100 * n / t, 2), count=fill(F["count"], compliant=n, total=t, percent=pct),
                           sr=fill(F["row_accessible"], model=m["name"], compliant=n, total=t, percent=pct))
                if d:
                    row["branches"] = [{"id": x["branch"], "title": kinds[x["branch"]][0], "help": kinds[x["branch"]][1],
                                        "compliant": x["strictly_compliant"], "total": x["denominator"],
                                        "width": round(100 * x["strictly_compliant"] / x["denominator"], 2),
                                        "count": fill(F["count"], compliant=x["strictly_compliant"], total=x["denominator"],
                                                      percent=share_text(x["strictly_compliant"], x["denominator"]))}
                                       for x in d["branches"]]
            rows.append(row)
        if len(totals) > 1:
            raise SystemExit("answer-format totals differ between models; the section intro names one total")
        examples = []
        for e in self.gr_format.get("examples", []):
            keys = self.FORMAT_EXAMPLES.get(e["example_id"])
            if not keys or e["model_key"] not in self.models:
                continue
            title, expl, tr = keys
            examples.append({"id": e["example_id"], "title": F[title], "explanation": F[expl], "lang": e["language"],
                             "model": self.models[e["model_key"]]["name"],
                             "condition": S["gr_conditions"].get(e["condition_id"], e["condition_id"]),
                             "instruction": e["requested_reply_literal"], "reply": e["reply_literal"],
                             "reply_label": F["original_excerpt"] if e["is_excerpt"] else F["original_reply"],
                             "translation": F[tr] if tr and lang != e["language"] else None})
        return {"rows": rows, "examples": examples, "intro": fill(F["intro"], total=next(iter(totals))) if totals else None,
                "details": bool(detail)}

    # ------------------------------------------------------------------ ratings page: visitor ideas
    IDEA_LIMITS = {"scenario": 3000, "focus": 500}   # Unicode characters after trimming, as in static/site.js and receiver/ideas_schema.sql

    def ideas_view(self, lang):
        """live: enabled with an https endpoint or a same-site path such as /api/ideas (the Pages Function in
        functions/api/ideas.js; plain http only for a local mock); preview: the form with submitting switched
        off; closed: only the not-open notice. Nothing is sent unless the build is live."""
        I = self.strings(lang)["ideas"]
        if not I:
            return None
        c = self.ideas_cfg
        ep = c.get("endpoint")
        live = bool(c.get("enabled")) and isinstance(ep, str) and re.match(r"https://|http://(127\.0\.0\.1|localhost)[:/]|/(?!/)", ep) is not None
        mode = "live" if live else ("preview" if c.get("preview") else "closed")
        keys = ("counter", "submit", "submitting", "empty_scenario", "scenario_limit", "focus_limit", "failed", "leave_warning")
        return {"mode": mode, "endpoint": ep if live else None, "revision": c.get("copy_revision", ""),
                "timeout": int(c.get("timeout_ms") or 15000), "limits": self.IDEA_LIMITS,
                "text": json.dumps({k: I[k] for k in keys}, ensure_ascii=False).replace("</", "<\\/")}   # safe inside <script>

    def gr_example(self, models, lang, E):
        """The worked example (original vs reversed order) comes from the saved counts; stop the build if the sentence drifts."""
        mid, cid = self.GR_EXAMPLE
        row = next((m for m in models if m["id"] == mid and not m["unavailable"]), None)
        chk = next((c for b in (row or {}).get("branches", []) for c in b["checks"] if c["id"] == cid), None)
        if not chk or chk["state"] == "missing":
            return None
        b, a = chk["before"], chk["after"]
        text = E["gr_example_result"]
        if lang == "en":
            ok = f"{b['equal']} of {b['n']}" in text and f"{a['equal']} of {a['n']}" in text
        else:
            ok = b["equal"] == b["n"] and f"{b['n']} 次回答都" in text and f"{a['n']} 次中有 {a['equal']} 次" in text
        assert ok, "worked GR example no longer matches the saved counts"
        return {"model": row["name"], "check": chk}

    def gr_metric(self, label, value, ci, dom, signed, unit, scale100):
        v_text = fmt_num(value, 2, signed, percent_scale=scale100) if value is not None else "—"
        lo_t = fmt_num(ci[0], 2, signed, percent_scale=scale100) if ci else "—"
        hi_t = fmt_num(ci[1], 2, signed, percent_scale=scale100) if ci else "—"
        k = 100 if scale100 else 1
        return {"label": label, "unit": unit, "value": value, "value_text": v_text, "low_text": lo_t, "high_text": hi_t,
                "ci": ci, "small": is_small(value, 2, scale100),
                "exact": fmt_num(value, 4, signed, percent_scale=scale100) if value is not None else "",
                "p": pos(value * k, dom) if value is not None else None,
                "cl": pos(ci[0] * k, dom) if ci else None, "cw": round(pos(ci[1] * k, dom) - pos(ci[0] * k, dom), 4) if ci else None,
                "zero": pos(0, dom), "dom": dom}

    # ------------------------------------------------------------------ methods
    def methods_view(self, lang):
        """Methods page from content/methods.json: study sections, categories (shared method, measures with rubrics,
        check schedules), General Robustness and the version, material and reference records, each with its stable page ID."""
        M = self.methods[lang]
        ext = self.extra[lang]["external_link"]

        def sec(x, sub_level, example_to_end=False):
            html_ = md_html(x["body"], lang, ext, sub_level, example_to_end)
            if x["id"] == "references" and lang != "en":
                html_ = html_.replace("<ul>", '<ul lang="en">', 1)     # the entries stay in English on the Chinese page
            # worked examples get their own anchors ("A1-example", then "-2" …) so a link can land on the example itself
            count = iter(range(1, 100))

            def example_id(_m):
                n = next(count)
                return f'<div class="m-example" id="{x["id"]}-example{"" if n == 1 else "-" + str(n)}">'
            html_ = re.sub(r'<div class="m-example">', example_id, html_)
            return {"id": x["id"], "code": x["code"], "title": x["title"], "html": Markup(html_)}
        return {
            "title": M["title"], "intro": M["intro"],
            "study": [sec(x, 3) for x in M["study"]],
            "categories": [{**sec(c, 3), "shared": sec(c["shared"], 4),
                            # a measure ends with its worked example, which may run over several blocks
                            "measures": [{**sec(m, 4, example_to_end=True), "rubric": sec(m["rubric"], 5) if m["rubric"] else None}
                                         for m in c["measures"]],
                            "schedules": [sec(t, 5) for t in c["schedules"]]} for c in M["categories"]],
            "gr": {**sec(M["gr"], 3), "parts": [sec(x, 4) for x in M["gr"]["parts"]]},
            "records": [sec(x, 3) for x in M["records"]],
        }

    # ------------------------------------------------------------------ explore payload
    def explore_payload(self, lang, measures):
        S = self.strings(lang)
        return {
            "lang": lang,
            "release": self.results.get("release_id"),
            "data": f"../../data/{self.results.get('release_id')}/results.json",
            "measures": [{"id": m["id"], "cat": m["cat"], "unit": m["unit"], "kind": m["kind"],
                          "dom": list(m["ax"]["dom"]), "signed": m["ax"]["signed"], "ref": m["ax"]["ref"],
                          "ticks": m["ax"]["ticks"], "poles": m["ax"]["poles"], "percent": m["ax"]["percent"],
                          "copy": m["text"]} for m in measures],
            "groups": [{"id": g["id"], **g[lang]} for g in self.groups],
            "pairs": self.pairs, "diff_units": self.diff_units, "bindings": self.bindings,
            "S": {k: S[k] for k in ("common", "explore", "extra", "versions")},
        }


# --------------------------------------------------------------------------- rendering


def url_for(site_depth: int, lang: str, page: str, query: str = "", anchor: str = "") -> str:
    return "../" * site_depth + f"{lang}/" + PAGE_PATH[page] + (("?" + query) if query else "") + (("#" + anchor) if anchor else "")


def public_base(cfg, fixture: bool):
    """The public address with a trailing slash, or None. Without one (and always for a local fixture build) the pages
    get no canonical links or share tags and no sitemap is written."""
    base = (cfg.get("public_base_url") or "").strip()
    if not base or fixture:
        return None
    if not base.startswith("https://"):
        raise SystemExit(f"public_base_url must be an https address: {base}")
    return base.rstrip("/") + "/"


def page_address(pub: str, lang: str, page: str) -> str:
    return f"{pub}{lang}/{PAGE_PATH[page]}"


def language_alternates(pub: str, page: str, fallback: str) -> list:
    """hreflang links for one page: each language, and x-default (the language chooser at the root for the home page,
    the fallback language for the others)."""
    alts = [{"hreflang": HTML_LANG[l], "href": page_address(pub, l, page)} for l in LANGS]
    return alts + [{"hreflang": "x-default", "href": pub if page == "home" else page_address(pub, fallback, page)}]


def public_meta(pub: str, lang: str, page: str, cfg, S) -> dict:
    """Canonical address, language alternates and the share picture for one page (templates/base.html.j2)."""
    return {"canonical": page_address(pub, lang, page), "alternates": language_alternates(pub, page, cfg["fallback_language"]),
            "image": f"{pub}assets/{SHARE_IMAGE[lang]}", "image_alt": f"{cfg['brand']} · {S['home']['slogan']}",
            "width": SHARE_SIZE[0], "height": SHARE_SIZE[1], "locale": OG_LOCALE[lang],
            "locale_alt": [OG_LOCALE[l] for l in LANGS if l != lang]}


def write_search_files(out: Path, pub: str, fallback: str) -> list:
    """sitemap.xml (every page in both languages, each with its language versions) and robots.txt. No dates, so the
    same inputs build the same files."""
    entries = []
    for page in PAGES:
        links = "".join(f'\n    <xhtml:link rel="alternate" hreflang="{a["hreflang"]}" href="{a["href"]}"/>'
                        for a in language_alternates(pub, page, fallback))
        entries += [f"  <url>\n    <loc>{page_address(pub, lang, page)}</loc>{links}\n  </url>" for lang in LANGS]
    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
               'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(entries) + "\n</urlset>\n")
    (out / "sitemap.xml").write_text(sitemap, encoding="utf-8")
    (out / "robots.txt").write_text(f"User-agent: *\nDisallow: /api/\n\nSitemap: {pub}sitemap.xml\n", encoding="utf-8")
    return [out / "sitemap.xml", out / "robots.txt"]


def render_all(site: Site, out: Path):
    env = Environment(loader=FileSystemLoader(SITE / "templates"), autoescape=select_autoescape(["html", "j2"]),
                      undefined=StrictUndefined, trim_blocks=True, lstrip_blocks=True)
    env.filters["fill"] = lambda s, **kw: fill(s, **kw)
    env.filters["story"] = lambda s: Markup(markdown.markdown(s, extensions=["sane_lists"], output_format="html"))   # About essay: paragraphs, list, pull quotes
    env.filters["tojson_script"] = lambda o: Markup(json.dumps(o, ensure_ascii=False).replace("</", "<\\/"))
    cfg = site.cfg
    pub = public_base(cfg, site.fixture)
    written = []
    for lang in LANGS:
        S = site.strings(lang)
        measures = site.measures(lang)
        groups = site.group_list(lang, measures)
        for page in PAGES:
            depth = 1 if page == "home" else 2
            ctx = {
                "lang": lang, "html_lang": HTML_LANG[lang], "page": page, "depth": depth, "S": S, "cfg": cfg,
                "colon": "：" if lang == "zh" else ": ",
                "base": "../" * depth, "release": site.release, "results": site.results, "fixture": site.fixture,
                "url": lambda p, q="", a="", _d=depth, _l=lang: url_for(_d, _l, p, q, a),
                "nav": [{"key": p, "label": S["common"][NAV_KEY[p]], "href": url_for(depth, lang, p), "current": p == page} for p in NAV_ORDER],
                "langs": [{"code": l, "name": AUTONYM[l], "html_lang": HTML_LANG[l], "href": url_for(depth, l, page), "current": l == lang} for l in LANGS],
                "models": [{"id": k, **{f: site.models[k].get(f) for f in ("name", "provider", "model_id", "reasoning_effort")}} for k in site.model_ids],
                "measures": measures, "groups": groups,
                "public": public_meta(pub, lang, page, cfg, S) if pub else None,
            }
            if page == "home":
                demo = site.copy["home"]["demo"]
                dax = dict(site.axis(demo["item"]))
                dax["dom"] = tuple(demo["zoom"])
                ctx["demo"] = {"row": site.row(demo["model"], demo["item"], lang, dax), "zoom": demo["zoom"],
                               "ticks": [{"pos": pos(v, demo["zoom"]), "label": str(v)} for v in range(demo["zoom"][0], demo["zoom"][1] + 1, 5)]}
                d = ctx["demo"]["row"]
                assert d["center_text"] in S["home"]["demo_explanation"], "demo text no longer matches the saved value"
                span = {"en": "{} to {}", "zh": "{} 到 {}"}[lang].format(*demo["zoom"])
                assert span in S["home"]["demo_intro"], "demo intro no longer names the zoomed span"
            if page == "explore":
                ctx["payload"] = site.explore_payload(lang, measures)
            if page == "ratings":
                ctx["ideas"] = site.ideas_view(lang)
            if page == "robustness":
                ctx["gr"] = site.gr_page(lang)
                ctx["fmt"] = site.gr_format_view(lang)
            if page == "methods":
                ctx["mv"] = site.methods_view(lang)
                ctx["katex"] = cfg["katex"]
            tpl = env.get_template(f"{page}.html.j2")
            path = out / lang / PAGE_PATH[page] / "index.html"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(tpl.render(**ctx), encoding="utf-8")
            written.append(path)
    slogans = " · ".join(site.strings(l)["home"]["slogan"] for l in LANGS)
    root_public = {"canonical": pub, "alternates": language_alternates(pub, "home", cfg["fallback_language"]),
                   "image": f"{pub}assets/{SHARE_IMAGE['root']}", "image_alt": f"{cfg['brand']} · {slogans}",
                   "width": SHARE_SIZE[0], "height": SHARE_SIZE[1]} if pub else None
    root = env.get_template("root.html.j2").render(cfg=cfg, langs=[{"code": l, "name": AUTONYM[l], "html_lang": HTML_LANG[l]} for l in LANGS],
                                                  S={l: site.strings(l) for l in LANGS}, public=root_public)
    (out / "index.html").write_text(root, encoding="utf-8")
    (out / "404.html").write_text(env.get_template("404.html.j2").render(cfg=cfg, S={l: site.strings(l) for l in LANGS}, langs=LANGS), encoding="utf-8")
    written += [out / "index.html", out / "404.html"]
    return written


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=DEFAULT_OUT, help="output folder outside OneDrive")
    ap.add_argument("--release", default=None, help="release id under data/releases (default: config.json)")
    ap.add_argument("--data", default=None, help="test fixture results file (local checks only)")
    ap.add_argument("--idea-endpoint", default=None, help="local mock receiver for the idea form (checks only; marks the build as a fixture)")
    ap.add_argument("--idea-timeout", type=int, default=15000, help="idea form request timeout in ms (checks only)")
    ap.add_argument("--idea-closed", action="store_true", help="build the idea form in its closed state (checks only; marks the build as a fixture)")
    args = ap.parse_args()
    out = output_dir(args.out)
    inputs = load_inputs(args)
    site = Site(inputs)
    before = {p for p in out.rglob("*") if p.is_file()} if out.exists() else set()
    out.mkdir(parents=True, exist_ok=True)
    # On Cloudflare Pages (CF_PAGES is set) the output folder is published as it is: write only the site there,
    # not the local bookkeeping files (the safe-to-clear marker and the build report)
    hosted = bool(os.environ.get("CF_PAGES"))
    extras = set() if hosted else {out / DIST_MARKER, out / "build-report.json"}
    if not hosted:
        (out / DIST_MARKER).write_text("Generated by build.py; safe to delete and rebuild.\n", encoding="utf-8")
    written = render_all(site, out)
    shutil.copytree(SITE / "static", out / "assets", dirs_exist_ok=True)
    data_dir = out / "data" / site.results.get("release_id", "fixture")
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / "results.json").write_bytes(site.results_bytes)
    report = {"release": site.results.get("release_id"), "fixture": site.fixture, "pages": len(written),
              "models": len(site.model_ids), "measures": len(site.measure_ids)}   # no local paths: this file ships with the pages
    if not hosted:
        (out / "build-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    # security headers for Cloudflare Pages (other hosts ignore the file): no framing by other sites, no MIME sniffing
    (out / "_headers").write_text(HEADERS, encoding="utf-8")
    pub = public_base(site.cfg, site.fixture)
    search = write_search_files(out, pub, site.cfg["fallback_language"]) if pub else []
    missing = site.font_gaps()
    if missing:
        print(f"note: {len(missing)} Chinese characters are not in the site's fonts and fall back to a system font: "
              f"{''.join(missing)} (run tools/subset_fonts.py)")
    now = {p for p in out.rglob("*") if p.is_file()}
    produced = set(written) | extras | set(search) | {data_dir / "results.json", out / "_headers"} | {
        out / "assets" / p.relative_to(SITE / "static") for p in (SITE / "static").rglob("*") if p.is_file()}
    for stale in sorted((before | now) - produced):     # files from an earlier build that this build no longer makes
        try:
            stale.unlink()
        except OSError:
            print("could not remove stale file:", stale)
    print(f"built {len(written)} pages for {len(site.model_ids)} models × {len(site.measure_ids)} measures -> {out}")
    if site.fixture:
        print("NOTE: built from a local fixture, not the release data")


if __name__ == "__main__":
    main()
