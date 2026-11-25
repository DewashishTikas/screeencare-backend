import { model, Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },
    type: {
      type: String,
      required: [true, "Notification type is required"],
      trim: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
    },
    channel: {
      type: String,
      required: [true, "Notification channel is required"],
      enum: ["email", "WhatsApp", "whatsapp", "sms", "push", "in_app"],
      default: "email",
    },
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "failed", "read"],
      default: "pending",
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
  }
);

const Notification = model("Notification", notificationSchema);

export default Notification;
