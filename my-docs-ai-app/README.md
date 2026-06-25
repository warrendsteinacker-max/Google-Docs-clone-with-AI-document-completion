# My Docs AI App

A full-stack application for AI-powered documentation processing.

## Project Structure

```
my-docs-ai-app/
├── .github/
│   └── workflows/         # GitHub Actions workflows
├── backend/               # Express API server
│   ├── api/              # API endpoints
│   ├── server.js         # Main server entry
│   └── package.json      # Dependencies
├── frontend/             # Frontend application
│   └── index.html        # Main HTML file
└── README.md             # This file
```

## Getting Started

### Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend runs on `http://localhost:3000`

### Frontend Setup

```bash
cd frontend
python -m http.server 8000
# or
npx http-server
```

Visit `http://localhost:8000` in your browser.

## Environment Variables

Create `.env` file in the backend directory. See `backend/.env.example` for reference.

## Deployment

This project is configured for deployment on Vercel.

## License

MIT
