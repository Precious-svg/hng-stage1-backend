const rateLimit = require('express-rate-limit')

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {status: "error", message: "Too many request"}
})

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: {status: "error", message: "Too many request"}
})

module.exports = {authLimiter, apiLimiter}