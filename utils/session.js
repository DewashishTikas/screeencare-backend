import { Types } from "mongoose";
import Session from "../models/sessionModel.js"

export async function createSession(id) {
    const createdSession = await Session.create({ userId: id })
    return createdSession
}

export async function existSession(sid) {
    const sessionId = (Buffer.from(sid || "", "base64url").toString());
    if (Types.ObjectId.isValid(sessionId)) {
        return (await Session.exists({ _id: sessionId }))
    }
    return false
}

export async function checkLimitSession(userId,sessionLimit) {
    const sessions = await Session.find({ userId })
    if (sessions.length >= sessionLimit) {
        await sessions[0].deleteOne()
    }
}