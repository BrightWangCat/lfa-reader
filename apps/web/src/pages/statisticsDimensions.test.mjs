import assert from "node:assert/strict";
import test from "node:test";

import { getVisibleDimensionEntries } from "./statisticsDimensions.js";

const dimensionLabels = {
  disease_category: "Disease Category",
  species: "Species",
  age: "Age",
  preventive_treatment: "Preventive Treatment (6mo)",
};

test("hides workflow identity and preventive treatment for non-preventive workflows", () => {
  const entries = getVisibleDimensionEntries(dimensionLabels, {
    needs_preventive_treatment: false,
  });
  const keys = entries.map(([key]) => key);

  assert.deepEqual(keys, ["species", "age"]);
});

test("keeps preventive treatment for workflows that collect it", () => {
  const entries = getVisibleDimensionEntries(dimensionLabels, {
    needs_preventive_treatment: true,
  });
  const keys = entries.map(([key]) => key);

  assert.deepEqual(keys, ["species", "age", "preventive_treatment"]);
});
