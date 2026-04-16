# HNG Stage 1 - Name Profile API

A REST API that accepts a name, calls three external APIs, processes the data, stores it in a PostgreSQL database, and exposes endpoints to manage the profiles.

## Tech Stack
- Node.js
- Express
- PostgreSQL (Supabase)
- Axios
- UUID v7

## External APIs Used
- Genderize.io - gender prediction
- Agify.io - age prediction
- Nationalize.io - nationality prediction

## Endpoints

### Create Profile
POST /api/profiles
Body: { "name": "ella" }

### Get All Profiles
GET /api/profiles
Optional filters: ?gender=female&country_id=NG&age_group=adult

### Get Single Profile
GET /api/profiles/:id

### Delete Profile
DELETE /api/profiles/:id

## Running Locally

1. Clone the repo
   git clone https://github.com/yourusername/yourreponame.git
   cd yourreponame

2. Install dependencies
   npm install

3. Create a .env file
   DATABASE_URL=your_supabase_connection_string

4. Run the server
   node main.js

5. Test it
   http://localhost:3000/api/profiles