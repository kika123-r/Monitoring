#!/usr/bin/env python3.13
"""Build the visualization workbook: one sheet per poisťovňa, with one line
chart per property profile (4 charts/sheet), each chart showing every balík
as its own series over time. Reads the growing master ledgers
(data/master/<profile>.xlsx) and only plots rows from COLLECTION_START
onward — the automated daily collection era, where balík naming and row
shape are consistent day to day. The user's pre-existing historical rows
(pre-automation, different balík naming and multiple spoluúčasť variants per
date) stay out of these charts; they're covered by the separate
compare-months.py validation report instead."""
import datetime
import os
import re
from collections import defaultdict

import openpyxl
from openpyxl.chart import LineChart, Reference
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

MASTER_DIR = os.environ.get('MASTER_DIR', '/home/user/Monitoring/data/master')
OUT_PATH = os.environ.get('DASHBOARD_OUT', '/home/user/Monitoring/data/dashboard/Prehlad_cien_poistovne.xlsx')

COLLECTION_START = datetime.date.fromisoformat(os.environ.get('COLLECTION_START', '2026-10-15'))

PROFILES = {
    'Poistenie_majetku_-_byt_Bratislava.xlsx': 'Byt Bratislava',
    'Poistenie_majetku_-_byt_Kosice.xlsx': 'Byt Košice',
    'Poistenie_majetku_-_dom_Male_Dvorniky.xlsx': 'Dom Malé Dvorníky',
    'Poistenie_majetku_-_dom_Vlckovce.xlsx': 'Dom Vlčkovce',
}

GREY = PatternFill('solid', fgColor='E7E6E6')
BOLD = Font(bold=True)
TITLE = Font(bold=True, size=13)


def safe_sheet_name(name):
    name = re.sub(r'[\\/*?:\[\]]', '', name)
    return name[:31]


def load_data():
    # insurer -> profile_label -> balik -> {date: cena}
    data = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
    for fname, label in PROFILES.items():
        path = f'{MASTER_DIR}/{fname}'
        if not os.path.exists(path):
            continue
        wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb.active
        scan_to = min(ws.max_row, 20000)
        for row in ws.iter_rows(min_row=2, max_row=scan_to, values_only=True):
            dat, cena, insurer, balik = row[0], row[18], row[15], row[16]
            if dat is None or cena is None or insurer is None:
                continue
            if isinstance(dat, datetime.datetime):
                dat = dat.date()
            if dat < COLLECTION_START:
                continue
            data[insurer][label][balik][dat] = cena
    return data


def build():
    data = load_data()
    wb_out = openpyxl.Workbook()
    wb_out.remove(wb_out.active)

    for insurer in sorted(data):
        ws = wb_out.create_sheet(safe_sheet_name(insurer))
        ws['A1'] = insurer
        ws['A1'].font = TITLE
        row_cursor = 3

        for label in PROFILES.values():
            baliky_dict = data[insurer].get(label)
            ws.cell(row=row_cursor, column=1, value=label).font = Font(bold=True, size=12)
            table_top = row_cursor + 1

            if not baliky_dict:
                ws.cell(row=table_top, column=1, value='(žiadne dáta od spustenia denného zberu)')
                row_cursor = table_top + 3
                continue

            baliky = sorted(baliky_dict)
            all_dates = sorted({d for b in baliky for d in baliky_dict[b]})

            header_row = table_top
            ws.cell(row=header_row, column=1, value='Dátum').font = BOLD
            ws.cell(row=header_row, column=1).fill = GREY
            for j, b in enumerate(baliky, start=2):
                c = ws.cell(row=header_row, column=j, value=b)
                c.font = BOLD
                c.fill = GREY

            for i, d in enumerate(all_dates):
                r = header_row + 1 + i
                ws.cell(row=r, column=1, value=d).number_format = 'dd.mm.yyyy'
                for j, b in enumerate(baliky, start=2):
                    v = baliky_dict[b].get(d)
                    if v is not None:
                        ws.cell(row=r, column=j, value=v).number_format = '#,##0.00 "€"'

            last_row = header_row + len(all_dates)

            chart = LineChart()
            chart.title = label
            chart.style = 2
            chart.y_axis.title = 'Cena (€)'
            chart.x_axis.title = 'Dátum zberu'
            chart.x_axis.number_format = 'dd.mm'
            chart.width = 20
            chart.height = 9.5

            cats = Reference(ws, min_col=1, min_row=header_row + 1, max_row=last_row)
            for j, b in enumerate(baliky, start=2):
                data_ref = Reference(ws, min_col=j, min_row=header_row, max_row=last_row)
                chart.add_data(data_ref, titles_from_data=True)
            chart.set_categories(cats)

            anchor_col = get_column_letter(len(baliky) + 3)
            ws.add_chart(chart, f'{anchor_col}{table_top}')

            for j in range(1, len(baliky) + 2):
                ws.column_dimensions[get_column_letter(j)].width = 14

            row_cursor = last_row + 20  # leave room for the chart below the table block

        ws.freeze_panes = 'A4'

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    wb_out.save(OUT_PATH)
    print('Saved', OUT_PATH)
    print('Hárky (poisťovne):', ', '.join(sorted(data)))


if __name__ == '__main__':
    build()
