import mongoose from "mongoose";
import PhoneModel from "../models/phoneModelModel.js";

/**
 * Middleware: validatePhoneId
 * Validates that req.params.phoneId is a valid MongoDB ObjectId
 * and checks that the phone model exists in the database.
 * Attaches the found phone document to req.phone.
 */
export async function validatePhoneId(req, res, next) {
  try {
    const { phoneId } = req.params;

    if (!phoneId || !mongoose.isValidObjectId(phoneId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid phone ID",
      });
    }

    const phone = await PhoneModel.findById(phoneId)
      .populate("brandId", "name logo")
      .lean();

    if (!phone) {
      return res.status(404).json({
        success: false,
        error: "Phone model not found",
      });
    }

    req.phone = phone;
    next();
  } catch (error) {
    console.error("Error in validatePhoneId middleware:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error during phone validation",
    });
  }
}

/**
 * Middleware: validatePhoneQuery
 * Validates query parameters on /phones (e.g., brand ObjectId, page, limit)
 */
export function validatePhoneQuery(req, res, next) {
  const { brand, brandName, search, page, limit } = req.query;

  if (brand && typeof brand !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid brand parameter",
    });
  }

  if (brandName && typeof brandName !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid brandName parameter",
    });
  }

  if (search && typeof search !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid search parameter",
    });
  }

  if (page && (isNaN(parseInt(page, 10)) || parseInt(page, 10) < 1)) {
    return res.status(400).json({
      success: false,
      error: "Invalid page parameter; must be a positive integer",
    });
  }

  if (limit && (isNaN(parseInt(limit, 10)) || parseInt(limit, 10) < 1)) {
    return res.status(400).json({
      success: false,
      error: "Invalid limit parameter; must be a positive integer",
    });
  }

  next();
}

/**
 * Middleware: validateCategoryQuery
 * Validates optional category query param on /phones/:phoneId/accessories
 */
export function validateCategoryQuery(req, res, next) {
  const { category } = req.query;

  if (category && typeof category !== "string") {
    return res.status(400).json({
      success: false,
      error: "Invalid category parameter",
    });
  }

  next();
}
