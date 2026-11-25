import mongoose from "mongoose";
import User from "../models/userModel.js";
import Order from "../models/orderModel.js";
import Delivery from "../models/deliveryModel.js";
import Product from "../models/productModel.js";
import Inventory from "../models/inventoryModel.js";
import PhoneBrand from "../models/phoneBrandModel.js";
import PhoneModel from "../models/phoneModelModel.js";
import Category from "../models/categoryModel.js";
import Address from "../models/addressModel.js";

/**
 * -------------------------------------------------------------
 * USER & TECHNICIAN MANAGEMENT
 * -------------------------------------------------------------
 */

/**
 * GET /admin/users
 * List all users with filtering by role and search
 */
export async function getAllUsers(req, res) {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (role) {
      query.role = role;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      User.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      data: users,
    });
  } catch (error) {
    console.error("Error in getAllUsers:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /admin/users/:userId
 * Detailed user information including saved addresses and order history
 */
export async function getUserDetails(req, res) {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("-password").lean();
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const [addresses, orders] = await Promise.all([
      Address.find({ userId }).sort({ isDefault: -1 }).lean(),
      Order.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        user,
        addresses,
        orderStats: {
          totalOrders: orders.length,
          recentOrders: orders,
        },
      },
    });
  } catch (error) {
    console.error("Error in getUserDetails:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /admin/technicians
 * List all technicians with active task counts and workload statistics
 */
export async function getAllTechnicians(req, res) {
  try {
    const technicians = await User.find({ role: { $in: ["technician", "admin"] } })
      .select("-password")
      .lean();

    const technicianIds = technicians.map((t) => t._id);

    // Compute active vs completed tasks per technician
    const orders = await Order.find({
      assignedDeliveryPartnerId: { $in: technicianIds },
    }).select("assignedDeliveryPartnerId orderStatus deliveryStatus");

    const statsMap = new Map();
    technicianIds.forEach((id) => {
      statsMap.set(id.toString(), { activeTasks: 0, completedTasks: 0, totalAssigned: 0 });
    });

    orders.forEach((o) => {
      const idStr = o.assignedDeliveryPartnerId.toString();
      const stat = statsMap.get(idStr);
      if (stat) {
        stat.totalAssigned += 1;
        if (o.deliveryStatus === "delivered" || o.orderStatus === "delivered") {
          stat.completedTasks += 1;
        } else if (o.deliveryStatus !== "failed" && o.orderStatus !== "cancelled") {
          stat.activeTasks += 1;
        }
      }
    });

    const enrichedTechnicians = technicians.map((tech) => ({
      ...tech,
      stats: statsMap.get(tech._id.toString()) || { activeTasks: 0, completedTasks: 0, totalAssigned: 0 },
    }));

    return res.status(200).json({
      success: true,
      count: enrichedTechnicians.length,
      data: enrichedTechnicians,
    });
  } catch (error) {
    console.error("Error in getAllTechnicians:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * -------------------------------------------------------------
 * CATALOG MANAGEMENT
 * -------------------------------------------------------------
 */

/**
 * GET /admin/catalog/summary
 * High-level counts of brands, models, categories, and products
 */
export async function getCatalogSummary(req, res) {
  try {
    const [totalBrands, totalModels, totalCategories, totalProducts, activeProducts] =
      await Promise.all([
        PhoneBrand.countDocuments(),
        PhoneModel.countDocuments(),
        Category.countDocuments(),
        Product.countDocuments(),
        Product.countDocuments({ isActive: true }),
      ]);

    return res.status(200).json({
      success: true,
      data: {
        totalBrands,
        totalModels,
        totalCategories,
        totalProducts,
        activeProducts,
        inactiveProducts: totalProducts - activeProducts,
      },
    });
  } catch (error) {
    console.error("Error in getCatalogSummary:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /admin/catalog/products
 * Full product catalog list with brand, phone model, and category populated
 */
export async function getAdminProducts(req, res) {
  try {
    const { category, phoneModel, isActive, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (category) query.categoryId = category;
    if (phoneModel) query.phoneModelId = phoneModel;
    if (isActive !== undefined) query.isActive = isActive === "true";
    if (search) query.name = { $regex: search.trim(), $options: "i" };

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("categoryId", "name")
        .populate({
          path: "phoneModelId",
          select: "name brandId",
          populate: { path: "brandId", select: "name" },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Product.countDocuments(query),
    ]);

    // Attach current inventory levels
    const productIds = products.map((p) => p._id);
    const inventories = await Inventory.find({ productId: { $in: productIds } }).lean();
    const inventoryMap = new Map(inventories.map((i) => [i.productId.toString(), i]));

    const enriched = products.map((p) => ({
      ...p,
      inventory: inventoryMap.get(p._id.toString()) || null,
    }));

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      data: enriched,
    });
  } catch (error) {
    console.error("Error in getAdminProducts:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * POST /admin/catalog/products
 * Create accessory product (tempered glass or flip cover) and initialize its inventory record
 */
export async function createProduct(req, res) {
  try {
    const {
      categoryId,
      phoneModelId,
      name,
      sku,
      description,
      price,
      images = [],
      specifications = {},
      isActive = true,
      initialQuantity = 0,
      lowStockThreshold = 5,
    } = req.body;

    if (!categoryId || !phoneModelId || !name || !sku || price === undefined) {
      return res.status(400).json({
        success: false,
        error: "categoryId, phoneModelId, name, sku, and price are required",
      });
    }

    const existingSku = await Product.findOne({ sku: sku.trim().toUpperCase() });
    if (existingSku) {
      return res.status(400).json({ success: false, error: "Product with this SKU already exists" });
    }

    const product = new Product({
      categoryId,
      phoneModelId,
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      description: description ? description.trim() : "",
      price: Number(price),
      images,
      specifications,
      isActive,
    });

    await product.save();

    // Auto-create corresponding Inventory record
    const qty = Math.max(0, parseInt(initialQuantity, 10) || 0);
    const inventory = new Inventory({
      productId: product._id,
      quantity: qty,
      reservedQuantity: 0,
      availableQuantity: qty,
      lowStockThreshold: Math.max(0, parseInt(lowStockThreshold, 10) || 5),
    });

    await inventory.save();

    return res.status(201).json({
      success: true,
      message: "Product and inventory created successfully",
      data: {
        product,
        inventory,
      },
    });
  } catch (error) {
    console.error("Error in createProduct:", error);
    return res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
}

/**
 * -------------------------------------------------------------
 * INVENTORY MANAGEMENT
 * -------------------------------------------------------------
 */

/**
 * GET /admin/inventory
 * View full inventory with stock thresholds and low stock indicators
 */
export async function getInventory(req, res) {
  try {
    const { lowStockOnly, page = 1, limit = 20 } = req.query;
    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const [inventories, total] = await Promise.all([
      Inventory.find()
        .populate({
          path: "productId",
          select: "name sku price isActive images categoryId phoneModelId",
          populate: [
            { path: "categoryId", select: "name" },
            { path: "phoneModelId", select: "name" },
          ],
        })
        .sort({ availableQuantity: 1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Inventory.countDocuments(),
    ]);

    let data = inventories.map((inv) => ({
      ...inv,
      isLowStock: inv.availableQuantity <= (inv.lowStockThreshold || 5),
    }));

    if (lowStockOnly === "true") {
      data = data.filter((i) => i.isLowStock);
    }

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      data,
    });
  } catch (error) {
    console.error("Error in getInventory:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * PATCH /admin/inventory/:productId
 * Adjust stock quantity or update low stock threshold
 */
export async function updateInventory(req, res) {
  try {
    const { productId } = req.params;
    const { quantity, addStock, lowStockThreshold } = req.body;

    const inventory = await Inventory.findOne({ productId });
    if (!inventory) {
      return res.status(404).json({ success: false, error: "Inventory record not found for this product" });
    }

    if (addStock !== undefined) {
      const added = parseInt(addStock, 10);
      inventory.quantity += added;
    } else if (quantity !== undefined) {
      inventory.quantity = Math.max(inventory.reservedQuantity, parseInt(quantity, 10));
    }

    if (lowStockThreshold !== undefined) {
      inventory.lowStockThreshold = Math.max(0, parseInt(lowStockThreshold, 10));
    }

    inventory.availableQuantity = Math.max(0, inventory.quantity - inventory.reservedQuantity);
    await inventory.save();

    return res.status(200).json({
      success: true,
      message: "Inventory updated successfully",
      data: inventory,
    });
  } catch (error) {
    console.error("Error in updateInventory:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * -------------------------------------------------------------
 * ALL ORDERS (ADMIN VIEW)
 * -------------------------------------------------------------
 */

/**
 * GET /admin/orders
 * Admin views all orders across the system with user, technician, and delivery details
 */
export async function getAdminOrders(req, res) {
  try {
    const { status, deliveryStatus, customerType, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) query.orderStatus = status;
    if (deliveryStatus) query.deliveryStatus = deliveryStatus;
    if (customerType) query.customerType = customerType;

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("userId", "name email phone")
        .populate("assignedDeliveryPartnerId", "name email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Order.countDocuments(query),
    ]);

    // Attach delivery timing records
    const orderIds = orders.map((o) => o._id);
    const deliveries = await Delivery.find({ orderId: { $in: orderIds } }).lean();
    const deliveryMap = new Map(deliveries.map((d) => [d.orderId.toString(), d]));

    const enriched = orders.map((o) => ({
      ...o,
      deliveryRecord: deliveryMap.get(o._id.toString()) || null,
    }));

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      data: enriched,
    });
  } catch (error) {
    console.error("Error in getAdminOrders:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
