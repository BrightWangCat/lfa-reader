import assert from "node:assert/strict";
import test from "node:test";

import { getStatisticsCategoryConfig } from "./statisticsCategories.js";

test("keeps the FIV/FeLV result and positive categories separate", () => {
  const config = getStatisticsCategoryConfig("fiv_felv");

  assert.deepEqual(config.resultCategories, [
    "Negative",
    "Positive L",
    "Positive I",
    "Positive L+I",
  ]);
  assert.deepEqual(config.positiveCategories, [
    "Positive L",
    "Positive I",
    "Positive L+I",
  ]);
});

test("uses aggregate Negative and Positive categories for Tick Borne", () => {
  const config = getStatisticsCategoryConfig("tick_borne");

  assert.deepEqual(config.resultCategories, ["Negative", "Positive"]);
  assert.deepEqual(config.positiveCategories, ["Positive"]);
});

test("does not apply another workflow's categories to an unknown disease", () => {
  const config = getStatisticsCategoryConfig("unknown");

  assert.deepEqual(config.resultCategories, []);
  assert.deepEqual(config.positiveCategories, []);
});
