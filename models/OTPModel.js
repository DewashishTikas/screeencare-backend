import { model, Schema } from "mongoose";

const otpSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    expiresAt: {
        type: Date,
        default: new Date(Date.now() + 1000 * 60 * 15),
        expires: 0
    },
    otp: {
        type: Number,
        required: true
    }
})

const OTP = model("OTP", otpSchema)

export default OTP;