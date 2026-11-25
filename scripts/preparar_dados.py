"""Transforma a planilha recebida e a malha do IBGE em arquivos para o painel."""
import argparse
from collections import Counter, defaultdict
from hashlib import sha256
from itertools import chain
import json
from math import cos, isfinite, radians
from pathlib import Path
import re
import unicodedata
from urllib.request import urlopen

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "fontes" / "originais"
ASSETS = ROOT / "site" / "assets"
WORKBOOK = SOURCES / "mapeamento por região.xlsx"
START, END = 2017, 2026
MONTHS = "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro".split()
IBGE = "https://servicodados.ibge.gov.br/api/v3/malhas/estados/52?formato=application/vnd.geo+json&qualidade=minima"
NUMBER = r"(\d+(?:[.,]\d+)?)"
LOCATIONS = [
    ("goiania", "Goiânia", "Centro", "A002", "5208707"),
    ("luziania", "Luziânia", "Leste", "A012", "5212501"),
    ("posse", "Posse", "Nordeste", "A017", "5218300"),
    ("sao-miguel", "São Miguel do Araguaia", "Noroeste", "A031", "5220207"),
    ("catalao", "Catalão", "Sul", "A034", "5205109"),
    ("mineiros", "Mineiros", "Sul", "A026", "5213103"),
    ("rio-verde", "Rio Verde", "Sul", "A025", "5218805"),
]


def norm(value):
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    return "".join(c for c in text if not unicodedata.combining(c)).strip()


def text(value):
    return "" if value is None else str(value).strip()


def decimal(token):
    return float(token.replace(",", "."))


def save(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + ".tmp")
    pending.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    pending.replace(path)


MONTH_NUMBER = {norm(name): index for index, name in enumerate(MONTHS, 1)}
CITY_BY_LABEL = {norm(info[1]): info for info in LOCATIONS}
PATTERNS = {
    "rain": [
        rf"\bprecipitacao(?:\s+(?:acumulada|mensal|observada|registrada|total))*\s*(?:[:=]|de)?\s*{NUMBER}\s*mm\b",
        rf"\b{NUMBER}\s*mm\s+de\s+precipitacao\b",
        rf"\bestiagem mensal\s*\(\s*{NUMBER}\s*mm\s*\)",
    ],
    "humidity": [
        rf"\b(?:umidade(?:\s+relativa)?(?:\s+do\s+ar)?|ur)\s+media(?:\s+(?:mensal|observada|baixa))*\s*(?:[:=]|de|foi de|\()?\s*{NUMBER}\s*%",
    ],
}
COVERAGE = {"rain": r"precipitacao|prec", "humidity": r"umidade|rh|ur"}
BLOCKED = re.compile(
    r"^(?:dados insuficientes|sem dados (?:mensais|validos|representativos)|ausencia de dados|"
    r"mes sem dados|sem registros validos|falha de dados|dados muito incompletos)"
)


def quantities(event, description, reference, notes):
    """Lê medidas com unidade explícita, sem converter descrições em números."""
    first, second = norm(event), norm(description)
    all_text = " | ".join(map(norm, (event, description, reference, notes)))
    coverage_text = " ".join(re.findall(r"\bcobertura\b[^|;]*(?:;[^|]*)?", all_text))
    result = {}
    if BLOCKED.search(first) or "nao representam o mes" in second:
        return result, "Dados mensais insuficientes"
    partial = "cobertura parcial" in all_text
    for key, patterns in PATTERNS.items():
        rates = [decimal(n) for n in re.findall(rf"\b(?:{COVERAGE[key]})\s*:?\s*{NUMBER}\s*%", coverage_text)]
        shared = re.search(rf"\bcobertura\s+{NUMBER}\s*%", all_text)
        if (rates and min(rates) < 80) or (shared and decimal(shared[1]) < 80):
            partial = True
            continue
        matches = set()
        for block in (first, second):
            matches = {decimal(n) for pattern in patterns for n in re.findall(pattern, block)}
            if matches:
                break
        if len(matches) != 1:
            continue
        value = matches.pop()
        if value >= 0 and (key != "humidity" or value <= 100):
            result[key] = value
    return result, "Cobertura parcial informada" if partial else None


def city_for(label):
    label = re.sub(r"\s*(?:/\s*go|[–—-]\s*go|\(\s*go\s*\))\s*$", "", norm(label))
    return CITY_BY_LABEL.get(label)


def year_month(y, m):
    month = MONTH_NUMBER.get(norm(m))
    if type(y) not in (int, float) or not isfinite(y) or int(y) != y or not START <= y <= END or not month:
        return None
    return f"{int(y):04d}-{month:02d}"


def recurring(workbook):
    """Mantém as sínteses das oito abas como transcrição identificada."""
    mapping = {
        "sao miguel": "sao-miguel", "catalao": "catalao", "posse": "posse", "mineiros": "mineiros",
        "luziania": "luziania", "rio verde": "rio-verde", "goiania": "goiania", "seca": "goias",
    }
    output = defaultdict(dict)
    for sheet in workbook.worksheets[1:]:
        key = mapping.get(norm(sheet.title.split("-", 1)[-1]))
        if not key:
            continue
        for month, pattern, years, note in sheet.iter_rows(min_row=2, max_row=30, max_col=4, values_only=True):
            number = MONTH_NUMBER.get(norm(month))
            if number and pattern:
                output[key][number] = {"label": text(pattern), "years": text(years), "note": text(note), "sheet": sheet.title.strip()}
    return output


def read_workbook(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook.worksheets[0]
        headings = next(sheet.iter_rows(min_row=1, max_row=1, max_col=11, values_only=True))
        assert [norm(headings[i]) for i in (2, 3, 4, 6)] == ["mes", "ano", "evento climatico", "municipio"], "Cabeçalhos da aba global mudaram."
        meteo, fires, drought = (defaultdict(list) for _ in range(3))
        audit = Counter()
        conflicts = []
        for index, row in enumerate(sheet.iter_rows(min_row=2, max_col=11, values_only=True), 2):
            station, region, month, year, event, description, place, reference, fire, state_fire, notes = row
            period = year_month(year, month)
            if not period or not event:
                continue
            audit["source_rows"] += 1
            kind = norm(event)
            city = city_for(place)
            record = {"row": index, "event": text(event), "detail": text(description), "source": text(reference) or text(station), "note": text(notes)}
            if kind == "seca (monitor de secas)":
                movement = re.match(r"Movimento:\s*(.+?)\.\s*Classes mencionadas:", text(description), re.I)
                record["movement"] = movement[1] if movement else text(event)
                key = norm(record["movement"])
                record["category"] = next((cat for term, cat in [("misto", "mixed"), ("recuo", "retreat"), ("avanco", "advance"), ("estabilidade", "stable"), ("estavel", "stable")] if key.startswith(term)), "other")
                drought[period].append(record)
                audit["drought_rows"] += 1
                continue
            if kind == "queimadas":
                audit["fire_rows"] += 1
                if not city:
                    audit["fire_unidentified"] += 1
                    continue
                record["value"] = fire if type(fire) in (int, float) and isfinite(fire) and fire >= 0 else None
                record["original"] = text(fire)
                fires[(city[0], period)].append(record)
                continue
            if not city:
                audit["other_unidentified"] += 1
                continue
            audit["weather_rows"] += 1
            codes = set(re.findall(r"\bA\d{3}\b", f"{station} {reference}", re.I))
            expected = city[3]
            if codes and {c.upper() for c in codes} != {expected}:
                conflict = {"row": index, "municipality": city[1], "period": period, "codes": sorted(codes), "expected": expected}
                conflicts.append(conflict)
                record["values"] = {}
                record["status"] = "Código de estação divergente"
            else:
                record["values"], record["status"] = quantities(event, description, reference, notes)
            meteo[(city[0], period)].append(record)

        city_data = {key: {"name": name, "region": region, "station": station, "ibge": code, "months": {}} for key, name, region, station, code in LOCATIONS}
        for key, period in sorted(meteo.keys() | fires.keys()):
            choices = meteo[(key, period)]
            weather = None
            if len(choices) == 1:
                weather = choices[0]
            elif choices:
                # Preserva os números das linhas no XLSX e no relatório de auditoria.
                weather = {"rows": [r["row"] for r in choices], "values": {}, "status": "Registros duplicados para o mês"}
                audit["duplicate_weather_months"] += 1
            fire_choices = fires[(key, period)]
            fire = fire_choices[0] if len(fire_choices) == 1 else None
            if len(fire_choices) > 1:
                fire = {"rows": [r["row"] for r in fire_choices], "value": None, "status": "Registros duplicados para o mês"}
                audit["duplicate_fire_months"] += 1
            city_data[key]["months"][period] = {"weather": weather, "fire": fire}

        drought_months = {}
        for period, records in sorted(drought.items()):
            if len(records) == 1:
                drought_months[period] = records[0]
            else:
                drought_months[period] = {"rows": [r["row"] for r in records], "status": "Registros duplicados para o mês"}
                audit["duplicate_drought_months"] += 1
        for item in city_data.values():
            for month in item["months"].values():
                weather = month["weather"] or {}
                for metric in weather.get("values", {}):
                    audit[metric + "_values"] += 1
                fire = month["fire"] or {}
                if fire.get("value") is not None:
                    audit["fire_values"] += 1
        audit["station_conflicts"] = len(conflicts)
        return {
            "start": START, "end": END, "sheet": sheet.title.strip(), "municipalities": city_data,
            "drought": drought_months, "recurring": recurring(workbook), "audit": dict(audit),
        }, conflicts
    finally:
        workbook.close()


def rings(geometry):
    coordinates = geometry["coordinates"]
    return coordinates if geometry["type"] == "Polygon" else list(chain.from_iterable(coordinates))


def centroid(ring):
    pairs = list(zip(ring, ring[1:] + ring[:1]))
    moments = [a[0] * b[1] - b[0] * a[1] for a, b in pairs]
    area = sum(moments)
    if not area:
        return ring[0]
    return [sum((a[i] + b[i]) * m for (a, b), m in zip(pairs, moments)) / (3 * area) for i in (0, 1)]


def geometry(download):
    paths = {"state": (SOURCES / "ibge-goias.geojson", IBGE), "cities": (SOURCES / "ibge-municipios-goias.geojson", IBGE + "&intrarregiao=municipio")}
    payload = {}
    for key, (path, url) in paths.items():
        if download or not path.is_file():
            with urlopen(url, timeout=25) as response:
                content = response.read()
            data = json.loads(content)
            assert data["type"] == "FeatureCollection" and len(data["features"]) == (1 if key == "state" else 246)
            path.write_bytes(content)
        payload[key] = json.loads(path.read_bytes())
    features = payload["cities"]["features"]
    main = rings(payload["state"]["features"][0]["geometry"])
    all_points = list(chain.from_iterable(main))
    west, east = min(p[0] for p in all_points), max(p[0] for p in all_points)
    south, north = min(p[1] for p in all_points), max(p[1] for p in all_points)
    lon_factor = cos(radians((north + south) / 2))
    width, height = 600, 475
    scale = min((width - 130) / ((east - west) * lon_factor), (height - 54) / (north - south))
    x_offset = (width - (east - west) * lon_factor * scale) / 2
    y_offset = (height - (north - south) * scale) / 2

    def project(coordinate):
        x, y = coordinate
        return (round(x_offset + (x - west) * lon_factor * scale, 1), round(y_offset + (north - y) * scale, 1))

    def svg_path(land):
        return "".join("M" + "L".join(f"{x:g},{y:g}" for x, y in map(project, ring)) + "Z" for ring in land)

    indices = {f["properties"]["codarea"]: f["geometry"] for f in features}
    return {
        "width": width, "height": height, "state": svg_path(main),
        "mesh": "".join(svg_path(rings(f["geometry"])) for f in features),
        "municipalities": {key: {"position": project(centroid(max(rings(indices[code]), key=len))), "path": svg_path(rings(indices[code]))} for key, _, _, _, code in LOCATIONS},
        "source": IBGE, "municipalSource": paths["cities"][1],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--planilha", type=Path, default=WORKBOOK)
    parser.add_argument("--baixar-mapa", action="store_true", help="Atualiza a malha cartográfica a partir da API do IBGE.")
    args = parser.parse_args()
    data, conflicts = read_workbook(args.planilha)
    SOURCES.mkdir(parents=True, exist_ok=True)
    map_data = geometry(args.baixar_mapa)
    data["workbookSha256"] = sha256(args.planilha.read_bytes()).hexdigest()
    save(ASSETS / "dados.json", data)
    save(ASSETS / "mapa.json", map_data)
    save(ROOT / "fontes" / "auditoria.json", {**data["audit"], "workbookSha256": data["workbookSha256"], "stationConflicts": conflicts})
    print(json.dumps(data["audit"], indent=2))


if __name__ == "__main__":
    main()
