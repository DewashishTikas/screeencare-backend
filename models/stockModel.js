import { model, Schema } from "mongoose";

const stockSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"],
      unique: true,
      index: true,
    },
    categoryType: {
      type: String,
      enum: ["tempered-glass", "flip-cover", "other"],
      default: "tempered-glass",
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0, "Quantity cannot be negative"],
      default: 15,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
    },
    status: {
      type: String,
      enum: ["in_stock", "low_stock", "out_of_stock"],
      default: "in_stock",
    },
  },
  {
    timestamps: true,
  }
);

stockSchema.pre("save", function (next) {
  if (this.quantity <= 0) {
    this.status = "out_of_stock";
  } else if (this.quantity < (this.lowStockThreshold || 10)) {
    this.status = "low_stock";
  } else {
    this.status = "in_stock";
  }
  next();
});

const Stock = model("Stock", stockSchema);

export default Stock;
