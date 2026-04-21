# HNG Stage 2 - Intelligence Query Engine API

A REST API that stores demographic profiles and supports advanced filtering, sorting, pagination, and natural language search.

## Tech Stack
- Node.js
- Express
- PostgreSQL (Supabase)
- Axios
- UUID v7

## Endpoints

### Get All Profiles
GET /api/profiles

Supports filtering, sorting, and pagination:
- gender=male|female
- age_group=child|teenager|adult|senior
- country_id=NG|KE|GH (ISO 2-letter code)
- min_age=20
- max_age=40
- min_gender_probability=0.9
- min_country_probability=0.5
- sort_by=age|created_at|gender_probability
- order=asc|desc
- page=1 (default: 1)
- limit=10 (default: 10, max: 50)

Example:
/api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10

### Natural Language Search
GET /api/profiles/search?q={query}

Parses plain English queries into filters.

Example:
/api/profiles/search?q=young males from nigeria

### Get Single Profile
GET /api/profiles/:id

### Create Profile
POST /api/profiles