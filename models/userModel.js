import mongoose, { model, Schema } from "mongoose";

const UserSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
    },
    picture: {
        type: String,
        default: null
    },
    sessionLimit: {
        type: Number,
        default: 1
    },
    role: {
        type: String,
        enum: ["admin", "technician", "user"],
        default: "user"
    },
    provider: {
        type: String,
        enum: ["google", "email"],
        default: "email"
    }
}, {
    strict: "throw"
})
const User = model("User", UserSchema)
export default User 