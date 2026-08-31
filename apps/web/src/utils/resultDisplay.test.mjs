import assert from "node:assert/strict";
import test from "node:test";

import { getPlainResult, isPositiveFinal } from "./resultDisplay.js";

test("missing result reads as pending", () => {
  const plain = getPlainResult("FIV/FeLV", null);
  assert.equal(plain.tone, "pending");
});

test("negative reads as good news without clinical jargon", () => {
  const plain = getPlainResult("FIV/FeLV", "Negative");
  assert.equal(plain.tone, "good");
  assert.match(plain.summary, /did not detect/);
});

test("fiv felv positive names the line position, not a diagnosis", () => {
  const plain = getPlainResult("FIV/FeLV", "Positive L");
  assert.equal(plain.tone, "attention");
  assert.match(plain.summary, /position L/);
  assert.match(plain.summary, /veterinarian/);
});

test("tick borne positives translate analyte labels to plain names", () => {
  const plain = getPlainResult(
    "Tick Borne",
    "Positive: Lyme disease Ab (B. burgdorferi), Heartworm Ag"
  );
  assert.equal(plain.tone, "attention");
  assert.match(plain.summary, /Lyme disease/);
  assert.match(plain.summary, /Heartworm/);
  assert.doesNotMatch(plain.summary, /Ab \(B\. burgdorferi\)/);
});

test("invalid asks for a retake instead of alarming the owner", () => {
  const plain = getPlainResult("Tick Borne", "Invalid");
  assert.equal(plain.tone, "invalid");
  assert.match(plain.summary, /retaking the photo/);
});

test("unknown categories pass through untranslated", () => {
  const plain = getPlainResult("FIV/FeLV", "Something Else");
  assert.equal(plain.tone, "neutral");
  assert.equal(plain.title, "Something Else");
});

test("isPositiveFinal matches every positive category shape", () => {
  assert.equal(isPositiveFinal("Positive"), true);
  assert.equal(isPositiveFinal("Positive L+I"), true);
  assert.equal(isPositiveFinal("Positive: Heartworm Ag"), true);
  assert.equal(isPositiveFinal("Negative"), false);
  assert.equal(isPositiveFinal("Invalid"), false);
  assert.equal(isPositiveFinal(null), false);
});
