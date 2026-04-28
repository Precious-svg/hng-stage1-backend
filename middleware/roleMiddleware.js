function requireAdminMiddleware(req, res, next){
    const role = req.user.role
    if(!role || role !== "admin"){
        return res.status(403).json({
            status: "error",
            message: "Admin access required"
        })
    }

    next();
}

module.exports = requireAdminMiddleware;