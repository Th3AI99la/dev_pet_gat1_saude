"""Agrega a série anual CRU TS 4.09 à malha do estado de Goiás."""

import argparse
from hashlib import file_digest
import json
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
from urllib.request import urlopen

from netCDF4 import Dataset, num2date
import numpy as np
from pyproj import Transformer
from shapely import transform
from shapely.geometry import box, shape
from shapely.ops import unary_union


BASE = Path(__file__).resolve().parents[1]
BUCKET = "https://wbg-cckp.s3.amazonaws.com/data/cru-x0.5"
VERSION = "cru-ts4.09-historical"
METRICS = {"temperature": ("tas", "degC", "°C", "avg"), "rain": ("pr", "mm", "mm", "sum")}
YEARS = list(range(1901, 2025))
BASELINES = ((1961, 1990), (1991, 2020))
PROJECT = Transformer.from_crs(4326, 6933, always_xy=True).transform


def digest(path):
    with path.open("rb") as stream:
        return file_digest(stream, "sha256").hexdigest()


def aggregate(metric, cache, state):
    variable, expected_unit, label, method = METRICS[metric]
    name = f"timeseries-{variable}-annual-mean"
    url = f"{BUCKET}/{variable}/{VERSION}/{name}_cru-x0.5_{VERSION}_timeseries_mean_1901-2024.nc"
    file = cache / f"{variable}.nc"
    if not file.is_file():
        with TemporaryDirectory(dir=cache) as staging:
            pending = Path(staging) / file.name
            with urlopen(url, timeout=60) as response, pending.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            pending.replace(file)

    west, south, east, north = state.bounds
    with Dataset(file) as dataset:
        time = dataset["time"]
        years = [date.year for date in num2date(time[:], time.units, time.calendar)]
        values = dataset[name]
        if years != YEARS or values.units != expected_unit or values.annual_calculation != method:
            raise ValueError(f"Calendário, unidade ou cálculo anual inesperado em {file.name}")
        lat = dataset["lat_bnds"][:]
        lon = dataset["lon_bnds"][:]
        rows = np.flatnonzero((lat[:, 1] > south) & (lat[:, 0] < north))
        columns = np.flatnonzero((lon[:, 1] > west) & (lon[:, 0] < east))
        weights = np.zeros((len(rows), len(columns)))
        for i, row in enumerate(rows):
            for j, column in enumerate(columns):
                cell = box(lon[column, 0], lat[row, 0], lon[column, 1], lat[row, 1])
                weights[i, j] = transform(state.intersection(cell), PROJECT, interleaved=False).area
        samples = values[:, rows, columns]
        if not np.isclose(weights.sum(), transform(state, PROJECT, interleaved=False).area, rtol=0.001):
            raise ValueError("A grade não cobre a área da malha de Goiás.")
        included = weights > 0
        if np.ma.getmaskarray(samples)[:, included].any():
            raise ValueError(f"Células sem valor dentro de Goiás em {file.name}")
        statewide = np.average(np.asarray(samples)[:, included], axis=1, weights=weights[included])
        if not np.isfinite(statewide).all():
            raise ValueError(f"Valor anual inválido em {file.name}")
        result = {
            "unit": label,
            "annualCalculation": values.annual_calculation,
            "cells": int(included.sum()),
            "baselines": {
                f"{first}-{last}": round(float(np.mean(statewide[first - YEARS[0] : last - YEARS[0] + 1])), 4)
                for first, last in BASELINES
            },
            "values": np.round(statewide, 4).tolist(),
            "source": {"url": url, "bytes": file.stat().st_size, "sha256": digest(file)},
        }
    return metric, result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=BASE / "tmp/clima-goias")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    boundary = BASE / "fontes/originais/ibge-goias.geojson"
    features = json.loads(boundary.read_text(encoding="utf-8"))["features"]
    state = unary_union([shape(feature["geometry"]) for feature in features if feature["properties"]["codarea"] == "52"])
    if not state.is_valid or state.is_empty:
        raise ValueError("Malha de Goiás ausente ou inválida.")
    metrics = dict(aggregate(metric, args.cache, state) for metric in METRICS)
    data = {
        "collection": "CRU TS 4.09 · Climate Change Knowledge Portal",
        "citation": "University of East Anglia Climatic Research Unit; Harris, I. C.; Jones, P. D.; Osborn, T. (2025). CRU TS 4.09, 1901–2024. NERC EDS Centre for Environmental Data Analysis.",
        "catalogue": "https://catalogue.ceda.ac.uk/uuid/9cf07e92afaa405da4f40b6733f362d3",
        "distribution": "https://registry.opendata.aws/wbg-cckp/",
        "resolution": "0.5°",
        "areaProjection": "EPSG:6933",
        "boundarySha256": digest(boundary),
        "years": YEARS,
        "metrics": metrics,
    }
    output = BASE / "site/assets/clima-goias.json"
    with TemporaryDirectory(dir=output.parent) as staging:
        pending = Path(staging) / output.name
        pending.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        pending.replace(output)
    print(f"{len(YEARS)} anos · {metrics['temperature']['cells']} células · {output}")


if __name__ == "__main__":
    main()
