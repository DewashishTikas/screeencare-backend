import Session from "../models/sessionModel.js";
import User from "../models/userModel.js";

export async function validateUser(req, res, next) {
    const sid = (Buffer.from(req.signedCookies.sid || "", "base64url").toString());
    if (!sid) {
        return res.status(401).json({ error: "Please Login first 3" })
    }
    const session = await Session.findById(sid).lean()
    if (!session) {
        return res.status(401).json({ error: "Please Login first 2" })
    }
    const user = await User.findById(session.userId)
    if (!user) {
        return res.status(401).json({ error: "Please Login first 1" })
    }
    req.user = user
    next()
}

