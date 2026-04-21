const pool = require("./db")
const {v7:  uuidv7} = require("uuid");
const fs = require("fs")
require("dotenv").config();

const data = JSON.parse(fs.readFileSync("./mockData/profiles.json", "utf8"))


const profiles = data.profiles

const seedProfiles = async() => {
    console.log(`seeding ${profiles.length} profiles`)


    for (const profile of profiles){
        const id = uuidv7();
        const existing = await pool.query('SELECT id FROM profiles WHERE name = $1', [profile.name])
        if (existing.rows.length > 0) continue
        try{
            await pool.query(
                `INSERT INTO profiles 
                  (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability)
                  values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `,
                [id, 
                  profile.name,
                  profile.gender,
                  profile.gender_probability,
                  profile.age,
                  profile.age_group,
                  profile.country_id,
                  profile.country_name,
                  profile.country_probability
                ]
            )
        }catch(err){
            console.log('Insert error for', profile.name, ':', err.message)
        }

        
    }

    console.log('Seeding complete!')
   process.exit(0)
}

seedProfiles();