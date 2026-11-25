import { Router } from "express";
import {
  verifyMetaWebhook,
  handleMetaWebhook,
} from "../controllers/whatsappWebhookController.js";

const router = Router();

// Meta WhatsApp Webhook endpoints
router.get("/whatsapp", verifyMetaWebhook);
router.post("/whatsapp", handleMetaWebhook);

export default router;
