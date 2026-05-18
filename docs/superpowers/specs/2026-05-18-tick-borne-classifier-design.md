# Tick Borne Classifier Design

## 背景

LFA Reader 当前支持 `FIV/FeLV`、`Tick Borne` 和 `Canine Urothelial Carcinoma` 三个 workflow，但现有 backend classifier 只实现了 FeLV/FIV 的 line-based `C/L/I` 读数。`Tick Borne` 截图对应 IDEXX SNAP 4Dx Plus 类型的 dot-based 盒子，结果窗口内包含 positive control 和 4 个 analyte reaction spots，不适合复用 FeLV/FIV 的 column-profile line detection。

官方资料显示 SNAP 4Dx Plus 用于检测 Heartworm antigen、Lyme antibody、Ehrlichia antibody、Anaplasma antibody，并通过 reaction spots 判读结果。算法设计必须输出每个 analyte 的独立结果，而不是合并成单个 `Positive`。

参考资料：

- https://www.idexx.com/en/veterinary/snap-tests/snap-4dx-plus-test/
- https://www.idexx.com/files/06-0015589-03-insert-4dx-plus-ng.pdf
- https://www.idexx.com/files/using-snap-test-kits-en.pdf

## 用户确认的约束

- `Tick Borne` 必须输出 per-analyte result。
- 每个 disease workflow 必须有独立分类代码。
- 不为了减少改动而把 Tick Borne 结果压缩为 `Negative / Positive / Invalid`。
- 目前没有真实 Tick Borne 测试图片，视觉准确性验证要等用户提供数据后再做。

## 目标

第一版实现一个可解释、无需训练数据的 Tick Borne dot-based classifier：

- 独立检测 `control`、`ehrlichia`、`lyme`、`anaplasma`、`heartworm` 5 个 spot。
- `control` 不成立时返回 `Invalid`。
- `control` 成立且任意 analyte 阳性时返回 structured per-analyte result。
- 保留 summary 字符串供现有 UI 和统计逻辑继续工作。
- 为后续真实样本调参保留 raw spot scores 和 confidence。

## 非目标

- 不训练 YOLO、segmentation 或其它 ML model。
- 不在第一版做完整临床级验证。
- 不读取、导出或改动 AWS 生产用户数据。
- 不把 FeLV/FIV 和 Tick Borne 的 detection logic 写进同一个 classifier。

## 架构

新增 disease-specific classifier 包：

```text
apps/backend/app/services/classifiers/
├── __init__.py
├── common.py
├── fiv_felv.py
└── tick_borne.py
```

`fiv_felv.py` 负责承载现有 line-based FeLV/FIV 逻辑。`tick_borne.py` 负责 SNAP 4Dx Plus dot-based 逻辑。`common.py` 只放跨 classifier 的小型 value helpers，不放 disease-specific detection。

新增 `classification_dispatcher.py`，根据 `Image.patient_info.disease_category` 分发到对应 classifier。这样 router 和 background task 不需要知道具体 disease 的检测细节。

## 数据模型

保留现有字段：

- `Image.cv_result`
- `Image.cv_confidence`
- `Image.manual_correction`

新增字段：

- `Image.cv_result_detail`
- `Image.manual_correction_detail`

两个 detail 字段均存 JSON string。API response 解析为 object。

Tick Borne detail schema：

```json
{
  "workflow": "Tick Borne",
  "overall": "Positive",
  "control": "Valid",
  "analytes": {
    "ehrlichia": "Positive",
    "lyme": "Negative",
    "anaplasma": "Negative",
    "heartworm": "Positive"
  },
  "confidence": "medium",
  "spots": {
    "control": {
      "detected": true,
      "score": 18.2,
      "threshold": 7.0
    }
  }
}
```

`cv_result` summary 规则：

- `Invalid`
- `Negative`
- `Positive: Ehrlichia`
- `Positive: Ehrlichia, Heartworm`

FeLV/FIV detail schema：

```json
{
  "workflow": "FIV/FeLV",
  "overall": "Positive",
  "bands": {
    "c": true,
    "l": true,
    "i": false
  },
  "confidence": "medium"
}
```

FeLV/FIV detail 是兼容增强，不改变现有 summary category。

## Tick Borne CV Pipeline

1. Read image with OpenCV.
2. Detect cassette contour and crop the cassette.
3. Normalize orientation so sample well is top, activation circle is bottom, and result window is in the middle.
4. Extract the result window by ratio crop with contour refinement fallback.
5. Define expected spot centers in normalized result-window coordinates.
6. Around each expected center, search a small local neighborhood for the strongest color-delta circular blob.
7. Score each spot against a local annulus background, not against absolute RGB.
8. Validate control.
9. Classify each analyte independently.
10. Build summary and structured detail.

## Spot Geometry

Use normalized coordinates in result window:

```python
SPOT_LAYOUT = {
    "control": (0.30, 0.20),
    "anaplasma": (0.68, 0.36),
    "ehrlichia": (0.28, 0.50),
    "heartworm": (0.70, 0.58),
    "lyme": (0.36, 0.78),
}
```

These coordinates are initial anchors from the provided screenshot and public SNAP 4Dx Plus diagrams. They must be tunable constants because real photos may differ by cassette lot, crop, and perspective.

## Spot Scoring

Each spot is scored with local foreground/background contrast:

- Convert ROI to LAB and HSV.
- Compute a circular foreground mask around the candidate center.
- Compute annulus background around the foreground.
- Score color as `median(delta_e)` plus a saturation component.
- Require a minimum high-chroma pixel ratio to reject shadows and text.
- Search a 5x5 grid around expected center and keep the candidate with the highest score.

Initial thresholds:

```python
CONTROL_THRESHOLD = 7.0
ANALYTE_THRESHOLD = 6.0
HIGH_CHROMA_RATIO_MIN = 0.08
```

These thresholds are placeholders for first implementation only in the statistical sense, not unspecified requirements. They are explicit constants and must be tuned once real data is available.

## Classification Rules

- If `control` score does not pass threshold, `overall = Invalid`.
- If control passes and all analytes fail threshold, `overall = Negative`.
- If control passes and at least one analyte passes threshold, `overall = Positive`.
- Per-analyte result is `Positive` or `Negative`.
- Confidence is derived from the weakest detected required signal:
  - `high`: minimum detected score ratio >= 2.5
  - `medium`: minimum detected score ratio >= 1.5
  - `low`: otherwise

## API/UI Behavior

Backend returns both summary and detail:

- Existing `cv_result` remains a string for backward compatibility.
- New `cv_result_detail` exposes per-analyte results.
- Manual correction accepts either existing string correction or structured detail correction.

Web and iOS should display Tick Borne as analyte rows when detail exists:

```text
Ehrlichia   Positive
Lyme        Negative
Anaplasma   Negative
Heartworm   Positive
```

For workflows without detail, existing summary display remains unchanged.

## Statistics

First implementation keeps existing stats compatible by mapping Tick Borne summary into:

- `Negative`
- `Positive`
- `Invalid`

Later enhancement can add per-analyte statistics. It is intentionally outside this first implementation to avoid mixing classifier correctness with analytics redesign.

## Testing Strategy

Without real Tick Borne images, tests focus on deterministic units:

- Spot scoring detects a synthetic colored spot against gray background.
- Spot scoring rejects background-only ROI.
- Classification rules return `Invalid` when control is missing.
- Classification rules return per-analyte positives when control and selected analytes pass.
- Dispatcher routes Tick Borne images to Tick Borne classifier and FeLV/FIV images to FeLV/FIV classifier.
- API schema serializes and parses `cv_result_detail`.

Visual accuracy will remain unverified until real Tick Borne images are available.

## Risks

- Public screenshot geometry may not match real phone photos closely enough.
- Result-window contour may be harder to isolate than FeLV/FIV strip windows.
- Blue-green spot color may vary by lighting, reagent strength, camera white balance, or lot.
- `Equivocal` may be clinically useful but is not exposed in first version because the current app category model is binary per result. Low confidence records remain available for manual correction.

## Self-Review

- No unspecified `TBD` requirements remain.
- Disease-specific code separation is explicit.
- Data model covers backward compatibility and per-analyte output.
- Testing limitations are explicit and do not claim real-image validation.
