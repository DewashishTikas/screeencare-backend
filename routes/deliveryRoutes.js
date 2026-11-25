import { Router } from "express";
import {
  assignDeliveryPartner,
  getMyAssignedOrders,
  pickupOrder,
  outForDelivery,
  completeOrder,
  cancelWithReason,
} from "../controllers/deliveryController.js";
import { validateUser } from "../middleware/validateUser.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();

// All delivery operations require authenticated user
router.use(validateUser);

// Admin-only: Assign order to technician / delivery partner
router.post("/assign", authorizeRoles("admin"), assignDeliveryPartner);

// Technician / Delivery Person / Admin routes
router.use(authorizeRoles("technician", "admin"));

// View assigned tasks/deliveries
router.get("/my-orders", getMyAssignedOrders);

// State change: Pick up product to send/dispatch
router.patch("/orders/:orderId/pickup", pickupOrder);

// State change: Mark order as out for delivery
router.patch("/orders/:orderId/out-for-delivery", outForDelivery);

// Order Completed endpoint
router.patch("/orders/:orderId/complete", completeOrder);

// Cancel with reason API
router.patch("/orders/:orderId/cancel", cancelWithReason);

export default router;
