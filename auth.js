const jwt = require("jsonwebtoken")
const pool = require("../db")
const { v7: uuidv7 } = require('uuid')
require("dotenv").config()

const JWT_SECRET = process.env.JWT_SECRET

function generateAccessToken (user) {
    return jwt.sign(
        {id: user.id, role: user.role, username: user.username},
        JWT_SECRET,
        {expiresIn: "3m"}
    )
}

function generateRefreshToken(user)  {
    return jwt.sign(
        {id: user.id, role: user.role, username: user.username},
        JWT_SECRET,
        {expiresIn: "5m"}
    )
}

 function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET)
}

async function storeRefreshToken(userId, token){
    await pool.query(
        `INSERT INTO refresh_tokens (id, user_id, token, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
         [uuidv7(), userId, token]
    )
}

async function invalidateToken(token){
    await pool.delete(
        `'DELETE FROM refresh_tokens WHERE token = $1',`,
        [token]
    )
}

module.exports = {generateAccessToken, generateRefreshToken, verifyToken, storeRefreshToken, invalidateToken}