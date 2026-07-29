import assert from "node:assert/strict";
import test from "node:test";

import {
  CANINE_UROTHELIAL_CARCINOMA_ID,
  isDiseaseUnderDevelopment,
} from "./diseaseAvailability.js";

test("marks Canine Urothelial Carcinoma as under development", () => {
  assert.equal(
    isDiseaseUnderDevelopment(CANINE_UROTHELIAL_CARCINOMA_ID),
    true
  );
});

test("keeps developed and missing disease ids available", () => {
  assert.equal(isDiseaseUnderDevelopment("fiv_felv"), false);
  assert.equal(isDiseaseUnderDevelopment("tick_borne"), false);
  assert.equal(isDiseaseUnderDevelopment(null), false);
});
