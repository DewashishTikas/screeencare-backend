import { model, Schema } from "mongoose";

const productSchema = new Schema(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category reference is required (e.g., Tempered Glass or Flip Cover)"],
      index: true,
    },
    phoneModelId: {
      type: Schema.Types.ObjectId,
      ref: "PhoneModel",
      required: [true, "Compatible phone model reference is required"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    image: {
      type: String,
    },
    specifications: {
      type: Schema.Types.Mixed,
      default: {},
    },
    features: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ categoryId: 1, phoneModelId: 1, isActive: 1 });

const Product = model("Product", productSchema);

export default Product;
