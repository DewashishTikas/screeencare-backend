/**
 * Meta WhatsApp Cloud API Webhook Controller
 * Handles webhook verification and incoming message/status callbacks from Meta
 */
import Order from "../models/orderModel.js";
import Delivery from "../models/deliveryModel.js";
import OrderStatusHistory from "../models/orderStatusHistoryModel.js";

/**
 * GET /webhooks/whatsapp
 * Meta Webhook verification handshake
 */
export function verifyMetaWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.META_WA_VERIFY_TOKEN || "screencare_wa_verify_token";

  if (mode && token) {
    if (mode === "subscribe" && token === verifyToken) {
      console.log("[Meta WhatsApp Webhook] Verified successfully!");
      return res.status(200).send(challenge);
    } else {
      console.warn("[Meta WhatsApp Webhook] Verification token mismatch.");
      return res.sendStatus(403);
    }
  }

  return res.sendStatus(400);
}

/**
 * POST /webhooks/whatsapp
 * Receives message status updates (sent, delivered, read) and incoming user/technician replies
 */
export async function handleMetaWebhook(req, res) {
  try {
    const body = req.body;

    // Acknowledge Meta immediately with 200 OK
    res.status(200).send("EVENT_RECEIVED");

    if (body.object !== "whatsapp_business_account") {
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return;

    // 1. Message delivery status updates (sent, delivered, read)
    if (value.statuses && value.statuses.length > 0) {
      for (const status of value.statuses) {
        console.log(`[Meta WhatsApp] Status update: Message ${status.id} is now ${status.status} for ${status.recipient_id}`);
      }
    }

    // 2. Incoming messages / interactive button clicks
    if (value.messages && value.messages.length > 0) {
      for (const message of value.messages) {
        const from = message.from;
        const text = message.text?.body;
        const buttonPayload = message.interactive?.button_reply?.id || message.button?.payload;

        console.log(`[Meta WhatsApp] Incoming message from ${from}:`, text || buttonPayload);

        // Example: Handle quick reply buttons from technician (e.g. 'ACCEPT_ORDER_ORD-1234')
        if (buttonPayload && buttonPayload.startsWith("ACCEPT_ORDER_")) {
          const orderNumber = buttonPayload.replace("ACCEPT_ORDER_", "").trim();
          const order = await Order.findOne({ orderNumber });

          if (order && order.deliveryStatus === "assigned") {
            order.deliveryStatus = "picked_up";
            order.orderStatus = "shipped";
            await order.save();

            await Delivery.findOneAndUpdate(
              { orderId: order._id },
              { pickupTime: new Date(), deliveryStatus: "picked_up" }
            );

            await OrderStatusHistory.create({
              orderId: order._id,
              status: "picked_up",
              notes: `Picked up by technician via WhatsApp interactive button response (${from})`,
            });

            console.log(`[Meta WhatsApp] Order ${orderNumber} state changed to picked_up via WhatsApp button reply.`);
          }
        }
      }
    }
  } catch (error) {
    console.error("[Meta WhatsApp Webhook] Processing error:", error);
  }
}
