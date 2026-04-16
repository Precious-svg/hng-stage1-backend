const express = require("express");
const cors = require("cors");
const axios = require("axios")
const { v7: uuidv7 } = require('uuid')
const pool = require("./db")
require("dotenv").config()

const app = express();

app.use(cors());
app.use(express.json());

// helper functions 
const getAgeGroup = (age) => {
    if(age <= 12) return "child";
    if(age <= 19) return "teenager";
    if(age <= 59) return "adult";
    return "senior";
}

const formatProfile = (row) => {
    return{
        id: row.id,
        name: row.name,
        gender: row.gender,
        gender_probability: row.gender_probability,
        sample_size: row.sample_size,
        age: row.age,
        age_group: row.age_group,
       country_id: row.country_id,
       country_probability: row.country_probability,
       created_at: row.created_at
    }
}

app.post("/api/profiles", async (req, res) => {
  const { name } = req.body
  if(!name || name.trim() === ""){
    return res.status(400).json({
        status: "error",
        message: "Missing or empty name parameter"
    })}

    if(typeof name !== "string"){
        return res.status(422).json({
            status: "error",
            message: "Invalid type"
        })
    }

    const cleanName = name.trim().toLowerCase();

    try{
        const existing = await pool.query(
            'SELECT * FROM profiles WHERE name = $1',
            [cleanName]
        )

        if(existing.rows.length > 0){
            return res.status(200).json({
                status: "success",
                message: "Profile already exists",
                data: formatProfile(existing.rows[0])
            })
        }

    }catch(err){
        return res.status(500).json({
            status: "error",
            message: "Database error"
        })
    }

    // if it doesnt exist call the followin together 
    try{
        const [genderRes, ageRes, nationRes] = await Promise.all([
            axios.get(`https://api.genderize.io?name=${cleanName}`, { timeout: 5000 }),
            axios.get(`https://api.agify.io?name=${cleanName}`, { timeout: 5000 }),
            axios.get(`https://api.nationalize.io?name=${cleanName}`, { timeout: 5000 })
        ])
    
        const genderData = genderRes.data
        const ageData = ageRes.data
        const nationData = nationRes.data
    
        // validate their responses
        if (!genderData.gender || genderData.count === 0) {
            return res.status(502).json({
              status: 'error',
              message: 'Genderize returned an invalid response'
            })
        }
      
          // Validate Agify response
        if (ageData.age === null || ageData.age === undefined) {
            return res.status(502).json({
              status: 'error',
              message: 'Agify returned an invalid response'
            })
        }
      
          // Validate Nationalize response
        if (!nationData.country || nationData.country.length === 0) {
            return res.status(502).json({
              status: 'error',
              message: 'Nationalize returned an invalid response'
            })
        }
    
          // Process the data
        const gender = genderData.gender
        const gender_probability = genderData.probability
        const sample_size = genderData.count
        const age = ageData.age
        const age_group = getAgeGroup(age)
    
        const topCountry = nationData.country.reduce((a, b) =>
            a.probability > b.probability ? a : b
        )
    
        const country_id = topCountry.country_id
        const country_probability = topCountry.probability
    
        const id = uuidv7()
        const created_at = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    
        // Save to database
        await pool.query(
            `INSERT INTO profiles 
              (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, cleanName, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at]
        )

        return res.status(201).json({
            status: 'success',
            data: {
              id,
              name: cleanName,
              gender,
              gender_probability,
              sample_size,
              age,
              age_group,
              country_id,
              country_probability,
              created_at
            }
        })
    }catch(err){
        console.log('API error:', err.message)
        return res.status(502).json({
            status: 'error',
            message: 'Failed to reach upstream API'
        })
    }

    
})
app.get("/api/profiles", async(req, res) => {
    const { gender, country_id, age_group } = req.query

    let query = "SELECT * FROM profiles WHERE 1=1"
    let params = []

    if(gender){
        params.push(gender.toLowerCase())
        query += ` AND LOWER(gender) = $${params.length}`
    }
    if (country_id) {
        params.push(country_id.toLowerCase())
        query += ` AND LOWER(country_id) = $${params.length}`
      }
    
      if (age_group) {
        params.push(age_group.toLowerCase())
        query += ` AND LOWER(age_group) = $${params.length}`
      }
      
    try{
        const result = await pool.query(query, params);
        return res.status(200).json({
            status: 'success',
            count: result.rows.length,
            data: result.rows.map(formatProfile)
        })
    }catch(err){
        return res.status(500).json({
            status: "error",
            message: "Database error"
        })
    }
})

// get a particular profile 
app.get("/api/profiles/:id", async(req, res) => {
    const {id} = req.params
    try{
        const user = await pool.query(
            "SELECT * FROM profiles WHERE id = $1",
            [id]
        )

        if(user.rows.length === 0){
            return res.status(404).json({
                status: "error",
                message: "Profile not found"
            })
        }

        return res.status(200).json({
            status: 'success',
            data: formatProfile(user.rows[0])
        })
    }catch(err){
        return res.status(500).json({
            status: "error",
            message: "Database error"
        })
    }
})

// delete a profile
app.delete("/api/profiles/:id", async(req,res) => {
    const {id} = req.params

    try{
        const result = await pool.query(
            'DELETE FROM profiles WHERE id = $1 RETURNING id',
           [id]
        )
     
        if(result.rows.length === 0){
            return res.status(404).json({
                status: "error",
                message: "Profile not found"
            })
        }

        return res.status(204).send()
    }catch(err){
        return res.status(500).json({
            status: "error",
            message: "Database error"
        })
    }
   
})


const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})