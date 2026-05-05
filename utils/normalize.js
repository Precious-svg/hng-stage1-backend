function normalizeFilter(filters){
    const canonical = {}
    const knownKeys = [
        'age_group',
        'country_id', 
        'gender',
        'max_age',
        'min_age',
        'min_country_probability',
        'min_gender_probability'
    ]
    for (const key of knownKeys) {
        if (filters[key] !== undefined) {
            // normalize string values to lowercase
            if (typeof filters[key] === 'string') {
                canonical[key] = filters[key].toLowerCase()
            } else {
                canonical[key] = filters[key]
            }
        }
    }

    return canonical
}

module.exports = normalizeFilter