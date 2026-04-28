const express = require("express");
const router = express.Router()
const expressRate = require("express-rate-limit");
const axios = require("axios")
const { v7: uuidv7 } = require('uuid')
const pool = require("../db")
const {generateAccessToken, generateRefreshToken} = require("../auth");
const { token } = require("morgan");
require("dotenv").config()


router.get("/github", (req, res) => {
    const isCLI = req.query.cli === 'true'
    const params = new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
        scope: 'user:email',
        state: isCLI ? 'cli' : 'web'
    })

    const url = `https://github.com/login/oauth/authorize?${params}`
    console.log('Redirecting to:', url)
    res.redirect(url)

})

router.get("/github/callback", async (req, res) => {
   const { code, state } = req.query
   const isCLI = state === 'cli'

    if(!code) return res.status(400).json({
        status: "error",
        message: "No code provide"
    })

    try{
        const tokenRes = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
             code,
            redirect_uri: process.env.GITHUB_CALLBACK_URL
         },
         {headers: {Accept: "application/json"}}
        )
        console.log('Token response status:', tokenRes.status)
         console.log('Token response data:', tokenRes.data)

        const githubAccesstoken = tokenRes.data.access_token
        if(!githubAccesstoken) return res.status(401).json({
            status: "error",
            message: "No github token provided"
        })
    
        const userRes = await axios.get("https://api.github.com/user", {
            headers: {Authorization: `Bearer ${githubAccesstoken}`}
        })

        const githubUser = userRes.data

        const existing = await pool.query(
            `SELECT * FROM users WHERE github_id = $1`,
            [String(githubUser.id)]
        )

        let user

        if(existing.rows.length > 0){
            const updated = await pool. query(
                `UPDATE users SET last_login_at = NOW(), avatar_url = $1 
                 WHERE github_id = $2 RETURNING *`, 
                [githubUser.avatar_url, githubUser.id]
            )

            user = updated.rows[0]
        }else{
            const created = await pool.query(
                `INSERT INTO users (id, github_id, username, email, avatar_url, role, is_active, last_login_at)
                 VALUES ($1, $2, $3, $4, $5, 'analyst', true, NOW()) RETURNING *`,
                [
                    uuidv7(),
                    String(githubUser.id),
                    githubUser.login,
                    githubUser.email || '',
                    githubUser.avatar_url

                ]
            )

            user = created.rows[0]
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user)
        // const isCLI = req.query.cli === 'true'

      if (isCLI) {
         return res.redirect(
         `http://localhost:9876/callback?access_token=${accessToken}&refresh_token=${refreshToken}&username=${user.username}`
       )
     }

        return res.status(200).json({
            status: "success",
            access_token: accessToken,
            refresh_token: refreshToken,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        })
    }catch(err){
        console.log(err.message)
        return res.status(500).json({
            status: 'error',
            message: 'Authentication failed'
        })
    }
})

router.post("/refresh", async (req, res) => {
    const {refresh_token} = req.body
    if(!refresh_token) return res.status(400).json({
        status:"error",
        message: "Refresh token required"
    })

   try{
      const existing = await pool.query(
        `SELECT * FROM refresh_tokens where token = $1`,
        [refresh_token]
      )


     if(existing.rows.length === 0) return res.status(401).json({
        sttatus: "error",
        message: "Invalid refresh token"
     })

     if(new Date() > new Date(existing.rows[0].expires_at)){
        await pool.query(
            `DELETE * FROM refresh_tokens WHERE token = $1`,
            [refresh_token]
        )
        return res.status(400).json({ 
            status: "error",
            message: "Invalid or expired token"
         })
      }

      const userResult = await pool.query(
        `SELECT * FROM users WHERE id = $1`,
        [existing.rows[0].user_id]
      )

      const user = userResult.rows[0]
      if (!user.is_active) {
        return res.status(403).json({
            status: 'error',
            message: 'Account is inactive'
        })
    }
      const accessToken = generateAccessToken(user)
      const refreshToken = generateRefreshToken(user)

      return res.status(200).json({
        status: "success",
        refresh_token: refreshToken,
        access_token: accessToken
      })
    }catch(err){
        console.log(err.message)
        return res.status(500).json({
            status: "error",
            message: "Token refresh failed"
       
        })
   }
})


// logout

router.post("/logout", async (req, res) =>{
    const {refresh_token} = req.body
    if(!refresh_token) return res.status(400).json({
        status: "error",
        message: "refresh token required"
    })

    try{
        await pool.query(
            `DELETE * FROM refresh_tokens WHERE token = $1`,
            [refresh_token]
        )

        return res.status(200).json({
            status: "success",
            message: "Logout successfull"
        })
    }catch(err){
        console.log(err.message)
        return res.status(200).json({
            status: "error",
            message: "Logout failed"
        })
    }
})

// delete expired refresh tokens every 10 minutes
setInterval(async () => {
    try {
        await pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()')
        console.log('Cleaned up expired refresh tokens')
    } catch(err) {
        console.log('Cleanup error:', err.message)
    }
}, 10 * 60 * 1000) 

module.exports = router;