import mongoose from 'mongoose';
import User from '../models/userModel.js';
import bcrypt from "bcrypt"
import Session from "../models/sessionModel.js";
import { findUserUsingEmail, sendErrorIfLoginWithOtherApp } from '../utils/auth.js';
import { checkLimitSession, existSession } from '../utils/session.js';
import { generateGoogleOAuthUrl, getGoogleIdToken, verifyIDToken } from '../utils/oauth2clientGoogleSetup.js';
import { loginSchema, loginWithGoogleSchema, registerSchema } from '../validator/authValidator.js';
import z from 'zod';
import { sendOTPEmail } from '../utils/sendingEmail.js';
import OTP from '../models/OTPModel.js';

export const sendOTP = async (req, res) => {
    const email = req.email
    const otp = Math.floor(Math.random() * 1000)
    await OTP.insertOne({ email, otp })
    await sendOTPEmail({ otp, subject: "OTP verification", userEmail: email })
    return res.json({ message: "OTP Sent" })
}
export const verifyOTP = async (req, res) => {
    const { otp, email } = req
    const result = await OTP.exists({ email, otp })
    return result ? res.json({ message: "OTP verified" }) : res.json({ message: "OTP do not matched" })
}
export const userDetailController = async (req, res) => {
    const user = req.user
    if (!user) return res.status(401).json({ error: "Unauthorized" })
    return res.status(200).json({ name: user.name, email: user.email, picture: user.picture, role: user.role })
function _unused() {
}




}
export const registerContoller = async (req, res, next) => {

    const sanitizedName = req.body.name
    let { email: emailFromBody, password: passwordFromBody, otp } = req.body
    const validationData = registerSchema.safeParse({ name: sanitizedName, email: emailFromBody, password: passwordFromBody })
    if (validationData?.error) {
        return res.status(400).json({ error: z.flattenError(validationData.error).fieldErrors })
    }
    const { name, email, password } = validationData.data
    const existedDeletedUser = await User.exists({ email, isDeleted: true })
    if (existedDeletedUser) return res.status(403).json({ error: "You are deleted by Admin. Contact Admin" })
    const session = await mongoose.startSession()
    try {
        const userId = new mongoose.Types.ObjectId()

        session.startTransaction()

        const saltAndHashPassword = await bcrypt.hash(password, 12)
        await User.insertOne({
            _id: userId, name, email, password: saltAndHashPassword}, { session })

        await session.commitTransaction()
        res.status(201).json({ message: "Sign up successful" })

    } catch (err) {
        if (err.code === 121) {
            await session.abortTransaction()
            return res.status(400).json({ error: err })
        }
        else if (err.code === 11000 && err.keyValue.email) {
            return res.status(409).json({ error: "User already exists" })
        }
        next(err)

    }
}
export const loginController = async (req, res) => {
    try {
        const validationData = loginSchema.safeParse(req.body)
        if (validationData?.error) {
            return res.status(400).json({ error: z.flattenError(validationData.error).fieldErrors })
        }
        const { email, password } = validationData.data
        const existUser = await User.findOne({
            email
        }).lean()
        if (!existUser) {
            return res.status(401).json({ error: "Login failed" })
        }
        if (existUser.provider !== 'default') return res.status(403).json({ error: "Login through different mode" })
        const comparePwd = await bcrypt.compare(password, existUser.password)

        if (!comparePwd) {
            return res.status(401).json({ error: "Login failed" })
        }

        const sid = (Buffer.from(req.signedCookies.sid || "", "base64url").toString());
        const sessions = await Session.find({ userId: existUser._id })

        if (sessions.length >= existUser.sessionLimit) {
            await sessions[0].deleteOne()
        }
        if (!sid) {
            const createdSession = await Session.create({ userId: existUser._id.toString() })
            res.cookie("sid", `${Buffer.from(createdSession._id).toString('base64url')}`, {
                maxAge: 1000 * 60 * 60 * 24 * 30,
                httpOnly: true,
                secure: false,
                signed: true,
                sameSite: "none"
            })
            return res.status(200).json({ message: "Login Successful", data: { name: existUser.name, email } })
        }
        const sessionFromSid = await Session.findById(sid)
        if (!sessionFromSid) {
            const createdSession = await Session.create({ userId: existUser._id.toString() })
            res.cookie("sid", `${Buffer.from(createdSession._id).toString('base64url')}`, {
                maxAge: 1000 * 60 * 60 * 24 * 30,
                httpOnly: true,
                secure: false,
                signed: true, sameSite: "none"
            })
            return res.status(200).json({ message: "Login Successful", data: { name: existUser.name, email } })
        }
        return res.status(200).json({ message: "Login Successful", data: { name: existUser.name, email } })
    } catch (err) {
        console.log(err);
        return res.status(400).json({ err })
    }
}
export const logoutController = async (req, res) => {
    const { sid } = req.signedCookies
    res.clearCookie("sid")
    if (sid) {
        await Session.deleteOne({ _id: Buffer.from(sid, "base64url").toString() })
    }
    res.status(204).end()
}
export const logoutAllController = async (req, res) => {
    const { user } = req
    await Session.deleteMany({ userId: user.id })
    res.clearCookie('sid')
    res.status(204).end()
}
export const googleImplicitLoginController = async (req, res) => {
    const { idToken } = req.body
    const loginTicket = await verifyIDToken(idToken)
    const sid = (Buffer.from(req.signedCookies.sid || "", "base64url").toString());
    const credential = loginTicket.getPayload()
    const dbSession = await mongoose.startSession()

    try {
        const user = await findUserUsingEmail(credential.email)
        if (user && user.provider === "default") {
            return res.status(403).json({ error: "Enter a password" })
        }

        if (user && mongoose.Types.ObjectId.isValid(sid)) {
            const existedSession = await Session.findById(sid)
            if (!existedSession) {
                const createdSession = await Session.create({ userId: user._id })
                res.cookie("sid", `${Buffer.from(createdSession._id).toString('base64url')}`, {
                    maxAge: 1000 * 60 * 60 * 24 * 30,
                    httpOnly: true,
                    secure: false,
                    signed: true, sameSite: "none"
                })

            }
            return res.json({ message: "Login successfull" })
        }

        if (!user) {
            const userId = new mongoose.Types.ObjectId()
            dbSession.startTransaction()
            const createdSession = await Session.insertOne({ userId }, { session: dbSession })
            await User.insertOne({
                _id: userId, name: credential.name, email: credential.email, picture: credential.picture, provider: "google",

            }, { session: dbSession })

            await dbSession.commitTransaction()
            res.cookie("sid", `${Buffer.from(createdSession._id).toString('base64url')}`, {
                maxAge: 1000 * 60 * 60 * 24 * 30,
                httpOnly: true,
                secure: false,
                signed: true, sameSite: "none"
            })
            return res.json({ message: "Login successfull" })
        } else {
            await checkLimitSession(user._id, user.sessionLimit)
            const createdSession = await Session.create({ userId: user._id })
            res.cookie("sid", `${Buffer.from(createdSession.id).toString('base64url')}`, {
                maxAge: 1000 * 60 * 60 * 24 * 30,
                httpOnly: true,
                secure: false,
                signed: true,
            })

        }

        return res.json({ message: "Login successfull" })
    } catch (error) {
        console.log(error);
        await dbSession.abortTransaction()
        if (error.code === 11000 && error.keyValue.email) {
            return res.status(409).json({ error: "User already exists" })
        }
        return res.status(404).json({ error })
    }
}
export const googleLoginController = async (req, res) => {
    res.redirect(generateGoogleOAuthUrl())
}
export const googleCallbackLoginController = async (req, res) => {
    const { code } = req.query
    const dbSession = await mongoose.startSession()
    try {
        const idToken = await getGoogleIdToken(code)
        const credential = (await verifyIDToken(idToken)).getPayload()
        const validationData = loginWithGoogleSchema.safeParse({ name: credential.name, email: credential.email, picture: credential.picture, sub: credential.sub, iss: credential.iss })
        if (validationData?.error) {
            return res.status(400).json({ error: z.flattenError(validationData.error).fieldErrors })
        }
        const user = await findUserUsingEmail(credential.email)
        if (user && user.provider === "default") {

            return res.redirect(`${process.env.FRONTEND_URL}/auth/login?task=passfail`)
        }

        if (user) {
            const url = sendErrorIfLoginWithOtherApp(user.provider, "google")
            if (url) {
                return res.redirect(url)
            }
            if (!(await existSession(req.signedCookies.sid))) {
                await checkLimitSession(user._id, user.sessionLimit)
                const session = await Session.insertOne({ userId: user._id })
                res.cookie("sid", `${Buffer.from(session._id).toString('base64url')}`, {
                    maxAge: 1000 * 60 * 60 * 24 * 30,
                    httpOnly: true,
                    secure: false,
                    signed: true, sameSite: "none"
                })
            }
            return res.redirect(`${process.env.FRONTEND_URL}/auth/login?task=success`)
        }
        else {
            const userId = new mongoose.Types.ObjectId()

            dbSession.startTransaction()
            const createdSession = await Session.insertOne({ userId }, { session: dbSession })
            await User.insertOne({
                _id: userId, name: credential.name, email: credential.email, picture: credential.picture, provider: "google", 

            }, { session: dbSession })

            await dbSession.commitTransaction()
            res.cookie("sid", `${Buffer.from(createdSession._id).toString('base64url')}`, {
                maxAge: 1000 * 60 * 60 * 24 * 30,
                httpOnly: true,
                secure: false,
                signed: true, sameSite: "none"
            })
            res.redirect(`${process.env.FRONTEND_URL}/auth/login?task=success`)
        }
    } catch (err) {
        if (dbSession.inTransaction()) {
            dbSession.abortTransaction()
        }
        console.log(err);
        res.redirect(`${process.env.FRONTEND_URL}/auth/login?task=fail`)
    }
}
