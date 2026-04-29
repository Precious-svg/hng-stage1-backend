function apiVersionMiddleWare(req, res, next){
    const version = req.headers["x-api-version"]
    console.log('API version header:', version)
    if(!version) return res.status(400).json({
        status: "error",
        message: "API version header required"
    });

    next()
}

module.exports = apiVersionMiddleWare