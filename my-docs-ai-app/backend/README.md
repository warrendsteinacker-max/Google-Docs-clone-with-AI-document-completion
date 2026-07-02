# Backend — Page-by-Page AI Fill API

## Local dev
cd backend && npm install
cp .env.example .env   # add your Gemini key
npm run dev             # http://localhost:3001

## Deploy
cd backend && vercel --prod
# Then in Vercel dashboard → Settings → Environment Variables:
# add GEMINI_API_KEY, then redeploy

## Endpoints
GET  /api/health
POST /api/fill/page   { apiKey?, pageHtml, pageIndex, totalPages, history? }
                       → { filledHtml, historyAppend }
POST /api/stream       { apiKey?, pageHtml, pageIndex, totalPages, history? }
                       → text/event-stream of the filled HTML, token by token

`apiKey` is optional everywhere — omit to use the server's default GEMINI_API_KEY.
