import { model, Schema } from "mongoose";

const inventorySchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: [true, "Product reference is required"],
      unique: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, "Total quantity is required"],
      min: [0, "Quantity cannot be negative"],
      default: 0,
    },
    reservedQuantity: {
      type: Number,
      min: [0, "Reserved quantity cannot be negative"],
      default: 0,
      validate: {
        validator: function (val) {
          return val <= this.quantity;
        },
        message: "Reserved quantity cannot exceed total quantity",
      },
    },
    availableQuantity: {
      type: Number,
      min: [0, "Available quantity cannot be negative"],
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      min: [0, "Low stock threshold cannot be negative"],
      default: 5,
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-derive availableQuantity before saving
inventorySchema.pre("save", function (next) {
  this.availableQuantity = Math.max(0, (this.quantity || 0) - (this.reservedQuantity || 0));
  next();
});

// Auto-derive availableQuantity on findOneAndUpdate
inventorySchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (!update) return next();

  const quantity = update.quantity ?? update.$set?.quantity;
  const reservedQuantity = update.reservedQuantity ?? update.$set?.reservedQuantity;

  if (quantity !== undefined && reservedQuantity !== undefined) {
    const available = Math.max(0, quantity - reservedQuantity);
    if (update.$set) {
      update.$set.availableQuantity = available;
    } else {
      update.availableQuantity = available;
    }
  }
  next();
});

// Virtual for real-time calculation
inventorySchema.virtual("isLowStock").get(function () {
  return this.availableQuantity <= this.lowStockThreshold;
});

const Inventory = model("Inventory", inventorySchema);

export default Inventory;
