import { Router } from "express";
import {
  createAddress,
  getAddresses,
  getAddressById,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} from "../controllers/addressController.js";
import { validateUser } from "../middleware/validateUser.js";

const router = Router();

// All address routes require user to be logged in
router.use(validateUser);

router.post("/", createAddress);
router.get("/", getAddresses);
router.get("/:id", getAddressById);
router.put("/:id", updateAddress);
router.patch("/:id/default", setDefaultAddress);
router.delete("/:id", deleteAddress);

export default router;
