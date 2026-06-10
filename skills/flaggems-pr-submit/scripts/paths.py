#!/usr/bin/env python3
"""Shared paths for the FlagGems PR submit skill."""

from __future__ import annotations

import os
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(
    os.environ.get("FLAGGEMS_PR_SUBMIT_DATA_DIR", SKILL_DIR / "data")
).expanduser()

LEGACY_NORM_XLSX = Path("/workspace/规范名.xlsx")
LEGACY_PR_XLSX = Path("/workspace/第一批pr算子.xlsx")
LEGACY_RECORD_PATH = Path("/workspace/pr状态记录.md")


def _resolve_data_file(env_name: str, filename: str, legacy_path: Path) -> str:
    explicit = os.environ.get(env_name)
    if explicit:
        return str(Path(explicit).expanduser())

    skill_local = DATA_DIR / filename
    if skill_local.exists() or not legacy_path.exists():
        return str(skill_local)
    return str(legacy_path)


NORM_XLSX = _resolve_data_file("FLAGGEMS_NORM_XLSX", "规范名.xlsx", LEGACY_NORM_XLSX)
PR_XLSX = _resolve_data_file("FLAGGEMS_PR_XLSX", "第一批pr算子.xlsx", LEGACY_PR_XLSX)
RECORD_PATH = _resolve_data_file(
    "FLAGGEMS_PR_RECORD_PATH", "pr状态记录.md", LEGACY_RECORD_PATH
)
