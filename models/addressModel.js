import { model, Schema } from "mongoose";

const addressSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Recipient name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    addressLine1: {
      type: String,
      required: [true, "Address line 1 is required"],
      trim: true,
    },
    addressLine2: {
      type: String,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },
    pincode: {
      type: String,
      required: [true, "Pincode is required"],
      trim: true,
    },
    landmark: {
      type: String,
      default: "",
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    addressType: {
      type: String,
      enum: ["consumer", "business"],
      default: "consumer",
    },
    // Business specific details
    businessName: {
      type: String,
      trim: true,
      default: null,
    },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    pan: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook: ensure only one address is default per user
addressSchema.pre("save", async function (next) {
  if (this.isDefault && (this.isModified("isDefault") || this.isNew)) {
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id } },
      { $set: { isDefault: false } }
    );
  }
  next();
});

const Address = model("Address", addressSchema);

export default Address;
