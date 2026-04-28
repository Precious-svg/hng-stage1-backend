const express = require("express");
const cors = require("cors");
const morgan = require('morgan')
const authRouter = require('./routes/auth')
const authenticate = require('./middleware/authMiddleware')
const requireAdmin = require('./middleware/roleMiddleware')
const requireApiVersion = require('./middleware/apiVersionMiddleware')
const axios = require("axios")
const { v7: uuidv7 } = require('uuid')
const pool = require("./db");
const { parse } = require("dotenv");
const {authLimiter, apiLimiter} = require("./utils/rateLimiter")
require("dotenv").config()

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'))
app.use("/auth", authLimiter, authRouter)
app.use("/api", apiLimiter, authenticate, requireApiVersion)



// helper functions (profile functions)
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
        age: row.age,
        age_group: row.age_group,
       country_id: row.country_id,
       country_probability: row.country_probability,
       country_name: row.country_name,
       created_at: row.created_at
    }
}

app.post("/api/profiles", requireAdmin, async (req, res) => {
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
        const country_name = topCountry.country_name || ''
    
        const id = uuidv7()
    
        // Save to database
        await pool.query(
            `INSERT INTO profiles 
              (id, name, gender, gender_probability, age, age_group, country_id, country_probability,country_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, cleanName, gender, gender_probability, age, age_group, country_id, country_probability, country_name]
        )

        return res.status(201).json({
            status: 'success',
            data: {
              id,
              name: cleanName,
              gender,
              gender_probability,
              age,
              age_group,
              country_id,
              country_probability,
              country_name,
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
    const { 
        gender, 
        age_group,
        country_id,
        min_age,
        max_age,
        min_gender_probability,
        min_country_probability,
        sort_by,
        order,
        page,
        limit
      } = req.query

      const allowedSortFields = ['age', 'created_at', 'gender_probability']
      const allowedOrders = ['asc', 'desc']

     if (sort_by && !allowedSortFields.includes(sort_by)) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid query parameters'
        })
    }

    if (order && !allowedOrders.includes(order.toLowerCase())) {
        return res.status(400).json({
            status: 'error',
            message: 'Invalid query parameters'
        })
    }

    const pageNum = parseInt(page)|| 1;
    const limitNum = Math.min(parseInt(limit) || 10, 50)
    const offset = (pageNum - 1) * limitNum;

    let query = "SELECT * FROM profiles WHERE 1=1"
    let countQuery = "SELECT COUNT(*) FROM profiles WHERE 1=1"
    let params = []

    if(gender){
        params.push(gender.toLowerCase())
        query += ` AND LOWER(gender) = $${params.length}`
        countQuery += ` AND LOWER(gender) = $${params.length}`
    }
    if (country_id) {
        params.push(country_id.toLowerCase())
        query += ` AND LOWER(country_id) = $${params.length}`
        countQuery += ` AND LOWER(country_id) = $${params.length}`
    }
    
    if (age_group) {
        params.push(age_group.toLowerCase())
        query += ` AND LOWER(age_group) = $${params.length}`
        countQuery += ` AND LOWER(age_group) = $${params.length}`
    }
    if (min_age) {
        params.push(parseInt(min_age))
        query += ` AND age >= $${params.length}`
        countQuery += ` AND age >= $${params.length}`
    }

    if (max_age) {
        params.push(parseInt(max_age))
        query += ` AND age <= $${params.length}`
        countQuery += ` AND age <= $${params.length}`
    }

    if (min_gender_probability) {
        params.push(parseFloat(min_gender_probability))
        query += ` AND gender_probability >= $${params.length}`
        countQuery += ` AND gender_probability >= $${params.length}`
    }

    if (min_country_probability) {
        params.push(parseFloat(min_country_probability))
        query += ` AND country_probability >= $${params.length}`
        countQuery += ` AND country_probability >= $${params.length}`
    }

    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at'
    const sortOrder = order && allowedOrders.includes(order.toLowerCase()) ? order.toUpperCase() : "ASC"
    query += ` ORDER BY ${sortField} ${sortOrder}`
     query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
      
    try{
        const countResults = await pool.query(countQuery, [...params]);
        const total = parseInt(countResults.rows[0].count)
        const result = await pool.query(query, [...params, limitNum, offset]);
        const totalPages = Math.ceil(total/limitNum)
        const baseUrl = "/api/profiles"
        const queryString = Object.entries(req.query)
        .filter(([key]) => key !== page)
        .map(([key, value]) => `${key}=${value}`)
        .join("&")
        const seperator = queryString ? "&" : ''
        console.log('First row:', result.rows[0])
        console.log('sortField:', sortField, 'sortOrder:', sortOrder)
        console.log('Final query:', query)
        return res.status(200).json({
            status: 'success',
            page: pageNum,
            limit: limitNum,
            total,
            total_pages: totalPages,
            links: {
                self: `${baseUrl}?page=${pageNum}&limit=${limitNum}${seperator}${queryString}`,
                next: pageNum < totalPages ? `${baseUrl}?page=${pageNum + 1}&limit=${limitNum}${seperator}${queryString}` : null,
                prev: pageNum > 1 ? `${baseUrl}?page=${pageNum - 1}&limit=${limitNum}${seperator}${queryString}` : null
            },
            data: result.rows.map(formatProfile)
        })
    }catch(err){
        console.log(err.message)
        return res.status(500).json({
            status: "error",
            message: "Database error"
        })
    }
})
// natural search

app.get("/api/profiles/search", async(req, res) => {
    const { q, page, limit } = req.query

    if (!q || q.trim() === '') {
        return res.status(400).json({
            status: 'error',
            message: 'Missing or empty query'
        })
    }

    const query = q.toLowerCase().trim();
    let filters = {}
    // detect gender word

    const maleWords = ["guy", "guys", "boy", "boys", "man", "men", "male", "males"]
    const femaleWords = ["girl", "woman", "women", "female", "females", "madam", "girls"]
    if (femaleWords.some(word => query.includes(word))) {
        filters.gender = 'female'
    } else if (maleWords.some(word => query.includes(word))) {
        filters.gender = 'male'
    }
    // country map
    const countryMap = {
        "nigeria": "NG",
        "kenya": "KE",
        "ghana": "GH",
        "tanzania": "TZ",
        "uganda": "UG",
        "angola": "AO",
        "cameroon": "CM",
        "ethiopia": "ET",
        "senegal": "SN",
        "zimbabwe": "ZW",
        "south africa": "ZA",
        "ivory coast": "CI",
        "mali": "ML",
        "benin": "BJ",
        "togo": "TG",
        "rwanda": "RW",
        "zambia": "ZM",
        "mozambique": "MZ",
        "madagascar": "MG",
        "somalia": "SO"
    }


    // detect age group
    if (query.includes('child') || query.includes('children')) filters.age_group = 'child'
    if (query.includes('teenager') || query.includes('teenagers')) filters.age_group = 'teenager'
    if (query.includes('adult') || query.includes('adults')) filters.age_group = 'adult'
    if (query.includes('senior') || query.includes('seniors')) filters.age_group = 'senior'

    if (query.includes('young')) {
        filters.min_age = 16
        filters.max_age = 24
    }

    const aboveMatch = query.match(/(?:above|over|older)[^0-9]*(\d+)/)
    if (aboveMatch) filters.min_age = parseInt(aboveMatch[1]);

    const belowMatch = query.match(/(?:below|under|younger)[^0-9]*(\d+)/);
    if (belowMatch) filters.max_age = parseInt(belowMatch[1]);

    for(const [country, countryCode ] of Object.entries(countryMap)){
        if(query.includes(country)){
            filters.country_id = countryCode
        }
    }

    // if the filter doesnt return anything
    if(Object.entries(filters).length === 0){
        return res.status(400).json({
            status: "error",
            message: "Unable to interpret query"
        })
    }
  
    // pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 10, 50);
    const offset = (pageNum - 1 ) * limitNum

    // BUILD THE QUERY
    let sqlQuery = "SELECT * FROM profiles WHERE 1=1"
    let countQuery = "SELECT COUNT(*) FROM profiles WHERE 1=1"
    let params = []

    if(filters.gender){
        params.push(filters.gender);
        sqlQuery += ` AND LOWER(gender) = $${params.length}`
        countQuery += ` AND LOWER(gender) = $${params.length}`
    }

    if(filters.age_group){
        params.push(filters.age_group);
        sqlQuery += ` AND LOWER(age_group) = $${params.length}`
        countQuery += ` AND LOWER(age_group) = $${params.length}`
    }

    if(filters.country_id){
        params.push(filters.country_id)
        sqlQuery += ` AND (country_id) = $${params.length}`
        countQuery += ` AND (country_id) = $${params.length}`
    }

    if(filters.min_age){
        params.push(filters.min_age);
        sqlQuery += ` AND (age) >= $${params.length}`
        countQuery += ` AND (age) >= $${params.length}`
    }

    if(filters.max_age){
        params.push(filters.max_age)
        sqlQuery += ` AND (age) <= $${params.length}`
        countQuery += ` AND (age) <= $${params.length}`
    }

    sqlQuery += ` ORDER BY created_at ASC`
    sqlQuery += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`

    try{
        const countResult = await pool.query(countQuery, [...params])
        const total = parseInt(countResult.rows[0].count)
        const result = await pool.query(sqlQuery, [...params, limitNum, offset]);
        const baseUrl = "/api/profiles/search"
        const encoded = encodeURIComponent(q)
        const totalPages = Math.ceil(total/limitNum)
        return res.status(200).json({
            status: "success",
            page: pageNum,
            limit: limitNum,
            total,
            total_pages: totalPages,
            links: {
                self: `${baseUrl}?q=${encoded}&page=${pageNum}&limit=${limitNum}`,
                next: pageNum < totalPages ? `${baseUrl}?q=${encoded}&page=${pageNum + 1}&limit=${limitNum}` : null,
                prev: pageNum > 1 ?  `${baseUrl}?q=${encoded}&page=${pageNum - 1}&limit=${limitNum}`: null
            },
            data: result.rows.map(formatProfile)
        })
    }catch(err){
        console.log(err.message)
        return res.status(500).json({
            status: "error",
            message: "Database error"
        })
    }
})

// export profiles in csv fiormat
app.get("/api/profiles/export", async(req, res) => {
    const {
        format,
        gender, 
        age_group,
        country_id,
        min_age,
        max_age,
        min_gender_probability,
        min_country_probability,
        sort_by,
        order,
        page,
        limit
    } = req.query
    const allowedSortFields =  ['age', 'created_at', 'gender_probability']
    const allowedOrders = ["asc", "desc"]

    if(!format || format !== "csv") return res.status(400).json({
        status: "error",
        message: "Invalid or missing format parameter. Use format=csv"
    })

    let query = "SELECT * FROM profiles WHERE 1=1"
    const params = []

    if (gender) {
        params.push(gender.toLowerCase())
        query += ` AND LOWER(gender) = $${params.length}`
    }

    if (country_id) {
        params.push(country_id.toUpperCase())
        query += ` AND country_id = $${params.length}`
    }

    if (age_group) {
        params.push(age_group.toLowerCase())
        query += ` AND LOWER(age_group) = $${params.length}`
    }

    if (min_age) {
        params.push(parseInt(min_age))
        query += ` AND age >= $${params.length}`
    }

    if (max_age) {
        params.push(parseInt(max_age))
        query += ` AND age <= $${params.length}`
    }

    if (min_gender_probability) {
        params.push(parseFloat(min_gender_probability))
        query += ` AND gender_probability >= $${params.length}`
    }

    if (min_country_probability) {
        params.push(parseFloat(min_country_probability))
        query += ` AND country_probability >= $${params.length}`
    }
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at'
    const sortOrder = order && allowedOrders.includes(order.toLowerCase()) ? order.toUpperCase() : 'ASC'
    query += ` ORDER BY ${sortField} ${sortOrder}`

    try{
        const result = await pool.query(query, params)

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `profiles_${timestamp}.csv`

        // build csv
        const headers = 'id,name,gender,gender_probability,age,age_group,country_id,country_name,country_probability,created_at'
        
        const rows = result.rows.map(row => 
            `${row.id},${row.name},${row.gender},${row.gender_probability},${row.age},${row.age_group},${row.country_id},${row.country_name},${row.country_probability},${row.created_at}`
        ).join('\n')

        const csv = `${headers}\n${rows}`
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        return res.status(200).send(csv)
    }catch(err){
        console.log(err.message)
        return res.status(500).json({
            status: 'error',
            message: 'Export failed'
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
app.delete("/api/profiles/:id", requireAdmin, async(req,res) => {
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