import { Router } from "express";
import {
  getAllUsers,
  getUserDetails,
  getAllTechnicians,
  getCatalogSummary,
  getAdminProducts,
  createProduct,
  getInventory,
  updateInventory,
  getAdminOrders,
} from "../controllers/adminController.js";
import { validateUser } from "../middleware/validateUser.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();

// All admin routes require user authentication + admin role
router.use(validateUser, authorizeRoles("admin"));

// User & Technician endpoints
router.get("/users", getAllUsers);
router.get("/users/:userId", getUserDetails);
router.get("/technicians", getAllTechnicians);

// Catalog endpoints
router.get("/catalog/summary", getCatalogSummary);
router.get("/catalog/products", getAdminProducts);
router.post("/catalog/products", createProduct);

// Inventory endpoints
router.get("/inventory", getInventory);
router.patch("/inventory/:productId", updateInventory);

// Orders oversight
router.get("/orders", getAdminOrders);

export default router;
