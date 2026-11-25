import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import OrderStatusHistory from "../models/orderStatusHistoryModel.js";
import Delivery from "../models/deliveryModel.js";

/**
 * POST /orders
 * Create a new order/booking with shipping address, scheduled slot, and delivery notes
 */
export async function createOrder(req, res) {
  try {
    const userId = req.user._id;
    const {
      items,
      shippingAddress,
      billingAddress,
      deliverySchedule,
      subtotal,
      deliveryFee = 0,
      discount = 0,
      tax = 0,
      grandTotal,
      customerType = "consumer",
    } = req.body;

    const orderNumber = `SC-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const formattedShipping = {
      name: shippingAddress?.name || shippingAddress?.fullName || req.user.name || "Customer",
      phone: shippingAddress?.phone || req.user.phone || "9876543210",
      addressLine1: shippingAddress?.house || shippingAddress?.addressLine1 || "Doorstep Address",
      addressLine2: shippingAddress?.street || shippingAddress?.addressLine2 || "",
      city: shippingAddress?.city || "Bangalore",
      state: shippingAddress?.state || "Karnataka",
      pincode: shippingAddress?.pincode || "560001",
      landmark: shippingAddress?.landmark || "",
      addressType: shippingAddress?.addressType || "consumer",
    };

    const finalBilling = billingAddress || formattedShipping;

    // Build order items
    let orderItems = [];
    if (Array.isArray(items) && items.length > 0) {
      orderItems = items.map((it) => ({
        productId: it.productId || it._id || new mongoose.Types.ObjectId(),
        productNameSnapshot: it.name || it.productName || "Screen Protector",
        skuSnapshot: it.sku || `SKU-${Date.now().toString().slice(-4)}`,
        quantity: it.quantity || 1,
        unitPrice: it.price || it.unitPrice || 449,
        totalPrice: (it.price || it.unitPrice || 449) * (it.quantity || 1),
      }));
    } else {
      orderItems = [
        {
          productId: new mongoose.Types.ObjectId(),
          productNameSnapshot: "ScreenCare Doorstep Protector",
          skuSnapshot: "SC-DEF-001",
          quantity: 1,
          unitPrice: grandTotal || 449,
          totalPrice: grandTotal || 449,
        },
      ];
    }

    const calculatedTotal =
      grandTotal || subtotal || orderItems.reduce((acc, curr) => acc + curr.totalPrice, 0);

    const order = await Order.create({
      orderNumber,
      userId,
      customerType,
      items: orderItems,
      shippingAddress: formattedShipping,
      billingAddress: finalBilling,
      subtotal: subtotal || calculatedTotal,
      deliveryFee,
      discount,
      tax,
      grandTotal: calculatedTotal,
      orderStatus: "confirmed",
      deliveryStatus: "pending",
      paymentStatus: "pending",
    });

    const deliveryNotes = [
      deliverySchedule?.instructions ? `Instructions: ${deliverySchedule.instructions}` : null,
      deliverySchedule?.date ? `Date: ${deliverySchedule.date.full || deliverySchedule.date}` : null,
      deliverySchedule?.slot ? `Slot: ${deliverySchedule.slot.time || deliverySchedule.slot}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    await Delivery.create({
      orderId: order._id,
      deliveryStatus: "pending",
      deliveryNotes: deliveryNotes || "Doorstep technician installation",
    });

    await OrderStatusHistory.create({
      orderId: order._id,
      status: "confirmed",
      note: "Booking confirmed. Technician will visit during scheduled slot.",
      updatedBy: userId,
    });

    return res.status(201).json({
      success: true,
      message: "Order booked successfully",
      data: order,
    });
  } catch (error) {
    console.error("Error in createOrder:", error);
    return res.status(500).json({ success: false, error: "Internal server error creating order" });
  }
}

/**
 * GET /orders
 * Get all orders placed by the logged-in user
 */
export async function getUserOrders(req, res) {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10, status } = req.query;

    const query = { userId };
    if (status) {
      query.orderStatus = status;
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Order.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      data: orders,
    });
  } catch (error) {
    console.error("Error in getUserOrders:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /orders/:orderId
 * Get detailed order view including timeline/history and delivery tracking
 */
export async function getOrderDetails(req, res) {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, userId }).lean();
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const [history, delivery] = await Promise.all([
      OrderStatusHistory.find({ orderId: order._id })
        .sort({ timestamp: 1 })
        .lean(),
      Delivery.findOne({ orderId: order._id }).lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        ...order,
        timeline: history,
        delivery: delivery || null,
      },
    });
  } catch (error) {
    console.error("Error in getOrderDetails:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /orders/:orderId/invoice
 * Formatted invoice data for Consumer vs Business
 */
export async function getOrderInvoice(req, res) {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    const order = await Order.findOne({ _id: orderId, userId }).lean();
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const isBusiness = order.customerType === "business";

    // GST invoice breakdown (CGST 9% + SGST 9% for intra-state or IGST 18% for inter-state)
    const subtotal = order.subtotal;
    const tax = order.tax;
    const cgst = Math.round((tax / 2) * 100) / 100;
    const sgst = Math.round((tax / 2) * 100) / 100;

    const invoiceData = {
      invoiceNumber: `INV-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      customerType: order.customerType,
      billedTo: {
        name: order.billingAddress.name,
        businessName: isBusiness ? order.billingAddress.businessName : null,
        gstin: isBusiness ? order.billingAddress.gstin : null,
        pan: isBusiness ? order.billingAddress.pan : null,
        address: `${order.billingAddress.addressLine1}, ${order.billingAddress.addressLine2 ? order.billingAddress.addressLine2 + ", " : ""}${order.billingAddress.city}, ${order.billingAddress.state} - ${order.billingAddress.pincode}`,
        phone: order.billingAddress.phone,
      },
      shippedTo: {
        name: order.shippingAddress.name,
        address: `${order.shippingAddress.addressLine1}, ${order.shippingAddress.addressLine2 ? order.shippingAddress.addressLine2 + ", " : ""}${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`,
        phone: order.shippingAddress.phone,
      },
      items: order.items.map((item) => ({
        productName: item.productNameSnapshot,
        sku: item.skuSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
      taxBreakdown: {
        taxableAmount: subtotal,
        cgst,
        sgst,
        totalTax: tax,
      },
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      grandTotal: order.grandTotal,
      paymentStatus: order.paymentStatus,
    };

    return res.status(200).json({
      success: true,
      data: invoiceData,
    });
  } catch (error) {
    console.error("Error in getOrderInvoice:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
