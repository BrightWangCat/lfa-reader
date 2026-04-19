# LFA Reader

An automated reading and classification system for **veterinary lateral flow assay (LFA)** test strips. The project supports three disease workflows:

- **FIV/FeLV** for cats
- **Tick Borne** for dogs
- **Canine Urothelial Carcinoma** for dogs

The current product uses a **single-image, image-based workflow** across both the web app and the native iOS app. Each uploaded image can be preprocessed, classified, manually corrected, and reviewed together with workflow-specific patient metadata.

The source code is published under a **source-available, noncommercial** license.
This repository is **not** distributed under an OSI-approved open source license.

**Live Demo**: https://16.59.11.102:8080  
The site uses a self-signed certificate, so browsers will show a warning the first time you open it.

## Features

| Feature | Web | iOS |
|---------|:---:|:---:|
| Camera capture with scan-guide overlay | ✅ | ✅ |
| Photo library upload | ✅ | ✅ |
| Workflow-first single-image upload flow | ✅ | ✅ |
| Disease workflow selection | ✅ | ✅ |
| Automatic image preprocessing | ✅ | ✅ |
| OpenCV classification | ✅ | ✅ |
| Manual correction override | ✅ | ✅ |
| Backend-generated advisories | ✅ | ✅ |
| User-facing timestamps normalized to US Eastern Time (`ET`) | ✅ | ✅ |
| Statistics dashboard with per-disease filtering | ✅ | ✅ |
| Area code geographic heatmap | ✅ | ✅ |
| Admin user management | ✅ | — |

### Classification Categories

- **Negative**: control (`C`) band only
- **Positive L**: `C` + `L` band
- **Positive I**: `C` + `I` band
- **Positive L+I**: `C` + both `L` and `I` bands
- **Invalid**: no valid control band detected

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **iOS App** | Swift, SwiftUI, AVFoundation, async/await |
| **Web Frontend** | React 19, React Router 7, Vite 7, Ant Design 6.3, Leaflet, react-webcam |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2, Uvicorn |
| **Computer Vision** | OpenCV headless, LAB color-space band detection |
| **Database** | SQLite |
| **Auth** | JWT via python-jose, bcrypt via passlib |

## Project Structure

```text
lfa-reader/
├── apps/
│   ├── backend/                      # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py              # App entry point
│   │   │   ├── models.py            # SQLAlchemy models
│   │   │   ├── schemas.py           # Pydantic schemas
│   │   │   ├── routers/             # API routes
│   │   │   └── services/            # CV + preprocessing services
│   │   └── requirements.txt
│   ├── ios/                         # Native iOS app
│   │   ├── LFAReader.xcodeproj/
│   │   └── LFAReader/
│   │       ├── Views/
│   │       ├── ViewModels/
│   │       ├── Models/
│   │       ├── Services/
│   │       └── Extensions/
│   └── web/                         # React web app
│       ├── src/
│       │   ├── components/
│       │   ├── context/
│       │   ├── locales/
│       │   ├── pages/
│       │   ├── services/
│       │   └── utils/
│       ├── package.json
│       └── vite.config.js
├── scripts/                         # AWS backup and restore helpers
└── shared/
    └── data/                        # Shared workflow / breed / age / map data
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20.19+
- Xcode 15+ for iOS development on macOS

### Backend

```bash
cd apps/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cat > .env << EOF
SECRET_KEY=your-secret-key-here
CORS_ORIGINS=http://localhost:5173
DATABASE_URL=sqlite:///./lfa_reader.db
UPLOAD_DIR=./uploads
EOF

uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Swagger UI is available at `http://127.0.0.1:8000/docs`.

### Web Frontend

```bash
cd apps/web
npm install

cat > .env.local << EOF
VITE_API_BASE_URL=http://localhost:8000
EOF

npm run dev
```

If `VITE_API_BASE_URL` is unset, the web app assumes same-origin API routing, which is how the AWS deployment works behind `nginx`.

### iOS App

```bash
open apps/ios/LFAReader.xcodeproj
```

Or build from the command line:

```bash
xcodebuild -project apps/ios/LFAReader.xcodeproj -scheme LFAReader \
  -destination 'generic/platform=iOS Simulator' build
```

Notes:

- The app requires iOS 17.0+.
- Debug builds currently default to `https://16.59.11.102:8080/api`.
- Debug builds trust the demo server's self-signed certificate for `16.59.11.102`.
- To point iOS at a different backend, update `baseURL` in `apps/ios/LFAReader/Services/APIClient.swift` and adjust `NSAppTransportSecurity` in `apps/ios/LFAReader/Info.plist` if needed.

## API Overview

| Endpoint | Description |
|----------|-------------|
| `POST /api/users/register` | Register a new user |
| `POST /api/users/login` | Login and receive a JWT |
| `GET /api/users/me` | Get the current user |
| `GET /api/users/` | List users, admin only |
| `PUT /api/users/{id}/role` | Change a user's role, admin only |
| `DELETE /api/users/{id}` | Delete a user and all owned data, admin only |
| `POST /api/upload/single` | Upload one image with `disease_category` and optional patient info |
| `GET /api/upload/images` | List images; admin sees all, regular users see their own |
| `GET /api/upload/image/{id}` | Get image detail with patient info |
| `DELETE /api/upload/image/{id}` | Delete an image and its files |
| `GET /api/upload/image/{id}/file` | Serve the image file; add `?original=true` for the original upload |
| `POST /api/readings/image/{id}/classify` | Start CV classification for an image |
| `GET /api/readings/image/{id}/status` | Poll classification status |
| `POST /api/readings/image/{id}/cancel` | Cancel a running classification job |
| `PUT /api/readings/image/{id}/correct` | Save a manual correction |
| `GET /api/readings/categories` | List valid classification categories |
| `GET /api/stats/global` | Global statistics with optional `?disease_category=<label>` filter |

## Computer Vision Pipeline

The classification engine uses a deterministic OpenCV pipeline rather than a learned model:

1. **Cassette preprocessing**: contour-based cassette detection, straightening, rotation correction, and normalization
2. **Band detection**: LAB color-space analysis focused on red and purple band response
3. **Zone scoring**: per-zone signal scoring for `C`, `L`, and `I`
4. **Prominence validation**: rejects weak or noisy peaks that do not resemble true bands
5. **Rule-based classification**: maps the detected band combination to one of the five result categories

## User Roles

| Role | Permissions |
|------|------------|
| `single` | Upload images, classify images, review and manually correct own results |
| `admin` | All `single` capabilities plus cross-user history, statistics, and user management |

## Environment Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | `dev-secret-key-change-in-production` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |
| `DATABASE_URL` | Database connection string | `sqlite:///./lfa_reader.db` |
| `UPLOAD_DIR` | Image upload directory | `./uploads` |

### Web Development

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | Backend origin for local development | empty string, meaning same-origin |

## Operations

- On AWS, public web traffic on `https://16.59.11.102:8080` is served by `nginx` from `apps/web/dist`.
- After pulling frontend changes on AWS, rebuild the static bundle with `cd apps/web && npm run build`.
- The `vite` dev server is for local development only and is not the public 8080 service.
- Backup and restore scripts live in [`scripts/`](scripts/). On AWS, run `scripts/backup.sh backend-change` before `git pull`. The script fetches upstream and creates a SQLite snapshot only when the incoming diff touches `apps/backend/`.
- `scripts/restore.sh` creates a `pre-restore` safety snapshot before replacing the live database. See [`scripts/README.md`](scripts/README.md) for full restore workflow details.

## License

This repository is licensed under the **PolyForm Noncommercial License 1.0.0**.
Commercial use is not allowed under that license.
See [LICENSE](LICENSE) and [NOTICE](NOTICE) for details.
