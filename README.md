# Insighta Labs+ Backend

A secure, multi-interface demographic intelligence API built for Insighta Labs.

## System Architecture
CLI (insighta-cli) ──────┐
├──► Backend API ──► PostgreSQL (Neon)
Web Portal (insighta-web)─┘         │
└──► External APIs (Genderize, Agify, Nationalize)
## Tech Stack
- Node.js + Express
- PostgreSQL (Neon)
- JWT (Access + Refresh tokens)
- GitHub OAuth 2.0 with PKCE state validation

## Authentication Flow

1. User hits `GET /auth/github`
2. Backend redirects to GitHub OAuth page
3. User authorizes
4. GitHub redirects to `GET /auth/github/callback`
5. Backend exchanges code for GitHub token
6. Backend fetches user info from GitHub
7. Backend creates or updates user in database
8. Backend issues access token (3min) + refresh token (5min)
9. CLI → tokens returned via redirect to localhost:9876
10. Web → tokens returned via redirect to web portal /auth/callback

## Token Handling

- Access token expires in 3 minutes — sent with every API request as `Authorization: Bearer <token>`
- Refresh token expires in 5 minutes — sent to `POST /auth/refresh` to get new token pair
- Old refresh token is destroyed immediately after use
- Expired tokens are cleaned up automatically every 10 minutes

## Role Enforcement

- `admin` — full access: create, delete, read, search profiles
- `analyst` — read only: can only read and search profiles
- Default role on signup: `analyst`
- Roles are enforced via middleware on every `/api/*` endpoint
- Inactive users (`is_active: false`) get 403 on all requests including token refresh

## API Versioning

All `/api/*` endpoints require the header:
X-API-Version: 1

Requests without this header return 400.

## Rate Limiting

- Auth endpoints: 10 requests/minute
- API endpoints: 60 requests/minute per user
- Returns 429 when exceeded

## Endpoints

### Auth
- `GET /auth/github` — redirect to GitHub login
- `GET /auth/github/callback` — OAuth callback
- `POST /auth/refresh` — refresh tokens
- `POST /auth/logout` — invalidate refresh token

### Profiles
- `GET /api/profiles` — list with filtering, sorting, pagination
- `GET /api/profiles/search?q=` — natural language search
- `GET /api/profiles/export?format=csv` — export as CSV
- `POST /api/profiles` — create profile (admin only)
- `GET /api/profiles/:id` — get single profile
- `DELETE /api/profiles/:id` — delete profile (admin only)

## Filtering

GET /api/profiles supports:
- gender, age_group, country_id
- min_age, max_age
- min_gender_probability, min_country_probability
- sort_by (age, created_at, gender_probability)
- order (asc, desc)
- page, limit (max 50)

## Natural Language Parsing

### Supported keywords

Gender: male, males, man, men, boy, boys, guy, guys, female, females, woman, women, girl, girls

Age groups: child, children, teenager, teenagers, adult, adults, senior, seniors

Age ranges:
- "young" → min_age=16, max_age=24
- "above/over X" → min_age=X
- "below/under X" → max_age=X

Countries: nigeria (NG), kenya (KE), ghana (GH), tanzania (TZ), uganda (UG), angola (AO), cameroon (CM), ethiopia (ET), senegal (SN), zimbabwe (ZW), south africa (ZA), ivory coast (CI), mali (ML), benin (BJ), togo (TG), rwanda (RW), zambia (ZM), mozambique (MZ), madagascar (MG), somalia (SO)

### Limitations
- Only 20 countries supported
- No negations ("not from nigeria")
- No multiple countries ("from nigeria or kenya")
- No spelling correction
- English only

## Running Locally

1. Clone the repo
2. Install dependencies: `npm install`
3. Create `.env` file with:
   - DATABASE_URL
   - CLIENT_ID
   - CLIENT_SECRET
   - GITHUB_CALLBACK_URL
   - JWT_SECRET
   - WEB_URL
4. Run seed: `node seed.js`
5. Start server: `node main.js`

## Live URL

https://hng-stage1-backend-production-4bcf.up.railway.app

GET  /api/profiles
GET  /api/profiles?gender=male&country_id=NG
GET  /api/profiles/search?q=young males from nigeria
GET  /api/profiles/export?format=csv
GET  /api/profiles/:id
POST /api/profiles (admin) → success
POST /api/profiles (analyst token) → 403
DELETE /api/profiles/:id (admin) → 204
GET  /api/users/me
POST /auth/refresh
POST /auth/logout