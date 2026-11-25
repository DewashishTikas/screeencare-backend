import { model, Schema } from "mongoose";

const orderStatusHistorySchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order reference is required"],
      index: true,
    },
    status: {
      type: String,
      required: [true, "Status is required"],
      trim: true,
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: false,
  }
);

const OrderStatusHistory = model("OrderStatusHistory", orderStatusHistorySchema);

export default OrderStatusHistory;
