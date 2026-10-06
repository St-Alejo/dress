"""
El worker y la API leen los mismos fixtures y la misma tabla de errores:
si alguno de los dos lados se desvía del contrato, este test falla.
"""

import json
import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from src.contract import ERROR_STATUS, RETRYABLE, Manifest

ROOT = Path(__file__).resolve().parents[3]
CONTRACT = ROOT / "contracts" / "ai-worker" / "v1"
TS_CONTRACT = ROOT / "packages" / "shared-types" / "src" / "worker-contract.ts"


def fixtures(kind: str) -> list[Path]:
    return sorted((CONTRACT / "fixtures" / kind).glob("*.json"))


@pytest.mark.parametrize("path", fixtures("valid"), ids=lambda p: p.stem)
def test_valid_fixtures_parse(path: Path):
    Manifest.model_validate(json.loads(path.read_text(encoding="utf-8")))


@pytest.mark.parametrize("path", fixtures("invalid"), ids=lambda p: p.stem)
def test_invalid_fixtures_are_rejected(path: Path):
    with pytest.raises(ValidationError):
        Manifest.model_validate(json.loads(path.read_text(encoding="utf-8")))


def test_error_codes_match_json_schema():
    schema = json.loads((CONTRACT / "errors.schema.json").read_text(encoding="utf-8"))
    assert set(schema["properties"]["code"]["enum"]) == set(ERROR_STATUS)


def test_status_table_matches_typescript():
    ts = TS_CONTRACT.read_text(encoding="utf-8")
    block = re.search(r"WORKER_ERROR_STATUS[^{]*\{(.*?)\};", ts, re.S)
    assert block, "no se encontró WORKER_ERROR_STATUS en worker-contract.ts"
    pairs = dict(re.findall(r"'?([a-z-]+)'?:\s*(\d+)", block.group(1)))
    assert {k: int(v) for k, v in pairs.items()} == ERROR_STATUS
    retry = re.search(r"RETRYABLE_WORKER_ERRORS[^\[]*\[(.*?)\]", ts, re.S)
    assert retry and set(re.findall(r"'([a-z-]+)'", retry.group(1))) == set(RETRYABLE)
