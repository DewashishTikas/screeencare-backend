import { Router } from "express";
import {
  createOrder,
  getUserOrders,
  getOrderDetails,
  getOrderInvoice,
} from "../controllers/orderController.js";
import { validateUser } from "../middleware/validateUser.js";

const router = Router();

// Order routes require authentication
router.use(validateUser);

router.post("/", createOrder);
router.get("/", getUserOrders);
router.get("/:orderId", getOrderDetails);
router.get("/:orderId/invoice", getOrderInvoice);

export default router;
