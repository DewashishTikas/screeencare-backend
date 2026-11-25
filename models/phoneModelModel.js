import { model, Schema } from "mongoose";

const phoneModelSchema = new Schema(
  {
    brandId: {
      type: Schema.Types.ObjectId,
      ref: "PhoneBrand",
      required: [true, "Brand reference is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Phone model name is required"],
      trim: true,
    },
    image: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

phoneModelSchema.index({ brandId: 1, name: 1 }, { unique: true });

const PhoneModel = model("PhoneModel", phoneModelSchema);

export default PhoneModel;

