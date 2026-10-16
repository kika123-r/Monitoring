#!/usr/bin/env python3.13
"""Compare this month's (Oct 2026) collected prices against last month's
(Sept 2026) prices already present in the user's historical master xlsx
files, to sanity-check whether the automated collector is producing prices
in the right ballpark. Produces one workbook with one comparison sheet per
property, flagging any package whose price moved more than a threshold."""
import csv
import re
import unicodedata
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

SOURCES = {
    'byt-bratislava': '/root/.claude/uploads/e15c6bb8-3fcd-534f-ba00-dc4d9897ba8a/07df6f62-Poistenie_majetku_-_byt_Bratislava-3.xlsx',
    'byt-kosice': '/root/.claude/uploads/e15c6bb8-3fcd-534f-ba00-dc4d9897ba8a/9bb55416-Poistenie_majetku_-_byt_Kos_ice-3.xlsx',
    'dom-male-dvorniky': '/root/.claude/uploads/e15c6bb8-3fcd-534f-ba00-dc4d9897ba8a/537046a3-Poistenie_majetku_-_dom_Male__Dvorni_ky-3.xlsx',
    'dom-vlckovce': '/root/.claude/uploads/e15c6bb8-3fcd-534f-ba00-dc4d9897ba8a/455a69a6-Poistenie_majetku___dom_Vlc_kovce-3.xlsx',
}
PROFILE_LABELS = {
    'byt-bratislava': 'Byt Bratislava',
    'byt-kosice': 'Byt Košice',
    'dom-male-dvorniky': 'Dom Malé Dvorníky',
    'dom-vlckovce': 'Dom Vlčkovce',
}

# October balík label -> list of September label fragments that should match
# (after prefix-stripping/accent-insensitive normalization below, these are
# matched as "normalized October name == normalized September name" first,
# then by substring; Union and Generali need explicit overrides because the
# branding differs more than a simple prefix).
UNION_SEPT_MAP = {
    'Základné riziká': 'Základné riziká',
    'Komplet (všetky pripoistenia)': 'Základné riziká + Prírodné katastrofy + Živel + Škody z vody + Ľudská zlomyseľnosť + Skrat na spotrebičoch',
}
GENERALI_SYNONYMS = {'comfort': 'komfort', 'exclusive': 'exclusive', 'standard': 'standard'}


def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


def norm(s):
    s = strip_accents(s).lower().strip()
    s = re.sub(r'\s+', ' ', s)
    return s


def strip_prefix(sept_name):
    # "Môj Domov - Comfort" -> "Comfort"; "VIVA - Gold" -> "Gold"; etc.
    m = re.match(r'^.*? - (.+)$', sept_name)
    return m.group(1) if m else sept_name


def match_balik(insurer, oct_balik, sept_baliky):
    """Return the list of September balík label(s) matching this October balík."""
    if insurer == 'Union':
        target = UNION_SEPT_MAP.get(oct_balik)
        return [b for b in sept_baliky if b == target] if target else []
    n_oct = norm(oct_balik)
    if insurer == 'Generali':
        n_oct = GENERALI_SYNONYMS.get(n_oct, n_oct)
    matches = []
    for b in sept_baliky:
        n_sept = norm(strip_prefix(b))
        if insurer == 'Generali':
            n_sept = GENERALI_SYNONYMS.get(n_sept, n_sept)
        if n_sept == n_oct:
            matches.append(b)
    return matches


def load_sept(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=2, max_row=5000, values_only=True))
    rows = [r for r in rows if r[0] is not None]
    dates = sorted(set(r[0] for r in rows))
    last_date = dates[-1]
    sept_rows = [r for r in rows if r[0] == last_date]
    by_insurer = {}
    for r in sept_rows:
        insurer, balik, cena = r[15], r[16], r[18]
        if insurer is None or cena is None:
            continue
        by_insurer.setdefault(insurer, {}).setdefault(balik, []).append(cena)
    return last_date, by_insurer


def load_oct(profile_id):
    path = f'/home/user/Monitoring/data/results/{profile_id}.csv'
    with open(path, newline='', encoding='utf-8') as fh:
        rows = list(csv.reader(fh))
    out = []
    for r in rows[1:]:
        if r[0] != '2026-10-15':
            continue
        insurer, balik, cena_raw = r[15], r[16], r[18]
        if not cena_raw:
            continue
        cena = float(cena_raw.replace('\xa0', '').replace(' ', '').replace(',', '.').replace('€', '').strip())
        out.append((insurer, balik, cena))
    return out


INSURER_SEPT_NAME = {
    'Wüstenrot (W dobrom domov)': 'Wustenrot',
    'Kooperativa (Bezstarostný domov)': 'Kooperativa',
    'KOMUNÁLNA poisťovňa': 'KOMUNÁLNA poisťovňa',
    'ČSOB Poisťovňa': 'ČSOB',
}


def sept_insurer_name(oct_name):
    return INSURER_SEPT_NAME.get(oct_name, oct_name)


HEADER = ['Poisťovňa', 'Balík', 'Cena Sept 2026 (min–max)', 'Cena Okt 2026', 'Rozdiel (€)', 'Rozdiel (%)', 'Stav']
THRESHOLD_PCT = 15.0

GREEN = PatternFill('solid', fgColor='C6EFCE')
YELLOW = PatternFill('solid', fgColor='FFEB9C')
RED = PatternFill('solid', fgColor='FFC7CE')
GREY = PatternFill('solid', fgColor='E7E6E6')
BOLD = Font(bold=True)

wb_out = openpyxl.Workbook()
wb_out.remove(wb_out.active)

summary_rows = []

for profile_id, src_path in SOURCES.items():
    sept_date, sept_by_insurer = load_sept(src_path)
    oct_rows = load_oct(profile_id)

    ws = wb_out.create_sheet(PROFILE_LABELS[profile_id][:31])
    ws.append([f'Porovnanie cien — {PROFILE_LABELS[profile_id]}'])
    ws['A1'].font = Font(bold=True, size=13)
    ws.append([f'September {sept_date.strftime("%d.%m.%Y")} (posledný historický záznam) vs Október 2026 (tento zber)'])
    ws.append([])
    header_row = ws.max_row + 1
    ws.append(HEADER)
    for c in range(1, len(HEADER) + 1):
        ws.cell(row=header_row, column=c).font = BOLD
        ws.cell(row=header_row, column=c).fill = GREY

    for insurer, balik, cena_oct in oct_rows:
        sname = sept_insurer_name(insurer)
        sept_baliky = sept_by_insurer.get(sname, {})
        matched_labels = match_balik(sname, balik, list(sept_baliky.keys()))
        prices = []
        for lbl in matched_labels:
            prices.extend(sept_baliky[lbl])

        row = [insurer, balik]
        if prices:
            lo, hi = min(prices), max(prices)
            row.append(f'{lo:.2f} €' if lo == hi else f'{lo:.2f}–{hi:.2f} €')
            row.append(f'{cena_oct:.2f} €')
            ref = (lo + hi) / 2
            diff_abs = cena_oct - ref
            diff_pct = (diff_abs / ref) * 100 if ref else 0
            row.append(round(diff_abs, 2))
            row.append(round(diff_pct, 1))
            if cena_oct < lo * (1 - THRESHOLD_PCT / 100) or cena_oct > hi * (1 + THRESHOLD_PCT / 100):
                status = 'SKONTROLOVAŤ'
                fill = RED
            elif abs(diff_pct) > THRESHOLD_PCT / 2:
                status = 'mierny rozdiel'
                fill = YELLOW
            else:
                status = 'OK'
                fill = GREEN
            row.append(status)
            summary_rows.append((PROFILE_LABELS[profile_id], insurer, balik, round(diff_pct, 1), status))
        else:
            row += ['(nenájdené)', f'{cena_oct:.2f} €', '', '', 'NOVÉ / nedá sa porovnať']
            fill = GREY
        ws.append(row)
        r = ws.max_row
        for c in range(1, len(HEADER) + 1):
            ws.cell(row=r, column=c).fill = fill

    for i, w in enumerate([28, 30, 22, 16, 12, 12, 18], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = f'A{header_row + 1}'

# summary sheet first
ws_sum = wb_out.create_sheet('Zhrnutie', 0)
ws_sum.append(['Zhrnutie porovnania cien — Október 2026 vs September 2026'])
ws_sum['A1'].font = Font(bold=True, size=13)
ws_sum.append(['Zelená = cena v očakávanom rozsahu (do ±7.5 % od priemeru sept. hodnôt). '
               'Žltá = mierny rozdiel. Červená = odchýlka nad 15 % — treba skontrolovať.'])
ws_sum.append([])
hdr_r = ws_sum.max_row + 1
ws_sum.append(['Nehnuteľnosť', 'Poisťovňa', 'Balík', 'Rozdiel (%)', 'Stav'])
for c in range(1, 6):
    ws_sum.cell(row=hdr_r, column=c).font = BOLD
    ws_sum.cell(row=hdr_r, column=c).fill = GREY
n_ok = n_yellow = n_red = n_new = 0
for profile_label, insurer, balik, diff_pct, status in summary_rows:
    ws_sum.append([profile_label, insurer, balik, diff_pct, status])
    r = ws_sum.max_row
    fill = GREEN if status == 'OK' else YELLOW if status == 'mierny rozdiel' else RED
    for c in range(1, 6):
        ws_sum.cell(row=r, column=c).fill = fill
    if status == 'OK':
        n_ok += 1
    elif status == 'mierny rozdiel':
        n_yellow += 1
    else:
        n_red += 1
ws_sum.append([])
ws_sum.append(['Spolu v očakávanom rozsahu (OK):', n_ok])
ws_sum.append(['Mierny rozdiel:', n_yellow])
ws_sum.append(['Na skontrolovanie (SKONTROLOVAŤ):', n_red])
for i, w in enumerate([20, 30, 32, 12, 18], start=1):
    ws_sum.column_dimensions[get_column_letter(i)].width = w
ws_sum.freeze_panes = f'A{hdr_r + 1}'

out_path = '/home/user/Monitoring/data/comparison/Porovnanie_cien_Sept_vs_Okt_2026.xlsx'
wb_out.save(out_path)
print('Saved', out_path)
print(f'OK={n_ok} mierny={n_yellow} SKONTROLOVAT={n_red}')
