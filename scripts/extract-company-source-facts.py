"""Read source Excel workbooks without changing them; preserve missing CRM facts.

Usage: python scripts/extract-company-source-facts.py SOURCE_DIR OUTPUT_JSONL
Only files already listed in the enterprise DB snapshot are selected by the caller.
This script never connects to or writes to a database.
"""
import collections
import json
import pathlib
import re
import sys
import time
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
PREF = re.compile(r'^(北海道|東京都|京都府|大阪府|.{2,3}県)')


def text(value):
    return unicodedata.normalize('NFKC', str(value or '')).strip()


def cell_text(cell, shared):
    value = cell.find('m:v', NS)
    value = value.text if value is not None else ''.join(t.text or '' for t in cell.findall('.//m:t', NS))
    return shared[int(value)] if cell.get('t') == 's' and value else value or ''


def fields_for(headers):
    result = {}
    for col, raw in headers.items():
        h = re.sub(r'\s+', '', text(raw))
        field = None
        if h in ('企業名', '会社名', '商号'): field = 'company_name'
        elif re.match(r'代表者(?:現住所|自宅住所|住所詳細)', h): field = 'representative_address'
        elif h.startswith('代表者') and not re.search(r'住所|年齢|生年|誕生', h): field = 'representative'
        elif h.startswith('電話番号'): field = 'phone'
        elif h in ('住所', '住所ジュウショ', '所在地'): field = 'address'
        elif h == '都道府県': field = 'prefecture'
        elif h.lower() in ('tsrid', 'tsr企業コード'): field = 'tsr_id'
        elif h == '法人番号': field = 'corporate_number'
        if field and field not in result.values(): result[col] = field
    return result


def extract_file(path, output):
    started = time.monotonic()
    counts = collections.Counter()
    with zipfile.ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            for _, elem in ET.iterparse(archive.open('xl/sharedStrings.xml'), events=('end',)):
                if elem.tag.endswith('}si'):
                    shared.append(''.join(t.text or '' for t in elem.findall('.//m:t', NS)))
                    elem.clear()
        sheets = sorted(n for n in archive.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n))
        for sheet in sheets:
            fields = None
            for _, elem in ET.iterparse(archive.open(sheet), events=('end',)):
                if not elem.tag.endswith('}row'): continue
                if fields is None:
                    headers = {re.sub(r'\d+', '', c.get('r', '')): cell_text(c, shared) for c in elem.findall('m:c', NS)}
                    fields = fields_for(headers)
                    elem.clear()
                    if 'company_name' not in fields.values(): break
                    continue
                row = {}
                for c in elem.findall('m:c', NS):
                    col = re.sub(r'\d+', '', c.get('r', ''))
                    if col in fields: row[fields[col]] = cell_text(c, shared).strip()
                row_number = int(elem.get('r'))
                elem.clear()
                if not row.get('company_name'): continue
                counts['company_rows'] += 1
                home = row.get('representative_address', '')
                corp = row.get('corporate_number', '')
                if home: counts['home_nonempty'] += 1
                if PREF.match(text(home)): counts['home_with_prefecture'] += 1
                if corp: counts['corporate_nonempty'] += 1
                if not home and not corp: continue
                company_address = text(row.get('address'))
                pref = text(row.get('prefecture'))
                row['full_address'] = company_address if PREF.match(company_address) else pref + company_address
                phone = text(row.get('phone'))
                if phone.isdigit() and len(phone) in (9, 10) and not phone.startswith('0'): phone = '0' + phone
                row['phone'] = phone
                row.update(source_file=path.name, source_sheet=sheet, source_row=row_number)
                output.write(json.dumps(row, ensure_ascii=False) + '\n')
                counts['exported_rows'] += 1
    return dict(file=path.name, seconds=round(time.monotonic() - started, 1), **counts)


if __name__ == '__main__':
    source_dir, destination = map(pathlib.Path, sys.argv[1:3])
    allowed = set(json.loads(pathlib.Path(sys.argv[3]).read_text(encoding='utf-8-sig'))) if len(sys.argv) > 3 else None
    summaries = []
    with destination.open('w', encoding='utf-8') as output:
        for path in sorted(source_dir.glob('*.xlsx')):
            if allowed is not None and path.name not in allowed: continue
            summary = extract_file(path, output)
            summaries.append(summary)
            print(json.dumps(summary, ensure_ascii=True), flush=True)
    destination.with_suffix('.summary.json').write_text(json.dumps(summaries, ensure_ascii=False, indent=2), encoding='utf-8')
