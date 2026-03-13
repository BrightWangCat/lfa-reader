# FeLV/FIV LFA Reader

**Online Access**: http://16.59.11.102:8080

A web application for automated reading and classification of **FeLV/FIV lateral flow assay (LFA)** test strips used in veterinary diagnostics. Upload photos of test cassettes and get computer-vision-based classification results.

## Features

- **OpenCV classification pipeline**: Local computer-vision pipeline using LAB color-space analysis and two-stage band detection. No external API calls required.
- **Image preprocessing**: Automatic cassette detection, contour straightening, orientation correction, and contrast enhancement
- **Batch processing**: Upload multiple test strip images at once with real-time progress tracking
- **Result categories**: Negative, Positive L (FeLV), Positive I (FIV), Positive L+I (both), Invalid
- **Manual correction**: Review and override CV classifications when needed
- **Patient metadata**: Attach species, age, sex, breed, and zip code to each test image
- **Statistics dashboard**: View aggregated classification results, CV vs Manual comparison metrics
- **Export**: Download results as CSV or Excel spreadsheets, export preprocessed images as ZIP
- **User management**: Registration, login (JWT auth), role-based access control (single / batch / admin)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 7, Ant Design 6, React Router 7 |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy, Uvicorn |
| **CV** | OpenCV (headless) |
| **Database** | SQLite |
| **Auth** | JWT (python-jose), bcrypt (passlib) |

## Project Structure

```
lfa-reader/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, startup migrations
│   │   ├── config.py            # Environment-based configuration
│   │   ├── database.py          # SQLAlchemy engine & session
│   │   ├── models.py            # User, UploadBatch, Image, PatientInfo
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── auth.py              # JWT token utilities
│   │   ├── routers/
│   │   │   ├── users.py         # Registration, login, user management
│   │   │   ├── upload.py        # Image upload & batch creation
│   │   │   ├── reading.py       # CV classification triggers
│   │   │   ├── stats.py         # Statistics endpoints
│   │   │   └── export.py        # CSV / Excel / image ZIP export
│   │   └── services/
│   │       ├── cv_inference.py        # OpenCV band detection & classification
│   │       └── image_preprocessor.py  # Cassette detection & strip preprocessing
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── services/api.js      # Axios API client
│   │   ├── context/AuthContext.jsx
│   │   ├── components/          # Navbar, Layout, ProtectedRoute
│   │   └── pages/               # Login, Register, Upload, Results, History, Stats, UserManagement
│   ├── package.json
│   └── vite.config.js
├── archive/                     # Deprecated modules (LLM classifier)
└── README.md
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- npm 9+

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set SECRET_KEY to a random string for production

# Start the server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The frontend dev server runs on `http://localhost:5173` and proxies API requests to the backend at `http://localhost:8000`.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | Yes | `dev-secret-key-...` | JWT signing key |
| `DATABASE_URL` | No | `sqlite:///./lfa_reader.db` | Database connection string |
| `CORS_ORIGINS` | No | `http://localhost:5173` | Comma-separated allowed origins |
| `UPLOAD_DIR` | No | `./uploads` | Directory for uploaded images |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/users/register` | User registration |
| `POST` | `/api/users/login` | User login (returns JWT) |
| `POST` | `/api/upload/single` | Upload single test strip image |
| `POST` | `/api/upload/batch` | Upload multiple images as a batch |
| `GET` | `/api/upload/batch/{id}` | Get batch with all images |
| `POST` | `/api/readings/batch/{id}/classify` | Start CV classification |
| `GET` | `/api/readings/batch/{id}/status` | Poll classification progress |
| `POST` | `/api/readings/batch/{id}/cancel` | Cancel running classification |
| `PUT` | `/api/readings/image/{id}/correct` | Manual correction |
| `GET` | `/api/stats/batch/{id}` | Get batch statistics |
| `GET` | `/api/export/batch/{id}/csv` | Export results as CSV |
| `GET` | `/api/export/batch/{id}/excel` | Export results as Excel |
| `GET` | `/api/export/batch/{id}/images` | Export images as ZIP (admin) |

## Classification Pipeline

1. Detect and crop the test cassette from the uploaded photo
2. Straighten and orient the cassette (FeLV/FIV label left, sample well right)
3. Extract the analysis region covering the strip opening
4. Convert to LAB color space; compute column-wise a-channel profile
5. Two-stage band detection:
   - **Stage 1 (Sensitivity)**: Zone-based 99th percentile scoring with adaptive thresholds
   - **Stage 2 (Specificity)**: Column profile prominence validation to eliminate cross-zone spillover
6. Dual-band ratio validation to distinguish genuine dual-positives from single-band spillover
7. Apply deterministic rules: C/L/I band presence maps to classification category

### Result Categories

| Category | Meaning |
|----------|---------|
| Negative | Only C (control) band visible |
| Positive L | C band + L (FeLV) band visible |
| Positive I | C band + I (FIV) band visible |
| Positive L+I | C band + both L and I bands visible |
| Invalid | No C (control) band detected |

## License

This project is for research and educational purposes.
