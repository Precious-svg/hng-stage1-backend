const pool = require("../db");
const {verifyToken} = require("../auth");

async function authenticate(req, res, next){
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(' ')[1]
    console.log('Auth header:', authHeader ? 'exists' : 'missing')
    console.log('Token:', token ? 'exists' : 'missing')
    try{
        if(!token) return res.status(401).json({
            status: "error",
            message: "Access token required"
        })

        const decoded = verifyToken(token)

        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [decoded.id]
        )

        if(result.rows.length === 0)return res.status(403).json({
            status: "error",
            message: "User not found"
        })

        if(!result.rows[0].is_active) return res.status(403).json({
            status: "error",
            message: "Account is inactive"
        })

        req.user = result.rows[0]
        next()
    }catch(err){
        return res.status(401).json({
            status: 'error',
            message: 'Invalid or expired token'
        })
    }
}

module.exports = authenticate