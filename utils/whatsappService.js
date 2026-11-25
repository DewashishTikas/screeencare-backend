/**
 * Meta WhatsApp Cloud API Service for ScreenCare
 * Handles WhatsApp notifications for Technicians and Customers
 */

/**
 * Standardize phone number format for WhatsApp (E.164 without +)
 * E.g., '9876543210' -> '919876543210', '+91 98765-43210' -> '919876543210'
 */
export function formatWhatsAppNumber(phone) {
  if (!phone) return null;
  let clean = phone.replace(/\D/g, "");

  // If 10 digits, prepend default India country code (91)
  if (clean.length === 10) {
    clean = `91${clean}`;
  }

  return clean;
}

/**
 * Core send method to Meta WhatsApp Cloud API
 */
export async function sendWhatsAppMessage({ to, message, templateName, templateComponents = [] }) {
  const token = process.env.META_WA_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
  const formattedTo = formatWhatsAppNumber(to);

  if (!formattedTo) {
    console.warn("[Meta WhatsApp] Invalid phone number provided:", to);
    return { success: false, error: "Invalid phone number" };
  }

  // Development simulation if Meta API credentials are not yet configured in .env
  if (!token || !phoneNumberId) {
    console.log("\n=======================================================");
    console.log("📲 [META WHATSAPP SIMULATION MODE]");
    console.log(`To: +${formattedTo}`);
    if (templateName) {
      console.log(`Template: ${templateName}`);
    }
    console.log(`Message:\n${message}`);
    console.log("=======================================================\n");
    return {
      success: true,
      simulated: true,
      recipient: formattedTo,
    };
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

    let payload;
    if (templateName) {
      // Production Meta pre-approved template message
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedTo,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en" },
          components: templateComponents,
        },
      };
    } else {
      // Standard text message (useful for testing or open 24hr customer service window)
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedTo,
        type: "text",
        text: {
          preview_url: false,
          body: message,
        },
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error("[Meta WhatsApp] API Error:", responseData);
      return { success: false, error: responseData };
    }

    return {
      success: true,
      messageId: responseData.messages?.[0]?.id,
      recipient: formattedTo,
    };
  } catch (error) {
    console.error("[Meta WhatsApp] Network error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * 1. Send WhatsApp to Technician when a new order is assigned
 */
export async function sendTechnicianAssignmentWhatsApp({ technicianPhone, technicianName, order }) {
  if (!technicianPhone) return;

  const itemsList = order.items
    .map((item) => `• ${item.productNameSnapshot} (Qty: ${item.quantity})`)
    .join("\n");

  const address = order.shippingAddress;
  const addressStr = `${address.addressLine1}, ${address.addressLine2 ? address.addressLine2 + ", " : ""}${address.city}, ${address.state} - ${address.pincode}`;

  const message =
    `🔧 *ScreenCare Task Assignment*\n\n` +
    `Hello *${technicianName}*,\n` +
    `You have been assigned to Order *#${order.orderNumber}*.\n\n` +
    `📦 *Items to Deliver/Install:*\n${itemsList}\n\n` +
    `📍 *Delivery Address:*\n${address.name}\n${addressStr}\n` +
    `📞 *Customer Contact:* ${address.phone}\n\n` +
    `💵 *Payment Status:* ${order.paymentStatus.toUpperCase()} (₹${order.grandTotal})\n\n` +
    `Please dispatch the item and update your status in the ScreenCare partner portal.`;

  return await sendWhatsAppMessage({
    to: technicianPhone,
    message,
    templateName: process.env.META_WA_TEMPLATE_TECHNICIAN_ASSIGN,
    templateComponents: [
      {
        type: "body",
        parameters: [
          { type: "text", text: technicianName },
          { type: "text", text: order.orderNumber },
          { type: "text", text: itemsList },
          { type: "text", text: addressStr },
          { type: "text", text: address.phone },
        ],
      },
    ],
  });
}

/**
 * 2. Send WhatsApp order status update to the customer
 */
export async function sendCustomerOrderStatusWhatsApp({ customerPhone, customerName, order, eventType, additionalInfo = "" }) {
  if (!customerPhone) return;

  let message = "";
  let templateName = null;

  switch (eventType) {
    case "order_confirmed":
      templateName = process.env.META_WA_TEMPLATE_ORDER_CONFIRMED;
      message =
        `✅ *Order Confirmed! - ScreenCare*\n\n` +
        `Hello *${customerName}*,\n` +
        `Your order *#${order.orderNumber}* for ₹${order.grandTotal} has been received and confirmed.\n` +
        `Our team is preparing your products. We'll update you once a technician is on the way!`;
      break;

    case "picked_up":
      templateName = process.env.META_WA_TEMPLATE_ORDER_SHIPPED;
      message =
        `📦 *Product Dispatched - ScreenCare*\n\n` +
        `Hello *${customerName}*,\n` +
        `Your Order *#${order.orderNumber}* has been picked up from our inventory and is now in transit.`;
      break;

    case "out_for_delivery":
      templateName = process.env.META_WA_TEMPLATE_OUT_FOR_DELIVERY;
      message =
        `🚀 *Out for Delivery - ScreenCare*\n\n` +
        `Hello *${customerName}*,\n` +
        `Your Order *#${order.orderNumber}* is *OUT FOR DELIVERY* today!\n` +
        (additionalInfo ? `👤 *Assigned Technician:* ${additionalInfo}\n` : "") +
        `Please ensure someone is available at: ${order.shippingAddress.addressLine1}, ${order.shippingAddress.city}.`;
      break;

    case "delivered":
      templateName = process.env.META_WA_TEMPLATE_ORDER_DELIVERED;
      message =
        `🎉 *Order Completed - ScreenCare*\n\n` +
        `Hello *${customerName}*,\n` +
        `Your Order *#${order.orderNumber}* has been successfully delivered and completed!\n` +
        `Thank you for trusting ScreenCare for your phone accessories & protection.`;
      break;

    case "cancelled":
      templateName = process.env.META_WA_TEMPLATE_ORDER_CANCELLED;
      message =
        `❌ *Order Update - ScreenCare*\n\n` +
        `Hello *${customerName}*,\n` +
        `Your Order *#${order.orderNumber}* was cancelled.\n` +
        `*Reason:* ${additionalInfo || "Unable to fulfill"}\n\n` +
        `If you made an online payment, a full refund of ₹${order.grandTotal} will be credited within 3-5 business days.`;
      break;

    default:
      message = `ℹ️ *Order Update:* Status of #${order.orderNumber} is now ${order.orderStatus}.`;
  }

  return await sendWhatsAppMessage({
    to: customerPhone,
    message,
    templateName,
  });
}
