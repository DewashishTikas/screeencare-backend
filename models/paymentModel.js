import { model, Schema } from "mongoose";

const paymentSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order reference is required"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    paymentMethod: {
      type: String,
      required: [true, "Payment method is required"],
      enum: ["cod", "razorpay", "stripe", "upi", "card", "netbanking", "wallet"],
      lowercase: true,
      trim: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    transactionId: {
      type: String,
      default: null,
      trim: true,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Payment = model("Payment", paymentSchema);

export default Payment;
