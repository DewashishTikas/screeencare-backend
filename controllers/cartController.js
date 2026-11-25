import mongoose from "mongoose";
import Cart from "../models/cartModel.js";
import Product from "../models/productModel.js";
import Inventory from "../models/inventoryModel.js";
import Order from "../models/orderModel.js";

/**
 * GET /cart/past-purchases
 * Send information about what the user has purchased before (for reordering / checking compatibility)
 */
export async function getPastPurchases(req, res) {
  try {
    const userId = req.user._id;

    // Fetch past orders that were not cancelled
    const orders = await Order.find({
      userId,
      orderStatus: { $nin: ["cancelled"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    const productMap = new Map();

    for (const order of orders) {
      for (const item of order.items) {
        const prodIdStr = item.productId.toString();
        if (!productMap.has(prodIdStr)) {
          productMap.set(prodIdStr, {
            productId: item.productId,
            productName: item.productNameSnapshot,
            sku: item.skuSnapshot,
            lastPrice: item.unitPrice,
            totalQuantityBought: item.quantity,
            lastPurchasedAt: order.createdAt,
            lastOrderNumber: order.orderNumber,
            purchaseCount: 1,
          });
        } else {
          const record = productMap.get(prodIdStr);
          record.totalQuantityBought += item.quantity;
          record.purchaseCount += 1;
        }
      }
    }

    const pastItems = Array.from(productMap.values());
    const productIds = pastItems.map((p) => p.productId);

    // Fetch current product details and live stock status
    const [currentProducts, inventories] = await Promise.all([
      Product.find({ _id: { $in: productIds } })
        .populate("categoryId", "name")
        .populate("phoneModelId", "name")
        .lean(),
      Inventory.find({ productId: { $in: productIds } }).lean(),
    ]);

    const productDetailsMap = new Map(currentProducts.map((p) => [p._id.toString(), p]));
    const inventoryMap = new Map(inventories.map((inv) => [inv.productId.toString(), inv]));

    const enrichedPurchases = pastItems.map((item) => {
      const liveProduct = productDetailsMap.get(item.productId.toString());
      const inv = inventoryMap.get(item.productId.toString());
      const availableQuantity = inv ? inv.availableQuantity : 0;

      return {
        ...item,
        currentProduct: liveProduct || null,
        stock: {
          inStock: availableQuantity > 0,
          availableQuantity,
          isActive: liveProduct ? liveProduct.isActive : false,
        },
      };
    });

    return res.status(200).json({
      success: true,
      count: enrichedPurchases.length,
      data: enrichedPurchases,
    });
  } catch (error) {
    console.error("Error in getPastPurchases:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /cart
 * Get current user's cart with live stock status for every item
 */
export async function getCart(req, res) {
  try {
    const userId = req.user._id;

    let cart = await Cart.findOne({ userId })
      .populate({
        path: "items.productId",
        populate: [
          { path: "categoryId", select: "name" },
          { path: "phoneModelId", select: "name brandId" },
        ],
      })
      .lean();

    if (!cart) {
      cart = { userId, items: [] };
      return res.status(200).json({
        success: true,
        data: {
          items: [],
          itemCount: 0,
          subtotal: 0,
          allInStock: true,
        },
      });
    }

    const productIds = cart.items
      .map((item) => item.productId?._id)
      .filter(Boolean);

    const inventories = await Inventory.find({ productId: { $in: productIds } }).lean();
    const inventoryMap = new Map(inventories.map((inv) => [inv.productId.toString(), inv]));

    let subtotal = 0;
    let allInStock = true;

    const enrichedItems = cart.items
      .filter((item) => item.productId)
      .map((item) => {
        const product = item.productId;
        const inv = inventoryMap.get(product._id.toString());
        const availableQuantity = inv ? inv.availableQuantity : 0;
        const hasSufficientStock = availableQuantity >= item.quantity;

        if (!hasSufficientStock) {
          allInStock = false;
        }

        const lineTotal = product.price * item.quantity;
        subtotal += lineTotal;

        return {
          productId: product._id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          priceSnapshot: item.priceSnapshot,
          images: product.images,
          category: product.categoryId,
          phoneModel: product.phoneModelId,
          quantity: item.quantity,
          lineTotal,
          stock: {
            availableQuantity,
            inStock: availableQuantity > 0,
            hasSufficientStock,
            isLowStock: inv ? inv.availableQuantity <= (inv.lowStockThreshold || 5) : false,
          },
        };
      });

    return res.status(200).json({
      success: true,
      data: {
        items: enrichedItems,
        itemCount: enrichedItems.reduce((acc, curr) => acc + curr.quantity, 0),
        subtotal,
        allInStock,
      },
    });
  } catch (error) {
    console.error("Error in getCart:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * POST /cart/add
 * Add item to cart after verifying user is logged in and verifying stock availability
 */
export async function addToCart(req, res) {
  try {
    const userId = req.user._id;
    const { productId, quantity = 1 } = req.body;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, error: "Valid productId is required" });
    }

    const reqQty = parseInt(quantity, 10);
    if (isNaN(reqQty) || reqQty < 1) {
      return res.status(400).json({ success: false, error: "Quantity must be at least 1" });
    }

    // 1. Verify product exists & is active
    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found or is currently inactive" });
    }

    // 2. Check stock availability in Inventory
    const inventory = await Inventory.findOne({ productId });
    const availableQuantity = inventory ? inventory.availableQuantity : 0;

    if (!inventory || availableQuantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Product is currently out of stock",
        availableQuantity: 0,
      });
    }

    // 3. Find or create Cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check quantity already in cart
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId.toString()
    );

    const existingQty = existingItemIndex > -1 ? cart.items[existingItemIndex].quantity : 0;
    const totalRequestedQty = existingQty + reqQty;

    if (totalRequestedQty > availableQuantity) {
      return res.status(400).json({
        success: false,
        error: `Only ${availableQuantity} unit(s) available in stock. You already have ${existingQty} in your cart.`,
        availableQuantity,
        currentInCart: existingQty,
      });
    }

    // 4. Update cart
    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity = totalRequestedQty;
      cart.items[existingItemIndex].priceSnapshot = product.price;
    } else {
      cart.items.push({
        productId: product._id,
        quantity: reqQty,
        priceSnapshot: product.price,
      });
    }

    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Item added to cart successfully",
      data: {
        productId: product._id,
        productName: product.name,
        quantity: totalRequestedQty,
        price: product.price,
        availableStock: availableQuantity - totalRequestedQty,
      },
    });
  } catch (error) {
    console.error("Error in addToCart:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * PUT /cart/items/:productId
 * Update quantity of a cart item with stock verification
 */
export async function updateCartItemQuantity(req, res) {
  try {
    const userId = req.user._id;
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, error: "Valid productId is required" });
    }

    const newQty = parseInt(quantity, 10);
    if (isNaN(newQty)) {
      return res.status(400).json({ success: false, error: "Valid quantity is required" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, error: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.productId.toString() === productId.toString()
    );

    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: "Item not in cart" });
    }

    // If new quantity <= 0, remove item
    if (newQty <= 0) {
      cart.items.splice(itemIndex, 1);
      await cart.save();
      return res.status(200).json({
        success: true,
        message: "Item removed from cart",
      });
    }

    // Check stock availability
    const inventory = await Inventory.findOne({ productId });
    const available = inventory ? inventory.availableQuantity : 0;

    if (newQty > available) {
      return res.status(400).json({
        success: false,
        error: `Only ${available} unit(s) available in stock`,
        availableQuantity: available,
      });
    }

    cart.items[itemIndex].quantity = newQty;
    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Cart item updated successfully",
      data: cart.items[itemIndex],
    });
  } catch (error) {
    console.error("Error in updateCartItemQuantity:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * DELETE /cart/items/:productId
 * Remove item from cart
 */
export async function removeCartItem(req, res) {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ success: false, error: "Cart not found" });
    }

    cart.items = cart.items.filter(
      (item) => item.productId.toString() !== productId.toString()
    );

    await cart.save();

    return res.status(200).json({
      success: true,
      message: "Item removed from cart",
    });
  } catch (error) {
    console.error("Error in removeCartItem:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * DELETE /cart
 * Clear all items from cart
 */
export async function clearCart(req, res) {
  try {
    const userId = req.user._id;
    const cart = await Cart.findOne({ userId });
    if (cart) {
      cart.items = [];
      await cart.save();
    }
    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Error in clearCart:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
