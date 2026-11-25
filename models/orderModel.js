import { model, Schema } from "mongoose";

const orderAddressSnapshotSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, default: "", trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    landmark: { type: String, default: "", trim: true },
    addressType: {
      type: String,
      enum: ["consumer", "business"],
      default: "consumer",
    },
    businessName: { type: String, default: null, trim: true },
    gstin: { type: String, default: null, uppercase: true, trim: true },
    pan: { type: String, default: null, uppercase: true, trim: true },
  },
  { _id: false }
);

const orderItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productNameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    skuSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, "Unit price cannot be negative"],
    },
    totalPrice: {
      type: Number,
      required: true,
      min: [0, "Total price cannot be negative"],
    },
  },
  { _id: true }
);

const orderSchema = new Schema(
  {
    orderNumber: {
      type: String,
      required: [true, "Order number is required"],
      unique: true,
      trim: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },
    customerType: {
      type: String,
      enum: ["consumer", "business", "retail", "wholesale", "b2b", "individual"],
      default: "consumer",
    },
    items: {
      type: [orderItemSchema],
      required: [true, "Order items are required"],
      validate: {
        validator: function (items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: "Order must contain at least one item",
      },
    },
    shippingAddress: {
      type: orderAddressSnapshotSchema,
      required: [true, "Shipping address snapshot is required"],
    },
    billingAddress: {
      type: orderAddressSnapshotSchema,
      required: [true, "Billing address snapshot is required"],
    },
    subtotal: {
      type: Number,
      required: [true, "Subtotal is required"],
      min: [0, "Subtotal cannot be negative"],
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: [0, "Delivery fee cannot be negative"],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, "Discount cannot be negative"],
    },
    tax: {
      type: Number,
      default: 0,
      min: [0, "Tax cannot be negative"],
    },
    grandTotal: {
      type: Number,
      required: [true, "Grand total is required"],
      min: [0, "Grand total cannot be negative"],
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    orderStatus: {
      type: String,
      enum: [
        "placed",
        "confirmed",
        "processing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "returned",
      ],
      default: "placed",
      index: true,
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
    assignedDeliveryPartnerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Order = model("Order", orderSchema);

export default Order;
