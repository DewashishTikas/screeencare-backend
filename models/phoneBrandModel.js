import { model, Schema } from "mongoose";

const phoneBrandSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Brand name is required"],
      trim: true,
      unique: true,
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

const PhoneBrand = model("PhoneBrand", phoneBrandSchema);

export default PhoneBrand;
