"""
Server-side warning generation.

Warnings are returned as opaque string keys so that web and iOS clients can
render their own localized message for each key. Storing keys (rather than
full strings) keeps the wire format compact and lets the copy evolve without
touching historical records.
"""
from __future__ import annotations

from typing import Iterable

# Age buckets for cats that should trigger the false-negative advisory on the
# FIV/FeLV workflow. Values match shared/data/age_options.json.
_YOUNG_CAT_AGES = {"1-3m", "3-6m"}


def compute_warnings(
    disease_category: str,
    species: str | None,
    age: str | None,
) -> list[str]:
    keys: list[str] = []

    # FIV/FeLV on young cats: the lateral-flow assay is prone to false negatives
    # below 6 months, so clinicians are advised to re-test after 6 months.
    if (
        disease_category == "FIV/FeLV"
        and species == "cat"
        and age in _YOUNG_CAT_AGES
    ):
        keys.append("young_cat_false_negative")

    return keys


def encode_warnings(keys: Iterable[str]) -> str | None:
    # Persisted as a JSON string on Image.warnings; None keeps the column empty
    # when nothing was flagged, which is the common case.
    import json

    keys_list = list(keys)
    if not keys_list:
        return None
    return json.dumps(keys_list)
