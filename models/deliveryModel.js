import { model, Schema } from "mongoose";

const deliverySchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order reference is required"],
      unique: true,
      index: true,
    },
    deliveryPartnerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    pickupTime: {
      type: Date,
      default: null,
    },
    outForDeliveryTime: {
      type: Date,
      default: null,
    },
    deliveredTime: {
      type: Date,
      default: null,
    },
    failedTime: {
      type: Date,
      default: null,
    },
    deliveryStatus: {
      type: String,
      enum: [
        "pending",
        "assigned",
        "picked_up",
        "out_for_delivery",
        "delivered",
        "failed",
        "returned",
      ],
      default: "pending",
      index: true,
    },
    deliveryNotes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Delivery = model("Delivery", deliverySchema);

export default Delivery;
