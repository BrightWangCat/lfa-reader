# FeLV/FIV LFA Reader

An automated reading and classification system for **FeLV/FIV lateral flow assay (LFA)** test strips used in veterinary diagnostics. Upload photos of test cassettes and get computer-vision-based classification results — available as both a **web application** and a **native iOS app**.

**Live Demo**: https://16.59.11.102:8080 (self-signed certificate; accept the browser warning on first visit)

## Features

| Feature | Web | iOS |
|---------|:---:|:---:|
| Camera capture with scan-guide overlay | ✅ | ✅ |
| Photo library upload | ✅ | ✅ |
| OpenCV classification (LAB color-space analysis) | ✅ | ✅ |
| Automatic image preprocessing | ✅ | ✅ |
| Batch upload (multiple images) | ✅ | — |
| Manual correction override | ✅ | ✅ |
| Patient metadata (species, age, sex, breed, zip code) | ✅ | ✅ |
| Statistics dashboard | ✅ | ✅ |
| Zip code geographic heatmap | ✅ | ✅ |
| CSV / Excel export | ✅ | — |
| Admin user management | ✅ | — |
| Pull-to-refresh & offline batch caching | — | ✅ |

### Classification Categories

- **Negative** — Only control (C) band visible
- **Positive L** — C + FeLV band
- **Positive I** — C + FIV band
- **Positive L+I** — C + both bands
- **Invalid** — No control band detected

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **iOS App** | Swift, SwiftUI, AVFoundation, MVVM, async/await |
| **Web Frontend** | React 19, Vite 7, Ant Design 6, Leaflet, react-webcam |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy, Uvicorn |
| **Computer Vision** | OpenCV (headless), LAB color-space two-stage band detection |
| **Database** | SQLite |
| **Auth** | JWT (python-jose), bcrypt (passlib) |

## Project Structure

```
FeLV-FIV-AI-website/
├── LFAReader/                    # iOS native app
│   ├── LFAReader.xcodeproj/
│   └── LFAReader/
│       ├── Views/                # SwiftUI views (15 files)
│       ├── ViewModels/           # @Observable view models (6 files)
│       ├── Models/               # Codable data models (6 files)
│       ├── Services/             # APIClient, CameraService, ImageCache
│       └── Resources/            # Assets, localization
│
├── backend/                      # Python FastAPI backend
│   ├── app/
│   │   ├── main.py               # App entry point
│   │   ├── models.py             # SQLAlchemy ORM models
│   │   ├── schemas.py            # Pydantic schemas
│   │   ├── auth.py               # JWT authentication
│   │   ├── routers/              # API route handlers
│   │   └── services/
│   │       ├── cv_inference.py         # OpenCV band detection
│   │       └── image_preprocessor.py   # Cassette detection & preprocessing
│   └── requirements.txt
│
└── frontend/                     # React web app
    ├── src/
    │   ├── pages/                # React pages (8 files)
    │   ├── components/           # Reusable components (5 files)
    │   ├── context/              # AuthContext
    │   └── services/             # Axios API client
    ├── package.json
    └── vite.config.js
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- Xcode 15+ (for iOS development, macOS only)

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env file
cat > .env << EOF
SECRET_KEY=your-secret-key-here
CORS_ORIGINS=http://localhost:5173
DATABASE_URL=sqlite:///./lfa_reader.db
EOF

uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Web Frontend

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

### iOS App

```bash
# Open in Xcode
open LFAReader/LFAReader.xcodeproj

# Or build from command line
xcodebuild -project LFAReader/LFAReader.xcodeproj -scheme LFAReader \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

> **Note**: The iOS app requires iOS 17.0+. Update the API base URL in `APIClient.swift` to point to your backend server.

## API Overview

| Endpoint | Description |
|----------|-------------|
| `POST /api/users/register` | Register new user |
| `POST /api/users/login` | Login (returns JWT) |
| `POST /api/upload/single` | Upload single image + patient info |
| `POST /api/upload/batch` | Upload multiple images |
| `GET /api/upload/batches` | List user's batches |
| `POST /api/readings/batch/{id}/classify` | Start CV classification |
| `GET /api/readings/batch/{id}/status` | Poll classification progress |
| `PUT /api/readings/image/{id}/correct` | Manual correction |
| `GET /api/stats/global` | Global statistics |
| `GET /api/export/batch/{id}/csv` | Export results as CSV |

Full API documentation is available at `/docs` (Swagger UI) when the backend is running.

## Computer Vision Pipeline

The classification engine uses a deterministic two-stage approach (no ML model required):

1. **Image Preprocessing** — Cassette detection via contour analysis, straightening, orientation correction, and contrast enhancement
2. **Band Detection** — LAB color-space analysis targeting the a-channel for red/purple/pink band peaks
3. **Zone Scoring** — 99th percentile (p99) scoring in C/L/I zones for high sensitivity
4. **Prominence Validation** — Column profile prominence check for specificity, distinguishing genuine bands from noise
5. **Rule-based Classification** — Maps detected band combinations to result categories

## User Roles

| Role | Permissions |
|------|------------|
| `single` | Single image upload, view own results |
| `batch` | All of `single` + batch uploads |
| `admin` | All of `batch` + user management, full data access, image export |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key (required) | — |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:5173` |
| `DATABASE_URL` | Database connection string | `sqlite:///./lfa_reader.db` |
| `UPLOAD_DIR` | Image upload directory | `./uploads` |

## License

This project is intended for veterinary diagnostic research purposes.
