export default function (req, res, next, id) {
    const regexPatternForId = /^[a-fA-F0-9]{24}$/
    if (!regexPatternForId.test(id)) return res.status(400).json({ error: "Invalid id" });
    next()
}