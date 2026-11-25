import { Router } from "express";
import {
  createPaymentOrder,
  verifyPayment,
  cancelPayment,
} from "../controllers/paymentController.js";
import { validateUser } from "../middleware/validateUser.js";

const router = Router();

// Payment routes require user authentication
router.use(validateUser);

// Initialize order and prepare Razorpay checkout
router.post("/create-order", createPaymentOrder);

// Verify Razorpay payment signature & confirm order
router.post("/verify", verifyPayment);

// Cancel payment & release reserved inventory
router.post("/cancel", cancelPayment);

export default router;
