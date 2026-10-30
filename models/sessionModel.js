import { model, Schema } from "mongoose";

const sessionSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId, required: true
    },
    expiresAt: {
        type: Date,
        default: new Date(Date.now() + 1000 * 3600 * 24 * 30),
        expires: 0
    }
})

const Session = model("Session", sessionSchema)

export default Session;