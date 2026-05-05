const Redis = require("ioredis")
require('dotenv').config()

const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => console.log("Redis connected"))
redis.on("error", (err) => console.log("Redis error:", err.message))


module.exports = redis

