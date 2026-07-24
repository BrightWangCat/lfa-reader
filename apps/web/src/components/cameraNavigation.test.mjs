import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCameraPath,
  buildUploadPath,
} from "./cameraNavigation.js";

test("preserves the selected disease across the camera round trip", () => {
  const search = "?disease=tick_borne";

  assert.equal(buildCameraPath(search), `/camera${search}`);
  assert.equal(buildUploadPath(search), `/upload${search}`);
});

test("uses plain routes when there is no workflow query", () => {
  assert.equal(buildCameraPath(""), "/camera");
  assert.equal(buildUploadPath(""), "/upload");
});
