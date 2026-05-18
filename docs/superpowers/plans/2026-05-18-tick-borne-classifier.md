# Tick Borne Classifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent Tick Borne SNAP 4Dx Plus dot-based classifier with per-analyte output while preserving existing FeLV/FIV behavior.

**Architecture:** Split disease-specific classification into `apps/backend/app/services/classifiers/`. Route classification by disease workflow through a dispatcher. Store structured result details in JSON string columns while keeping existing summary fields for compatibility.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, OpenCV, NumPy, unittest, React, SwiftUI.

---

## File Structure

- Create `apps/backend/app/services/classifiers/__init__.py`: classifier package marker and exports.
- Create `apps/backend/app/services/classifiers/common.py`: shared result summary/detail helpers.
- Create `apps/backend/app/services/classifiers/fiv_felv.py`: existing FeLV/FIV line-based CV and rule classifier.
- Create `apps/backend/app/services/classifiers/tick_borne.py`: Tick Borne dot-based CV and rule classifier.
- Modify `apps/backend/app/services/cv_inference.py`: keep background-task orchestration and delegate disease logic through dispatcher.
- Create `apps/backend/app/services/classification_dispatcher.py`: route `Image` records to disease-specific classifier.
- Modify `apps/backend/app/models.py`: add JSON string fields for structured CV and manual correction details.
- Modify `apps/backend/app/main.py`: idempotently add new SQLite columns.
- Modify `apps/backend/app/schemas.py`: parse detail JSON for API responses.
- Modify `apps/backend/app/routers/reading.py`: accept summary or structured manual corrections and expose workflow-aware categories.
- Modify `apps/backend/app/routers/stats.py` and `apps/backend/app/services/weekly_trends.py`: treat `Positive: ...` Tick Borne summaries as positive for aggregate stats.
- Modify `apps/web/src/pages/Results.jsx`: render per-analyte Tick Borne detail when present.
- Modify `apps/ios/LFAReader/Models/TestResult.swift` and `apps/ios/LFAReader/Views/ImageDetailView.swift`: decode and display structured detail.
- Add backend tests under `apps/backend/tests/`.

### Task 1: Backend Detail Model

**Files:**
- Modify: `apps/backend/app/models.py`
- Modify: `apps/backend/app/main.py`
- Modify: `apps/backend/app/schemas.py`
- Test: `apps/backend/tests/test_result_detail_schema.py`

- [ ] **Step 1: Write failing schema tests**

Create tests that instantiate `ImageResponse` from a dict containing JSON strings for `cv_result_detail` and `manual_correction_detail`, and assert both are parsed as objects.

- [ ] **Step 2: Run test to verify RED**

Run: `PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_result_detail_schema -v`

Expected: fail because `cv_result_detail` and `manual_correction_detail` do not exist.

- [ ] **Step 3: Add model columns and schema parsing**

Add nullable string columns to `Image`. Add idempotent SQLite `ALTER TABLE` statements in `main.py`. Add optional dict fields and validators in `ImageResponse`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_result_detail_schema -v`

Expected: pass.

### Task 2: Tick Borne Rule and Spot Units

**Files:**
- Create: `apps/backend/app/services/classifiers/__init__.py`
- Create: `apps/backend/app/services/classifiers/common.py`
- Create: `apps/backend/app/services/classifiers/tick_borne.py`
- Test: `apps/backend/tests/test_tick_borne_classifier.py`

- [ ] **Step 1: Write failing classifier unit tests**

Tests cover synthetic colored spot detection, background rejection, invalid when control missing, negative when only control passes, and multi-analyte positive summary.

- [ ] **Step 2: Run test to verify RED**

Run: `PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_tick_borne_classifier -v`

Expected: fail because package/functions do not exist.

- [ ] **Step 3: Implement Tick Borne classifier**

Implement `score_spot`, `detect_spots`, `classify_from_spot_scores`, `classify_single_image`, and summary/detail helpers. Use explicit constants for spot layout and thresholds.

- [ ] **Step 4: Run test to verify GREEN**

Run: `PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_tick_borne_classifier -v`

Expected: pass.

### Task 3: Classification Dispatcher

**Files:**
- Create: `apps/backend/app/services/classifiers/fiv_felv.py`
- Create: `apps/backend/app/services/classification_dispatcher.py`
- Modify: `apps/backend/app/services/cv_inference.py`
- Test: `apps/backend/tests/test_classification_dispatcher.py`

- [ ] **Step 1: Write failing dispatcher tests**

Tests create light fake image objects with patient info and monkeypatch classifier functions. Assert Tick Borne routes to `tick_borne.classify_single_image`, and FeLV/FIV routes to existing FeLV/FIV behavior.

- [ ] **Step 2: Run test to verify RED**

Run: `PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_classification_dispatcher -v`

Expected: fail because dispatcher does not exist.

- [ ] **Step 3: Move FeLV/FIV logic and implement dispatcher**

Move existing FeLV/FIV preprocessing, band detection, and classification code into `classifiers/fiv_felv.py`. Add disease routing. In `cv_inference.classify_image`, call dispatcher and persist `cv_result`, `cv_confidence`, and `cv_result_detail`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_classification_dispatcher -v`

Expected: pass.

### Task 4: Manual Correction and Stats Compatibility

**Files:**
- Modify: `apps/backend/app/routers/reading.py`
- Modify: `apps/backend/app/routers/stats.py`
- Modify: `apps/backend/app/services/weekly_trends.py`
- Test: `apps/backend/tests/test_reading_categories.py`
- Test: `apps/backend/tests/test_weekly_trends.py`

- [ ] **Step 1: Write failing tests**

Add tests that `is_positive_result("Positive: Ehrlichia")` returns true and that valid manual correction categories include Tick Borne positive summaries.

- [ ] **Step 2: Run tests to verify RED**

Run: `PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_reading_categories apps.backend.tests.test_weekly_trends -v`

Expected: fail because helper/category logic does not exist.

- [ ] **Step 3: Implement compatibility helpers**

Allow exact existing categories plus Tick Borne summary strings beginning with `Positive:`. Add `is_positive_result` helper and use it in stats and weekly trends.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `PYTHONPATH=apps/backend python3 -m unittest apps.backend.tests.test_reading_categories apps.backend.tests.test_weekly_trends -v`

Expected: pass.

### Task 5: Web and iOS Detail Display

**Files:**
- Modify: `apps/web/src/pages/Results.jsx`
- Modify: `apps/ios/LFAReader/Models/TestResult.swift`
- Modify: `apps/ios/LFAReader/Views/ImageDetailView.swift`

- [ ] **Step 1: Add frontend decoding/rendering**

Web should show analyte rows when `image.cv_result_detail.analytes` exists. iOS should decode `[String: String]` detail and render analyte rows in the result section.

- [ ] **Step 2: Run web lint/build**

Run: `cd apps/web && npm run lint && npm run build`

Expected: exit 0.

- [ ] **Step 3: Run iOS compile check if available**

Run: `xcodebuild -project apps/ios/LFAReader.xcodeproj -scheme LFAReader -destination 'generic/platform=iOS Simulator' build`

Expected: exit 0 when local Xcode toolchain is available.

### Task 6: Final Verification

**Files:**
- Review all modified files.

- [ ] **Step 1: Run backend unit tests**

Run: `PYTHONPATH=apps/backend python3 -m unittest discover apps/backend/tests -v`

Expected: all tests pass.

- [ ] **Step 2: Run web build checks**

Run: `cd apps/web && npm run lint && npm run build`

Expected: exit 0.

- [ ] **Step 3: Check git diff**

Run: `git diff --stat && git diff --check`

Expected: no whitespace errors.

- [ ] **Step 4: Commit changes**

Run:

```bash
git add docs/superpowers apps/backend apps/web apps/ios
git commit -m "feat: add tick borne classifier"
```

Expected: commit created on `main`.

## Self-Review

- Spec coverage: disease-specific code split, FeLV/FIV logic migration, per-analyte output, structured detail, stats compatibility, and frontend display are covered.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step remains.
- Type consistency: `cv_result_detail` and `manual_correction_detail` are consistently named across backend, web, and iOS.
