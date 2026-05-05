const express = require('express')
const router = express.Router()
const multer = require('multer')
const csv = require('csv-parser')
const { v7: uuidv7 } = require('uuid')
const pool = require('../db')
const redis = require('../redis')
const { resolve } = require('path')
const { rejects } = require('assert')

// store file in memory temporarily
const upload = multer({ storage: multer.memoryStorage() })

function validateRow(row) {
    const errors = []

    // check required fields
    if (!row.name || row.name.trim() === '') return ['missing_fields']
    if (!row.gender || row.gender.trim() === '') return ['missing_fields']
    if (!row.age) return ['missing_fields']
    if (!row.country_id) return ['missing_fields']

    // validate gender
    if (row.gender && !['male', 'female'].includes(row.gender.toLowerCase())) {
        return ['invalid_gender']
    }

    // validate age
    const age = parseInt(row.age)
    if (isNaN(age) || age < 0 || age > 150) {
        return ['invalid_age']
    }

    return []
}
function getAgeGroup(age) {
    if (age <= 12) return 'child'
    if (age <= 19) return 'teenager'
    if (age <= 59) return 'adult'
    return 'senior'
}

router.post('/upload', upload.single('file'), async (req, res) => {
    if(!req.file){
        return res.status(400).json({
            status: 'error',
            message: 'No file uploaded'
        })
    }

    const results = {
        total_rows: 0,
        inserted: 0,
        skipped: 0,
        reasons: {
            duplicate_name: 0,
            invalid_age: 0,
            invalid_gender: 0,
            missing_fields: 0,
            malformed_row: 0
        }
    }

    const CHUNK_SIZE = 1000
    let chunk = []
  

    const processChunk = async(rows) => {
        const names = rows.map(r => r.name.trim().toLowerCase())
        const existingResult = await pool.query(
            `SELECT name FROM profiles WHERE name = ANY($1)`,
            [names]
        )

        const existingNames = new Set(existingResult.rows.map(r => r.name))
        console.log('Existing names found:', existingResult.rows)
        const toInsert = []
        const seenInChunk = new Set()
        
        for (const row of rows) {
            const name = row.name.trim().toLowerCase()

            if (existingNames.has(name) || seenInChunk.has(name)) {
                results.skipped++
                results.reasons.duplicate_name++
                continue
            }
    
            seenInChunk.add(name)  // mark as seen
            toInsert.push({
                id: uuidv7(),
                name,
                gender: row.gender.toLowerCase(),
                gender_probability: parseFloat(row.gender_probability) || 0,
                age: parseInt(row.age),
                age_group: getAgeGroup(parseInt(row.age)),
                country_id: row.country_id.toUpperCase(),
                country_name: row.country_name || '',
                country_probability: parseFloat(row.country_probability) || 0
            })
        }

        if (toInsert.length === 0) return
         // bulk insert using unnest
         const ids = toInsert.map(r => r.id)
         const names2 = toInsert.map(r => r.name)
         const genders = toInsert.map(r => r.gender)
         const gender_probs = toInsert.map(r => r.gender_probability)
         const ages = toInsert.map(r => r.age)
         const age_groups = toInsert.map(r => r.age_group)
         const country_ids = toInsert.map(r => r.country_id)
         const country_names = toInsert.map(r => r.country_name)
        const country_probs = toInsert.map(r => r.country_probability)

        await pool.query(`
            INSERT INTO profiles 
                (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability)
            SELECT * FROM unnest(
                $1::text[], $2::text[], $3::text[], $4::float[], 
                $5::int[], $6::text[], $7::text[], $8::text[], $9::float[]
            )
            ON CONFLICT (name) DO NOTHING
        `, [ids, names2, genders, gender_probs, ages, age_groups, country_ids, country_names, country_probs])

        results.inserted += toInsert.length
    }    

        // parse CSV from buffer using stream
         const { Readable } = require('stream')
         const stream = Readable.from(req.file.buffer)

         await new Promise((resolve, reject) => {
             stream
             .pipe(csv({
                headers: ['name', 'gender', 'gender_probability', 'age', 'age_group', 'country_id', 'country_name', 'country_probability'],
                skipLines: 1
             }))
             .on('data', (row) => {
                if (!row.name || row.name.trim() === '' || row.name.trim().toLowerCase() === 'name') return
                console.log('Row received:', row)
                 results.total_rows++
                 // validate row
                 const errors = validateRow(row)
                 if (errors.length > 0) {
                    results.skipped++
                    errors.forEach(e => {
                        if (results.reasons[e] !== undefined) {
                            results.reasons[e]++
                        }
                    })
                    return
                 }

                 chunk.push(row)
              })
              .on('end', async() => {
                // process remaining rows
                try {
                    if (chunk.length > 0) {
                        await processChunk(chunk)
                    }
                    const keys = await redis.keys('profiles:*')
                    if (keys.length > 0) await redis.del(keys)
                    resolve()
                } catch(err) {
                    reject(err)
                }
                 // invalidate cache
                 const keys = await redis.keys('profiles:*')
                 if (keys.length > 0) await redis.del(keys)
 
                 resolve()
              })
              .on('error', reject)
          })
          return res.status(200).json({
            status: 'success',
            total_rows: results.total_rows,
            inserted: results.inserted,
            skipped: results.skipped,
            reasons: results.reasons
        })
})

module.exports = router