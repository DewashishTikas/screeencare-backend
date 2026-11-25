import { Router } from "express";
import {
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  getPastPurchases,
} from "../controllers/cartController.js";
import { validateUser } from "../middleware/validateUser.js";

const router = Router();

// Validate user authentication before all cart actions
router.use(validateUser);

// User past purchases (what they bought before)
router.get("/past-purchases", getPastPurchases);

// Cart management
router.get("/", getCart);
router.post("/add", addToCart);
router.put("/items/:productId", updateCartItemQuantity);
router.delete("/items/:productId", removeCartItem);
router.delete("/", clearCart);

export default router;
