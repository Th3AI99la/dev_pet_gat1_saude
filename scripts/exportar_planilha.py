"""Exporta células e anotações da planilha original sem alterá-la."""

import argparse
from collections import defaultdict
from datetime import date, time, timedelta
from hashlib import sha256
from io import BytesIO
from pathlib import Path, PurePosixPath
import posixpath
from xml.etree import ElementTree as XML
from zipfile import ZipFile

from openpyxl import load_workbook
from openpyxl.utils.cell import coordinate_to_tuple, range_boundaries

from preparar_dados import ASSETS, WORKBOOK, save


MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def relationships(archive, part):
    path = PurePosixPath(part)
    rel_path = str(path.parent / "_rels" / (path.name + ".rels"))
    if rel_path not in archive.namelist():
        return {}
    root = XML.fromstring(archive.read(rel_path))
    return {rel.attrib["Id"]: rel.attrib for rel in root}


def relationship_path(part, target):
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(part), target))


def sheet_parts(archive):
    workbook = "xl/workbook.xml"
    links = relationships(archive, workbook)
    root = XML.fromstring(archive.read(workbook))
    return {
        element.attrib["name"]: relationship_path(workbook, links[element.attrib[REL_ID]]["Target"])
        for element in root.findall(f"{MAIN}sheets/{MAIN}sheet")
    }


def annotations(archive, part):
    relations = relationships(archive, part)
    notes = {}
    links = []
    for relation in relations.values():
        if not relation["Type"].endswith("/comments"):
            continue
        path = relationship_path(part, relation["Target"])
        root = XML.fromstring(archive.read(path))
        for note in root.findall(f"{MAIN}commentList/{MAIN}comment"):
            position = coordinate_to_tuple(note.attrib["ref"])
            notes[position] = "".join(run.text or "" for run in note.iter(f"{MAIN}t"))

    with archive.open(part) as stream:
        for _, element in XML.iterparse(stream):
            if element.tag == f"{MAIN}hyperlink":
                relation = relations.get(element.get(REL_ID))
                location = element.get("location")
                if relation:
                    target = relation["Target"] + (f"#{location}" if location else "")
                elif location:
                    target = f"#{location}"
                else:
                    target = element.get("display")
                if target:
                    links.append((range_boundaries(element.attrib["ref"]), target))
            element.clear()
    return notes, links


def json_value(value):
    if isinstance(value, (date, time)):
        return value.isoformat()
    if isinstance(value, timedelta):
        return str(value)
    return value


def collect_sheet(worksheet, notes, links):
    by_row = defaultdict(dict)
    for row in worksheet.iter_rows():
        for cell in row:
            if cell.value is None:
                continue
            record = {"column": cell.column, "value": None}
            if cell.data_type == "f":
                formula = cell.value
                record["formula"] = formula if isinstance(formula, str) else {**dict(formula), "text": getattr(formula, "text", None)}
            else:
                record["value"] = json_value(cell.value)
            by_row[cell.row][cell.column] = record

    value_count = sum(len(cells) for cells in by_row.values())
    for (row, column), note in notes.items():
        record = by_row[row].setdefault(column, {"column": column, "value": None})
        record["note"] = note

    for (first_col, first_row, last_col, last_row), url in links:
        for row, cells in by_row.items():
            if first_row <= row <= last_row:
                for column, record in cells.items():
                    if first_col <= column <= last_col:
                        record["link"] = url
        record = by_row[first_row].setdefault(first_col, {"column": first_col, "value": None})
        record["link"] = url

    return {
        "name": worksheet.title,
        "rowCount": max(by_row, default=0),
        "columnCount": max((max(cells) for cells in by_row.values()), default=0),
        "valueCount": value_count,
        "rows": [{"number": row, "cells": [cells[col] for col in sorted(cells)]} for row, cells in sorted(by_row.items())],
    }


def add_cached_values(source, sheets):
    formulas = {
        sheet["name"]: {
            (row["number"], cell["column"]): cell
            for row in sheet["rows"]
            for cell in row["cells"]
            if "formula" in cell
        }
        for sheet in sheets
    }
    if not any(formulas.values()):
        return
    workbook = load_workbook(BytesIO(source), read_only=True, data_only=True)
    try:
        for name, positions in formulas.items():
            if not positions:
                continue
            for row in workbook[name].iter_rows():
                for cell in row:
                    if cell.value is not None and (record := positions.get((cell.row, cell.column))):
                        record["value"] = json_value(cell.value)
    finally:
        workbook.close()


def export(path):
    source = path.read_bytes()
    workbook = load_workbook(BytesIO(source), read_only=True, data_only=False)
    try:
        with ZipFile(BytesIO(source)) as archive:
            parts = sheet_parts(archive)
            sheets = [collect_sheet(sheet, *annotations(archive, parts[sheet.title])) for sheet in workbook.worksheets]
    finally:
        workbook.close()
    add_cached_values(source, sheets)
    return {"workbookSha256": sha256(source).hexdigest(), "sheets": sheets}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--planilha", type=Path, default=WORKBOOK)
    args = parser.parse_args()
    output = export(args.planilha)
    save(ASSETS / "planilha.json", output)
    for sheet in output["sheets"]:
        print(f"{sheet['name']}: {sheet['valueCount']} células preenchidas, última linha {sheet['rowCount']}, {sheet['columnCount']} colunas")
    print(f"SHA-256 do XLSX: {output['workbookSha256']}")


if __name__ == "__main__":
    main()
