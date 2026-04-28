function apiVersionMiddleWare(req, res, next){
    const version = req.headers["x-api_version"]
    if(!version) return res.status(400).json({
        status: "error",
        message: "API version header required"
    });

    next()
}

module.exports = apiVersionMiddleWare