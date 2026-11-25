import crypto from "node:crypto";
import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import Payment from "../models/paymentModel.js";
import Cart from "../models/cartModel.js";
import Product from "../models/productModel.js";
import Inventory from "../models/inventoryModel.js";
import Address from "../models/addressModel.js";
import OrderStatusHistory from "../models/orderStatusHistoryModel.js";
import Notification from "../models/notificationModel.js";
import { sendCustomerOrderStatusWhatsApp } from "../utils/whatsappService.js";

/**
 * Helper to call Razorpay Orders API using native fetch
 */
async function createRazorpayOrderOnGateway({ amountInPaise, currency = "INR", receipt, notes = {} }) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    console.warn("Razorpay keys missing in environment variables. Generating mock gateway order ID for development.");
    return {
      id: `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      amount: amountInPaise,
      currency,
      receipt,
      status: "created",
    };
  }

  const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency,
      receipt,
      notes,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Razorpay API Error (${response.status}): ${errorBody}`);
  }

  return await response.json();
}

/**
 * POST /payments/create-order
 * Create an order and initialize Razorpay payment for Consumer or Business
 */
export async function createPaymentOrder(req, res) {
  try {
    const userId = req.user._id;
    const {
      shippingAddressId,
      shippingAddress: inlineShippingAddress,
      billingAddressId,
      billingAddress: inlineBillingAddress,
      customerType = "consumer", // "consumer" or "business"
      businessName,
      gstin,
      pan,
      items: directItems,
    } = req.body;

    // 1. Resolve shipping address
    let resolvedShipping = null;
    if (shippingAddressId && mongoose.isValidObjectId(shippingAddressId)) {
      resolvedShipping = await Address.findOne({ _id: shippingAddressId, userId }).lean();
    } else if (inlineShippingAddress) {
      resolvedShipping = inlineShippingAddress;
    }

    if (!resolvedShipping) {
      return res.status(400).json({
        success: false,
        error: "Valid shipping address is required",
      });
    }

    // 2. Resolve billing address
    let resolvedBilling = null;
    if (billingAddressId && mongoose.isValidObjectId(billingAddressId)) {
      resolvedBilling = await Address.findOne({ _id: billingAddressId, userId }).lean();
    } else if (inlineBillingAddress) {
      resolvedBilling = inlineBillingAddress;
    } else {
      resolvedBilling = resolvedShipping;
    }

    // Business details handling
    const isBusiness = customerType === "business" || resolvedBilling.addressType === "business";
    const finalBusinessName = businessName || resolvedBilling.businessName || resolvedShipping.businessName || null;
    const finalGstin = gstin || resolvedBilling.gstin || resolvedShipping.gstin || null;
    const finalPan = pan || resolvedBilling.pan || resolvedShipping.pan || null;

    if (isBusiness && !finalBusinessName) {
      return res.status(400).json({
        success: false,
        error: "Business name is required for business orders",
      });
    }

    // 3. Resolve items from direct input or from Cart
    let orderItemsRaw = [];

    if (Array.isArray(directItems) && directItems.length > 0) {
      orderItemsRaw = directItems;
    } else {
      const cart = await Cart.findOne({ userId }).lean();
      if (!cart || !cart.items || cart.items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Cart is empty. Please add items to cart before proceeding to payment.",
        });
      }
      orderItemsRaw = cart.items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
    }

    // 4. Verify products & check inventory stock availability
    const productIds = orderItemsRaw.map((i) => i.productId);
    const [products, inventories] = await Promise.all([
      Product.find({ _id: { $in: productIds }, isActive: true }).lean(),
      Inventory.find({ productId: { $in: productIds } }),
    ]);

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const inventoryMap = new Map(inventories.map((inv) => [inv.productId.toString(), inv]));

    const validatedOrderItems = [];
    let subtotal = 0;

    for (const item of orderItemsRaw) {
      const prodIdStr = item.productId.toString();
      const product = productMap.get(prodIdStr);
      const inventory = inventoryMap.get(prodIdStr);

      if (!product) {
        return res.status(400).json({
          success: false,
          error: `Product with ID ${prodIdStr} is no longer available`,
        });
      }

      const availableQuantity = inventory ? inventory.availableQuantity : 0;
      if (item.quantity > availableQuantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for product "${product.name}". Requested: ${item.quantity}, Available: ${availableQuantity}`,
          productId: product._id,
          availableQuantity,
        });
      }

      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;

      validatedOrderItems.push({
        productId: product._id,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        quantity: item.quantity,
        unitPrice: product.price,
        totalPrice: lineTotal,
      });
    }

    // 5. Calculate taxes and totals (standard 18% GST calculation)
    const tax = Math.round(subtotal * 0.18 * 100) / 100;
    const deliveryFee = subtotal >= 500 ? 0 : 50;
    const discount = 0;
    const grandTotal = subtotal + tax + deliveryFee - discount;

    // 6. Atomically reserve inventory stock for this order
    for (const item of validatedOrderItems) {
      await Inventory.findOneAndUpdate(
        { productId: item.productId, availableQuantity: { $gte: item.quantity } },
        {
          $inc: {
            reservedQuantity: item.quantity,
            availableQuantity: -item.quantity,
          },
        }
      );
    }

    // 7. Create internal Order
    const orderNumber = `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const order = new Order({
      orderNumber,
      userId,
      customerType: isBusiness ? "business" : "consumer",
      items: validatedOrderItems,
      shippingAddress: {
        name: resolvedShipping.name,
        phone: resolvedShipping.phone,
        addressLine1: resolvedShipping.addressLine1,
        addressLine2: resolvedShipping.addressLine2 || "",
        city: resolvedShipping.city,
        state: resolvedShipping.state,
        pincode: resolvedShipping.pincode,
        landmark: resolvedShipping.landmark || "",
        addressType: resolvedShipping.addressType || (isBusiness ? "business" : "consumer"),
        businessName: finalBusinessName,
        gstin: finalGstin,
        pan: finalPan,
      },
      billingAddress: {
        name: resolvedBilling.name,
        phone: resolvedBilling.phone,
        addressLine1: resolvedBilling.addressLine1,
        addressLine2: resolvedBilling.addressLine2 || "",
        city: resolvedBilling.city,
        state: resolvedBilling.state,
        pincode: resolvedBilling.pincode,
        landmark: resolvedBilling.landmark || "",
        addressType: resolvedBilling.addressType || (isBusiness ? "business" : "consumer"),
        businessName: finalBusinessName,
        gstin: finalGstin,
        pan: finalPan,
      },
      subtotal,
      deliveryFee,
      discount,
      tax,
      grandTotal,
      paymentStatus: "pending",
      orderStatus: "placed",
      deliveryStatus: "pending",
    });

    await order.save();

    // 8. Create Razorpay Order
    const amountInPaise = Math.round(grandTotal * 100);
    const razorpayOrder = await createRazorpayOrderOnGateway({
      amountInPaise,
      currency: "INR",
      receipt: order.orderNumber,
      notes: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        customerType: isBusiness ? "business" : "consumer",
        businessName: finalBusinessName || "",
        gstin: finalGstin || "",
      },
    });

    // 9. Create pending payment record
    const payment = new Payment({
      orderId: order._id,
      userId,
      amount: grandTotal,
      paymentMethod: "razorpay",
      paymentStatus: "pending",
      transactionId: razorpayOrder.id,
    });
    await payment.save();

    // 10. Log status history
    await OrderStatusHistory.create({
      orderId: order._id,
      status: "placed",
      changedBy: userId,
      notes: `Order created. Razorpay Order ID: ${razorpayOrder.id}. Customer Type: ${order.customerType}`,
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully. Proceed to payment.",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        razorpayOrderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
        customer: {
          name: req.user.name,
          email: req.user.email,
          phone: resolvedShipping.phone,
        },
        customerType: order.customerType,
        business: isBusiness
          ? {
              businessName: finalBusinessName,
              gstin: finalGstin,
              pan: finalPan,
            }
          : null,
        items: order.items,
        summary: {
          subtotal,
          tax,
          deliveryFee,
          grandTotal,
        },
      },
    });
  } catch (error) {
    console.error("Error in createPaymentOrder:", error);
    return res.status(500).json({ success: false, error: error.message || "Internal server error" });
  }
}

/**
 * POST /payments/verify
 * Razorpay Secure Signature Verification and stock finalization
 */
export async function verifyPayment(req, res) {
  try {
    const userId = req.user._id;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({
        success: false,
        error: "razorpay_order_id and razorpay_payment_id are required",
      });
    }

    // 1. Locate Order
    const query = orderId
      ? { _id: orderId, userId }
      : { orderNumber: { $exists: true } };

    let order = await Order.findOne(query);
    if (!order && razorpay_order_id) {
      const paymentDoc = await Payment.findOne({ transactionId: razorpay_order_id, userId });
      if (paymentDoc) {
        order = await Order.findById(paymentDoc.orderId);
      }
    }

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // If order already paid, return success
    if (order.paymentStatus === "paid") {
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        orderId: order._id,
        orderNumber: order.orderNumber,
      });
    }

    // 2. Cryptographic signature check
    const secret = process.env.RAZORPAY_KEY_SECRET;
    let isSignatureValid = false;

    if (!secret) {
      // In development fallback if keys are omitted
      console.warn("RAZORPAY_KEY_SECRET not configured. Accepting test verification.");
      isSignatureValid = true;
    } else if (razorpay_signature) {
      const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
      const generatedSignature = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

      try {
        isSignatureValid = crypto.timingSafeEqual(
          Buffer.from(generatedSignature),
          Buffer.from(razorpay_signature)
        );
      } catch {
        isSignatureValid = false;
      }
    }

    // 3. Handle signature verification failure
    if (!isSignatureValid) {
      // Mark payment failed
      await Payment.findOneAndUpdate(
        { orderId: order._id },
        { paymentStatus: "failed", transactionId: razorpay_payment_id }
      );

      order.paymentStatus = "failed";
      await order.save();

      // Release reserved stock back to available stock
      for (const item of order.items) {
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

      await OrderStatusHistory.create({
        orderId: order._id,
        status: "failed",
        changedBy: userId,
        notes: `Signature verification failed for payment ID ${razorpay_payment_id}`,
      });

      return res.status(400).json({
        success: false,
        error: "Invalid Razorpay payment signature verification failed",
      });
    }

    // 4. Payment verified successfully!
    // Update Payment
    await Payment.findOneAndUpdate(
      { orderId: order._id },
      {
        paymentStatus: "completed",
        transactionId: razorpay_payment_id,
      }
    );

    // Update Order
    order.paymentStatus = "paid";
    order.orderStatus = "confirmed";
    await order.save();

    // 5. Finalize inventory: Deduct actual stock and clear reservation
    for (const item of order.items) {
      await Inventory.findOneAndUpdate(
        { productId: item.productId },
        {
          $inc: {
            quantity: -item.quantity,
            reservedQuantity: -item.quantity,
          },
        }
      );
    }

    // 6. Clear items from User's Cart
    const purchasedProductIds = order.items.map((i) => i.productId.toString());
    await Cart.findOneAndUpdate(
      { userId },
      {
        $pull: {
          items: {
            productId: { $in: purchasedProductIds },
          },
        },
      }
    );

    // 7. Record Order History
    await OrderStatusHistory.create({
      orderId: order._id,
      status: "confirmed",
      changedBy: userId,
      notes: `Payment completed via Razorpay. Payment ID: ${razorpay_payment_id}`,
    });

    // 8. Trigger confirmation notification
    await Notification.create({
      userId,
      type: "order_confirmed",
      title: "Order Confirmed!",
      message: `Your order #${order.orderNumber} for ₹${order.grandTotal} has been successfully placed.`,
      channel: "email",
      metadata: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        grandTotal: order.grandTotal,
        paymentId: razorpay_payment_id,
        customerType: order.customerType,
      },
    });

    // 9. Send Meta WhatsApp order confirmation to customer
    await sendCustomerOrderStatusWhatsApp({
      customerPhone: order.shippingAddress.phone,
      customerName: order.shippingAddress.name,
      order,
      eventType: "order_confirmed",
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified and order confirmed successfully",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        grandTotal: order.grandTotal,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        customerType: order.customerType,
        paymentId: razorpay_payment_id,
      },
    });
  } catch (error) {
    console.error("Error in verifyPayment:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * POST /payments/cancel
 * Cancel order attempt & release reserved inventory if user leaves/cancels payment
 */
export async function cancelPayment(req, res) {
  try {
    const userId = req.user._id;
    const { orderId } = req.body;

    const order = await Order.findOne({ _id: orderId, userId, paymentStatus: "pending" });
    if (!order) {
      return res.status(404).json({ success: false, error: "Pending order not found" });
    }

    // Release reserved inventory
    for (const item of order.items) {
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

    order.orderStatus = "cancelled";
    order.paymentStatus = "failed";
    await order.save();

    await OrderStatusHistory.create({
      orderId: order._id,
      status: "cancelled",
      changedBy: userId,
      notes: "Payment cancelled by user. Reserved stock released.",
    });

    return res.status(200).json({
      success: true,
      message: "Order and payment cancelled, inventory released",
    });
  } catch (error) {
    console.error("Error in cancelPayment:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
