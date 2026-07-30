# LFA Reader Web

This directory contains the React/Vite client for LFA Reader. It provides
authentication, single-image capture and upload, result review and correction,
per-disease statistics, Columbus ZIP Code mapping, and admin user management.

The maintained local workflow is macOS-based.

## Supported Workflows

- **FIV/FeLV**: active
- **Tick Borne**: active
- **Canine Urothelial Carcinoma**: under development and blocked by an
  informational notice

Statistics are workflow-aware. FIV/FeLV uses the `Positive L`, `Positive I`,
and `Positive L+I` categories; Tick Borne uses aggregate `Negative` and
`Positive` categories.

## Requirements

- Node.js 20.19+
- npm
- A running LFA Reader backend

## Setup

```bash
cd apps/web
npm ci

cat > .env.local <<'EOF'
VITE_API_BASE_URL=http://127.0.0.1:8000
EOF

npm run dev
```

Open `http://localhost:5173`.

`VITE_API_BASE_URL` should contain the backend origin without a trailing
`/api`. If it is unset, API requests use relative `/api/...` paths for
same-origin production routing.

Do not commit `.env.local`; it is intentionally ignored.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Create the production bundle in `dist/` |
| `npm run lint` | Run ESLint across the frontend |
| `npm run preview` | Preview the production bundle locally |

Run the frontend unit tests with Node's built-in test runner:

```bash
node --test \
  src/components/*.test.mjs \
  src/pages/*.test.mjs \
  src/utils/*.test.mjs
```

Before handing off a change, run:

```bash
npm run lint
npm run build
```

## Source Layout

```text
src/
├── components/      # Shared UI, navigation, camera, and ZIP map
├── context/         # Authentication provider and shared auth hook
├── locales/         # User-facing warning text
├── pages/           # Route-level screens and focused helper modules
├── services/        # Axios API client
└── utils/           # Reusable workflow and formatting helpers
```

The `@shared` Vite alias points to the repository-level `shared/` directory so
the web client can consume canonical workflow and reference data.

## Behavior Notes

- Authentication tokens are stored in `localStorage` and attached to API
  requests as JWT bearer tokens.
- Live browser camera access requires a secure context. When unavailable or
  denied, the capture screen falls back to the native file/camera picker.
- Camera navigation preserves the selected disease workflow in the URL.
- The Canine Urothelial Carcinoma card remains visible for product discovery
  but cannot start an upload while the workflow is under development.
- The statistics page selects result categories and positive-case series per
  workflow before rendering totals, charts, and ZIP Code data.
- Production builds may report a large-chunk warning. It is non-blocking, but
  route-level code splitting remains a future optimization.

## Related Documentation

- [Project README](../../README.md)
- [Contribution guide](../../CONTRIBUTING.md)
- [AWS backup and restore](../../scripts/README.md)
