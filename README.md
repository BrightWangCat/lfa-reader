# LFA Reader

LFA Reader is an image-based reading and classification system for
**veterinary lateral flow assays (LFAs)**. It consists of a React web client, a
native SwiftUI iOS client, and a shared FastAPI backend.

The active product flow is deliberately single-image: choose a disease
workflow, capture or select one image, provide workflow-specific patient
metadata, run computer-vision classification, and review or manually correct
the result.

The source code is published under a **source-available, noncommercial**
license. This repository is not distributed under an OSI-approved open source
license.

## Workflow Status

| Workflow | Species | Status | Classification output |
|----------|---------|--------|-----------------------|
| **FIV/FeLV** | Cat | Active | `Negative`, `Positive L`, `Positive I`, `Positive L+I`, or `Invalid` |
| **Tick Borne** | Dog | Active | Per-analyte SNAP 4Dx Plus results plus an overall `Negative`, `Positive: ...`, or `Invalid` summary |
| **Canine Urothelial Carcinoma** | Dog | Under development | No supported classifier yet |

Tick Borne analytes are E. canis/E. ewingii Ab, Lyme disease Ab
(B. burgdorferi), A. phagocytophilum/A. platys Ab, and Heartworm Ag.

The planned Canine Urothelial Carcinoma workflow remains in the shared disease
catalog for ongoing product work. The web app blocks it with an
**Under Development** notice, and the backend does not yet have a dedicated
classifier for it. Do not use that workflow for production classification.

## Highlights

The matrix below describes the two active workflows.

| Feature | Web | iOS |
|---------|:---:|:---:|
| Camera capture with scan-guide overlay | Yes | Yes |
| Photo library upload | Yes | Yes |
| Workflow-first single-image upload | Yes | Yes |
| Workflow-specific patient metadata | Yes | Yes |
| Tick Borne preventive-treatment metadata | Yes | Yes |
| Automatic image preprocessing and OpenCV classification | Yes | Yes |
| Manual correction override | Yes | Yes |
| Backend-generated advisories | Yes | Yes |
| User-facing timestamps normalized to US Eastern Time (`ET`) | Yes | Yes |
| Per-disease statistics dashboard | Yes | Yes |
| Weekly positive-result trends with Columbus temperature context | Yes | Yes |
| Patient metadata distribution charts | Yes | Yes |
| Columbus ZIP Code positive-case map | Yes | Yes |
| Admin user management | Yes | Yes |

The web statistics view uses workflow-specific result categories: FIV/FeLV
retains the `Positive L`, `Positive I`, and `Positive L+I` breakdown, while
Tick Borne uses aggregate `Negative` and `Positive` categories.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **iOS App** | Swift, SwiftUI, AVFoundation, async/await |
| **Web Frontend** | React 19, React Router 7, Vite 7, Ant Design 6.3, Leaflet, react-webcam |
| **Backend** | Python 3.12+, FastAPI, SQLAlchemy 2, Pydantic 2, Uvicorn |
| **Computer Vision** | OpenCV headless, LAB color-space line and spot detection |
| **Database** | SQLite |
| **Authentication** | JWT via python-jose, bcrypt via passlib |
| **Weather Data** | Open-Meteo Historical Weather API |

## Local Development on macOS

The maintained local development workflow is macOS-based. Windows-specific
setup is no longer maintained. The backend and production web build still run
on Linux, and the operational scripts under `scripts/` target the AWS Ubuntu
host.

### Prerequisites

- macOS
- Python 3.12+
- Node.js 20.19+
- Full Xcode installation for iOS development
- iOS 17.0+ deployment target

### Data Safety

- Known local `.env`, SQLite database, and upload paths are excluded by
  `.gitignore`. Never add credentials or real patient data under any other
  path.
- Backend startup runs idempotent SQLite schema migrations. Use a disposable
  local database, or make a verified backup before pointing a development
  process at valuable data.
- Keep local text files on LF line endings and inspect any sync-generated
  conflict copies before committing.
- AWS database backup and restore procedures are documented in
  [`scripts/README.md`](scripts/README.md).

### Backend

```bash
cd apps/backend
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements.txt

cat > .env <<'EOF'
SECRET_KEY=replace-with-a-long-random-development-secret
CORS_ORIGINS=http://localhost:5173
DATABASE_URL=sqlite:///./lfa_reader.db
UPLOAD_DIR=./uploads
EOF

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Useful local endpoints:

- Health check: `http://127.0.0.1:8000/api/health`
- Swagger UI: `http://127.0.0.1:8000/docs`

### Web Frontend

In a second terminal:

```bash
cd apps/web
npm ci

cat > .env.local <<'EOF'
VITE_API_BASE_URL=http://127.0.0.1:8000
EOF

npm run dev
```

Open `http://localhost:5173`. If `VITE_API_BASE_URL` is unset, the web app
uses same-origin API paths, which is the expected production configuration
behind the reverse proxy.

See [`apps/web/README.md`](apps/web/README.md) for frontend structure,
commands, and behavior notes.

### iOS App

Open the project in the full Xcode application:

```bash
open apps/ios/LFAReader.xcodeproj
```

Before running the app, confirm `APIClient.baseURL` in
`apps/ios/LFAReader/Services/APIClient.swift`. The checked-in configuration
targets the deployed API. Using a backend on the Mac or local network requires
an appropriate development URL and a DEBUG-only App Transport Security/network
configuration. Do not weaken release TLS settings or commit a personal LAN
address.

If the active developer directory points only to Command Line Tools, select the
installed Xcode application for the command. For the current Xcode beta layout:

```bash
DEVELOPER_DIR=/Applications/Xcode-beta.app/Contents/Developer \
  xcodebuild -project apps/ios/LFAReader.xcodeproj \
  -scheme LFAReader \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

For a standard Xcode installation, use
`/Applications/Xcode.app/Contents/Developer` instead.

## Verification

Run these checks before submitting changes.

### Backend

```bash
cd apps/backend
source venv/bin/activate
python -m unittest discover -s tests -p 'test_*.py'
python -m compileall -q app
```

### Web

```bash
cd apps/web
node --test \
  src/components/*.test.mjs \
  src/pages/*.test.mjs \
  src/utils/*.test.mjs
npm run lint
npm run build
```

### iOS

Use the `xcodebuild` command above. The project currently has an application
target but no separate XCTest target.

## Repository Layout

```text
lfa-reader/
├── apps/
│   ├── backend/     # FastAPI API, SQLite models, CV pipeline, and tests
│   ├── web/         # React/Vite web client
│   └── ios/         # SwiftUI iOS client and Xcode project
├── shared/data/     # Shared disease, breed, age, and Columbus ZIP data
├── scripts/         # AWS database backup and restore helpers
├── CONTRIBUTING.md
└── README.md
```

## API and Operations

The backend exposes authentication, upload, reading, user-management, and
statistics endpoints under `/api`. Run the backend and use `/docs` as the
current endpoint reference.

The AWS backup scripts are intentionally database-only and keep a rolling pool
of two snapshots in addition to the live database. Read
[`scripts/README.md`](scripts/README.md) before running backup or restore
operations.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.

## License

This repository is licensed under the
**PolyForm Noncommercial License 1.0.0**. Commercial use is not allowed under
that license. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for details.
