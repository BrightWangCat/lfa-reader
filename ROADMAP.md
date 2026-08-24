# Improvement Plan and TODO

Last updated: 2026-08-24

This document tracks planned improvements and open work items for LFA Reader
across the backend, web, and iOS clients. Check off items as they land, add
newly discovered work under the matching initiative, and keep entries small
enough to verify individually. Open product choices are marked
**Decision needed** and must be settled before the dependent tasks start.

## Initiative Overview

| # | Initiative | Status | Priority |
|---|------------|--------|----------|
| 1 | MLLM-based test result classification | Not started | High |
| 2 | Continuous bug fixing and visual polish | Ongoing | Ongoing |
| 3 | Split into a user edition and a doctor edition | Not started | High |

Suggested sequencing, to be confirmed before execution: start with the role
model and authorization work from initiative 3 because it reshapes data
visibility for every later feature, run initiative 1 in shadow mode next, and
treat initiative 2 as a standing track that ships continuously alongside both.

## 1. MLLM-Based Test Result Classification

### Background

Classification today is a deterministic OpenCV pipeline under
`apps/backend/app/services/classifiers/`, with per-workflow line and spot
detection dispatched by `classification_dispatcher.py`. Thresholds are hand
calibrated per workflow, which makes each new disease costly to support and
leaves hard cases such as weak bands, glare, or off-angle photos to manual
correction.

### Goal

Add a second classification path that sends the preprocessed image plus
workflow context to a multimodal large language model, hereafter MLLM, and
returns a structured result constrained to the existing category set. The
OpenCV pipeline remains the default and the fallback; the MLLM path must earn
promotion per workflow through measured accuracy.

### Tasks

- [ ] Build a labeled evaluation set per active workflow from reviewed
      readings, with manual corrections treated as ground truth.
- [ ] Evaluate at least two hosted MLLM APIs and one self-hosted open-weight
      vision model for accuracy, latency, cost per read, and data handling
      terms.
- [ ] **Decision needed:** hosted API versus self-hosted model. Images leave
      the server when a hosted API is used, so the data policy and any consent
      wording must be settled first.
- [ ] Add an MLLM classifier module under
      `apps/backend/app/services/classifiers/` and register it in
      `classification_dispatcher.py` behind a per-workflow flag.
- [ ] Constrain model output to the categories in
      `app/services/result_categories.py` with strict schema validation;
      reject invalid output and fall back to the OpenCV result.
- [ ] Write per-workflow prompts that encode strip geometry, analyte layout,
      and exact category definitions for FIV/FeLV and Tick Borne.
- [ ] Configuration via `.env`: provider endpoint, API key, per-workflow
      enable flag, timeout, and retry policy. Default is off.
- [ ] Graceful degradation: on API error or timeout, serve the OpenCV result
      and record the failure for review.
- [ ] Shadow mode first: run the MLLM in parallel with OpenCV, store both
      results and agreement metrics, and leave user-visible output unchanged.
- [ ] Agreement report: per-workflow confusion matrix of OpenCV versus MLLM
      versus manual corrections.
- [ ] Acceptance gate: enable MLLM-assisted output for a workflow only after
      it beats the OpenCV baseline on the evaluation set.
- [ ] Surface the classification source, confidence, and a short rationale on
      the web and iOS result screens once enabled.
- [ ] Cost controls: daily request cap, caching for repeated reads of the same
      upload, and a recurring spend review.
- [ ] Extend the evaluation harness to the Canine Urothelial Carcinoma
      workflow when its sample set exists; an MLLM path may reach usable
      accuracy there before a hand-tuned OpenCV classifier does.

## 2. Continuous Bug Fixing and Visual Polish

This is a standing track rather than a one-time milestone. It ships small,
verifiable changes continuously.

### Process

- [ ] Keep a Known Issues list in this section; one checklist line per
      confirmed bug, stating the affected platform and how to reproduce it.
- [ ] Reproduce each bug with a failing test before fixing it wherever the
      stack allows, then confirm the test passes after the fix.
- [ ] Run the backend, web, and iOS verification steps from `README.md`
      before each deployment.

### Known Issues

Add entries here as they are confirmed. Do not list unverified reports.

- [ ] None recorded yet.

### Visual Polish, Web

- [ ] Centralize Ant Design theme tokens so colors, spacing, and typography
      stay consistent across pages.
- [ ] Responsive audit of Upload, Results, History, and Statistics at phone
      and tablet widths.
- [ ] Loading skeletons and designed empty states for History and Statistics.
- [ ] Accessibility pass: color contrast, focus states, image alt text, and
      keyboard navigation.
- [ ] **Decision needed:** whether to support dark mode on the web client.

### Visual Polish, iOS

- [ ] Consistent spacing and typography across the capture, metadata, and
      result screens.
- [ ] Dynamic Type audit so large text sizes do not break layouts.
- [ ] Dark mode audit across all screens.
- [ ] Refine the scan-guide overlay alignment for both cartridge types.

## 3. User Edition and Doctor Edition

### Background

All signed-in accounts currently share one experience. Roles today are `user`
and `admin`, defined in `apps/backend/app/role_utils.py`, with admin adding
user management. The product should serve two audiences differently: pet
owners need a simple capture-and-result flow with plain-language guidance,
while veterinarians need full clinical detail, correction authority, and
population statistics.

### Target Capability Split

| Capability | User edition | Doctor edition |
|------------|--------------|----------------|
| Camera capture and upload | Yes | Yes |
| Patient metadata entry | Simplified form | Full workflow-specific form |
| Result display | Plain-language summary and advisory | Full per-analyte detail |
| Manual correction override | No | Yes |
| History | Own submissions only | All submissions |
| Statistics dashboards and ZIP map | No | Yes |
| User management | No | Admin only |

This matrix is the starting proposal and needs confirmation before
implementation.

### Tasks

- [ ] Add a `doctor` role to `role_utils.py` with an idempotent migration,
      following the existing legacy-role migration pattern.
- [ ] **Decision needed:** whether `admin` implies all doctor capabilities or
      stays a separate management-only role.
- [ ] **Decision needed:** how doctor accounts are provisioned; the likely
      answer is admin-created only, with self-registration reserved for the
      user role.
- [ ] Backend authorization: per-endpoint role checks, and ownership scoping
      so user-role accounts can only read their own submissions.
- [ ] Doctor review queue: user-submitted readings are flagged for doctor
      confirmation, and any correction becomes visible to the submitting
      user.
- [ ] Web: role-based routing and navigation with a distinct home view per
      role.
- [ ] iOS: role-aware interface selected after login.
- [ ] **Decision needed:** one client with role-adaptive screens versus two
      separately deployed frontends. The single-client approach is smaller to
      maintain and is the starting proposal.
- [ ] Rewrite result advisories for the user edition in plain language while
      keeping the current clinical wording for the doctor edition.
- [ ] Update the `README.md` feature matrix and workflow status once the
      split ships.

## Maintaining This Document

Update the initiative table and the task lists in the same commit as the work
they describe. When an initiative completes, record the completion date next
to its heading and move any remaining stragglers into a follow-up section
rather than deleting them.
