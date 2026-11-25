import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import Delivery from "../models/deliveryModel.js";
import OrderStatusHistory from "../models/orderStatusHistoryModel.js";
import Notification from "../models/notificationModel.js";
import User from "../models/userModel.js";
import Inventory from "../models/inventoryModel.js";
import {
  sendTechnicianAssignmentWhatsApp,
  sendCustomerOrderStatusWhatsApp,
} from "../utils/whatsappService.js";

/**
 * POST /delivery/assign
 * Admin assigns an order to a technician or delivery partner
 */
export async function assignDeliveryPartner(req, res) {
  try {
    const adminId = req.user._id;
    const { orderId, deliveryPartnerId, notes } = req.body;

    if (!orderId || !deliveryPartnerId) {
      return res.status(400).json({
        success: false,
        error: "orderId and deliveryPartnerId are required",
      });
    }

    const [order, partner] = await Promise.all([
      Order.findById(orderId),
      User.findOne({ _id: deliveryPartnerId, role: { $in: ["technician", "admin"] } }),
    ]);

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    if (!partner) {
      return res.status(404).json({
        success: false,
        error: "Delivery partner / technician not found or does not have appropriate role",
      });
    }

    if (order.orderStatus === "cancelled" || order.orderStatus === "delivered") {
      return res.status(400).json({
        success: false,
        error: `Cannot assign order with current status: ${order.orderStatus}`,
      });
    }

    // 1. Update Order
    order.assignedDeliveryPartnerId = partner._id;
    order.deliveryStatus = "assigned";
    if (order.orderStatus === "placed" || order.orderStatus === "confirmed") {
      order.orderStatus = "processing";
    }
    await order.save();

    // 2. Create or update Delivery document
    const delivery = await Delivery.findOneAndUpdate(
      { orderId: order._id },
      {
        orderId: order._id,
        deliveryPartnerId: partner._id,
        deliveryStatus: "assigned",
        deliveryNotes: notes || `Assigned to ${partner.name}`,
      },
      { upsert: true, new: true }
    );

    // 3. Log to OrderStatusHistory
    await OrderStatusHistory.create({
      orderId: order._id,
      status: "assigned",
      changedBy: adminId,
      notes: `Order assigned to ${partner.name} (${partner.role}). ${notes || ""}`.trim(),
    });

    // 4. Notify Technician / Delivery Person
    await Notification.create({
      userId: partner._id,
      type: "order_assigned",
      title: "New Delivery/Task Assigned",
      message: `You have been assigned to Order #${order.orderNumber}. Shipping to ${order.shippingAddress.city}, ${order.shippingAddress.pincode}.`,
      channel: "email",
      metadata: { orderId: order._id, orderNumber: order.orderNumber },
    });

    // 5. Notify Customer
    await Notification.create({
      userId: order.userId,
      type: "order_assigned",
      title: "Technician/Delivery Assigned",
      message: `Your Order #${order.orderNumber} has been assigned to ${partner.name}.`,
      channel: "email",
      metadata: { orderId: order._id, partnerName: partner.name },
    });

    // 6. Send Meta WhatsApp notifications to Technician
    await sendTechnicianAssignmentWhatsApp({
      technicianPhone: partner.phone,
      technicianName: partner.name,
      order,
    });

    return res.status(200).json({
      success: true,
      message: "Order successfully assigned to delivery partner/technician",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        assignedPartner: {
          id: partner._id,
          name: partner.name,
          email: partner.email,
          role: partner.role,
        },
        deliveryStatus: order.deliveryStatus,
        orderStatus: order.orderStatus,
        delivery,
      },
    });
  } catch (error) {
    console.error("Error in assignDeliveryPartner:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /delivery/my-orders
 * Get orders assigned to the logged-in technician/delivery person
 */
export async function getMyAssignedOrders(req, res) {
  try {
    const partnerId = req.user._id;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { assignedDeliveryPartnerId: partnerId };
    if (status) {
      query.deliveryStatus = status;
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Order.countDocuments(query),
    ]);

    // Attach delivery timing details
    const orderIds = orders.map((o) => o._id);
    const deliveries = await Delivery.find({ orderId: { $in: orderIds } }).lean();
    const deliveryMap = new Map(deliveries.map((d) => [d.orderId.toString(), d]));

    const enrichedOrders = orders.map((o) => ({
      ...o,
      deliveryDetails: deliveryMap.get(o._id.toString()) || null,
    }));

    return res.status(200).json({
      success: true,
      total,
      page: parseInt(page, 10),
      totalPages: Math.ceil(total / parseInt(limit, 10)),
      data: enrichedOrders,
    });
  } catch (error) {
    console.error("Error in getMyAssignedOrders:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * PATCH /delivery/orders/:orderId/pickup
 * State change: Technician/Delivery person picks up product to send/dispatch
 */
export async function pickupOrder(req, res) {
  try {
    const partnerId = req.user._id;
    const { orderId } = req.params;
    const { notes } = req.body;

    const filter = req.user.role === "admin"
      ? { _id: orderId }
      : { _id: orderId, assignedDeliveryPartnerId: partnerId };

    const order = await Order.findOne(filter);
    if (!order) {
      return res.status(404).json({ success: false, error: "Assigned order not found" });
    }

    if (order.orderStatus === "cancelled" || order.orderStatus === "delivered") {
      return res.status(400).json({
        success: false,
        error: `Cannot pickup order with status ${order.orderStatus}`,
      });
    }

    const now = new Date();

    // Update Delivery
    const delivery = await Delivery.findOneAndUpdate(
      { orderId: order._id },
      {
        pickupTime: now,
        deliveryStatus: "picked_up",
        deliveryNotes: notes || "Product picked up and dispatched",
      },
      { upsert: true, new: true }
    );

    // Update Order state
    order.deliveryStatus = "picked_up";
    order.orderStatus = "shipped";
    await order.save();

    // Log status history
    await OrderStatusHistory.create({
      orderId: order._id,
      status: "picked_up",
      changedBy: partnerId,
      notes: notes || "Product picked up from inventory and dispatched",
    });

    // Notify customer
    await Notification.create({
      userId: order.userId,
      type: "order_shipped",
      title: "Product Picked Up & Dispatched",
      message: `Your Order #${order.orderNumber} has been picked up by the delivery partner and is on its way.`,
      channel: "email",
      metadata: { orderId: order._id, pickupTime: now },
    });

    // Send Meta WhatsApp to customer
    await sendCustomerOrderStatusWhatsApp({
      customerPhone: order.shippingAddress.phone,
      customerName: order.shippingAddress.name,
      order,
      eventType: "picked_up",
    });

    return res.status(200).json({
      success: true,
      message: "Order marked as picked up / dispatched",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryStatus: order.deliveryStatus,
        orderStatus: order.orderStatus,
        delivery,
      },
    });
  } catch (error) {
    console.error("Error in pickupOrder:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * PATCH /delivery/orders/:orderId/out-for-delivery
 * State change: Out for delivery to customer address
 */
export async function outForDelivery(req, res) {
  try {
    const partnerId = req.user._id;
    const { orderId } = req.params;
    const { notes } = req.body;

    const filter = req.user.role === "admin"
      ? { _id: orderId }
      : { _id: orderId, assignedDeliveryPartnerId: partnerId };

    const order = await Order.findOne(filter);
    if (!order) {
      return res.status(404).json({ success: false, error: "Assigned order not found" });
    }

    if (order.orderStatus === "cancelled" || order.orderStatus === "delivered") {
      return res.status(400).json({
        success: false,
        error: `Cannot update order with status ${order.orderStatus}`,
      });
    }

    const now = new Date();

    const delivery = await Delivery.findOneAndUpdate(
      { orderId: order._id },
      {
        outForDeliveryTime: now,
        deliveryStatus: "out_for_delivery",
        deliveryNotes: notes || "Out for delivery to recipient",
      },
      { upsert: true, new: true }
    );

    order.deliveryStatus = "out_for_delivery";
    order.orderStatus = "out_for_delivery";
    await order.save();

    await OrderStatusHistory.create({
      orderId: order._id,
      status: "out_for_delivery",
      changedBy: partnerId,
      notes: notes || "Out for delivery to customer destination",
    });

    await Notification.create({
      userId: order.userId,
      type: "out_for_delivery",
      title: "Out For Delivery",
      message: `Your Order #${order.orderNumber} is out for delivery today.`,
      channel: "WhatsApp",
      metadata: { orderId: order._id, outForDeliveryTime: now },
    });

    // Send Meta WhatsApp to customer
    await sendCustomerOrderStatusWhatsApp({
      customerPhone: order.shippingAddress.phone,
      customerName: order.shippingAddress.name,
      order,
      eventType: "out_for_delivery",
      additionalInfo: req.user.name,
    });

    return res.status(200).json({
      success: true,
      message: "Order marked as out for delivery",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryStatus: order.deliveryStatus,
        orderStatus: order.orderStatus,
        delivery,
      },
    });
  } catch (error) {
    console.error("Error in outForDelivery:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * PATCH /delivery/orders/:orderId/complete
 * Order Completed Endpoint: Mark order as delivered / service completed
 */
export async function completeOrder(req, res) {
  try {
    const partnerId = req.user._id;
    const { orderId } = req.params;
    const { notes, podProof } = req.body;

    const filter = req.user.role === "admin"
      ? { _id: orderId }
      : { _id: orderId, assignedDeliveryPartnerId: partnerId };

    const order = await Order.findOne(filter);
    if (!order) {
      return res.status(404).json({ success: false, error: "Assigned order not found" });
    }

    if (order.orderStatus === "delivered") {
      return res.status(200).json({
        success: true,
        message: "Order is already marked as completed",
        data: order,
      });
    }

    if (order.orderStatus === "cancelled") {
      return res.status(400).json({
        success: false,
        error: "Cannot complete an order that has been cancelled",
      });
    }

    const now = new Date();

    const delivery = await Delivery.findOneAndUpdate(
      { orderId: order._id },
      {
        deliveredTime: now,
        deliveryStatus: "delivered",
        deliveryNotes: notes || (podProof ? `Delivered with POD: ${podProof}` : "Order delivered successfully"),
      },
      { upsert: true, new: true }
    );

    order.deliveryStatus = "delivered";
    order.orderStatus = "delivered";

    // If COD order, mark payment as paid upon completion
    if (order.paymentStatus === "pending") {
      order.paymentStatus = "paid";
    }

    await order.save();

    await OrderStatusHistory.create({
      orderId: order._id,
      status: "delivered",
      changedBy: partnerId,
      notes: notes || "Order and delivery completed successfully",
    });

    await Notification.create({
      userId: order.userId,
      type: "order_delivered",
      title: "Order Delivered / Completed",
      message: `Your Order #${order.orderNumber} has been delivered successfully. Thank you for shopping with ScreenCare!`,
      channel: "email",
      metadata: { orderId: order._id, deliveredTime: now },
    });

    // Send Meta WhatsApp to customer
    await sendCustomerOrderStatusWhatsApp({
      customerPhone: order.shippingAddress.phone,
      customerName: order.shippingAddress.name,
      order,
      eventType: "delivered",
    });

    return res.status(200).json({
      success: true,
      message: "Order successfully marked as completed and delivered",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryStatus: order.deliveryStatus,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        deliveredTime: now,
        delivery,
      },
    });
  } catch (error) {
    console.error("Error in completeOrder:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * PATCH /delivery/orders/:orderId/cancel
 * Cancel with Reason API: Technician, Delivery person, or Admin cancels order with mandatory reason
 */
export async function cancelWithReason(req, res) {
  try {
    const actorId = req.user._id;
    const { orderId } = req.params;
    const { reason, restock = true } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: "A valid cancellation reason is required",
      });
    }

    const filter = req.user.role === "admin"
      ? { _id: orderId }
      : { _id: orderId, assignedDeliveryPartnerId: actorId };

    const order = await Order.findOne(filter);
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found or not assigned to you" });
    }

    if (order.orderStatus === "cancelled") {
      return res.status(400).json({ success: false, error: "Order is already cancelled" });
    }

    if (order.orderStatus === "delivered") {
      return res.status(400).json({
        success: false,
        error: "Cannot cancel an order that has already been delivered. Please initiate a return request instead.",
      });
    }

    const now = new Date();
    const formattedReason = reason.trim();

    // 1. Update Delivery status
    const delivery = await Delivery.findOneAndUpdate(
      { orderId: order._id },
      {
        failedTime: now,
        deliveryStatus: "failed",
        deliveryNotes: `Cancelled/Failed: ${formattedReason}`,
      },
      { upsert: true, new: true }
    );

    // 2. Update Order
    order.deliveryStatus = "failed";
    order.orderStatus = "cancelled";
    await order.save();

    // 3. Restock inventory if needed
    if (restock && order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (order.paymentStatus === "paid") {
          // If already paid, physical quantity was deducted on payment verification: restore both quantity and availableQuantity
          await Inventory.findOneAndUpdate(
            { productId: item.productId },
            {
              $inc: {
                quantity: item.quantity,
                availableQuantity: item.quantity,
              },
            }
          );
        } else {
          // If payment was pending, stock was only reserved: release reservedQuantity back to availableQuantity
          await Inventory.findOneAndUpdate(
            { productId: item.productId },
            {
              $inc: {
                reservedQuantity: -item.quantity,
                availableQuantity: item.quantity,
              },
            }
          );
        }
      }
    }

    // 4. Record in OrderStatusHistory
    await OrderStatusHistory.create({
      orderId: order._id,
      status: "cancelled",
      changedBy: actorId,
      notes: `Order cancelled. Reason: ${formattedReason}. Restocked: ${restock}`,
    });

    // 5. Notify customer
    await Notification.create({
      userId: order.userId,
      type: "order_cancelled",
      title: "Order Delivery Cancelled",
      message: `Your Order #${order.orderNumber} could not be delivered and was cancelled. Reason: ${formattedReason}.`,
      channel: "email",
      metadata: { orderId: order._id, reason: formattedReason, cancelledAt: now },
    });

    // Send Meta WhatsApp to customer
    await sendCustomerOrderStatusWhatsApp({
      customerPhone: order.shippingAddress.phone,
      customerName: order.shippingAddress.name,
      order,
      eventType: "cancelled",
      additionalInfo: formattedReason,
    });

    return res.status(200).json({
      success: true,
      message: "Order successfully cancelled with reason, and inventory updated",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveryStatus: order.deliveryStatus,
        orderStatus: order.orderStatus,
        reason: formattedReason,
        failedTime: now,
        restocked: restock,
        delivery,
      },
    });
  } catch (error) {
    console.error("Error in cancelWithReason:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
