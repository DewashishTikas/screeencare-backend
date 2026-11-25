import { Router } from "express";
import {
  getPhoneBrands,
  getPhones,
  getPhoneById,
  getTemperedGlassForPhone,
  getFlipCoversForPhone,
  getAccessoriesForPhone,
} from "../controllers/phoneController.js";
import {
  validatePhoneId,
  validatePhoneQuery,
  validateCategoryQuery,
} from "../middleware/phoneMiddleware.js";

const router = Router();

// GET /phones/brands - List all active phone brands
router.get("/brands", getPhoneBrands);

// GET /phones - Select phone device / model
router.get("/", validatePhoneQuery, getPhones);

// GET /phones/:phoneId/tempered-glass - Tempered glass accessories for this phone
router.get("/:phoneId/tempered-glass", validatePhoneId, getTemperedGlassForPhone);

// GET /phones/:phoneId/flip-covers - Flip cover accessories for this phone
router.get("/:phoneId/flip-covers", validatePhoneId, getFlipCoversForPhone);

// GET /phones/:phoneId/accessories - All accessories (tempered glass and flip covers)
router.get("/:phoneId/accessories", validatePhoneId, validateCategoryQuery, getAccessoriesForPhone);

export default router;
