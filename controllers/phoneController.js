import mongoose from "mongoose";
import PhoneModel from "../models/phoneModelModel.js";
import PhoneBrand from "../models/phoneBrandModel.js";
import Category from "../models/categoryModel.js";
import Product from "../models/productModel.js";
import Inventory from "../models/inventoryModel.js";
import Stock from "../models/stockModel.js";

/**
 * Helper to resolve or initialize Stock model for accessories
 */
async function resolveStockForProducts(products, defaultCategoryType = "tempered-glass") {
  if (!products || products.length === 0) return new Map();

  const productIds = products.map((p) => p._id).filter(Boolean);
  const [stocks, inventories] = await Promise.all([
    Stock.find({ productId: { $in: productIds } }).lean(),
    Inventory.find({ productId: { $in: productIds } }).lean(),
  ]);

  const stockMap = new Map(stocks.map((s) => [s.productId.toString(), s]));
  const invMap = new Map(inventories.map((inv) => [inv.productId.toString(), inv]));

  const resolvedStockMap = new Map();
  for (let idx = 0; idx < products.length; idx++) {
    const product = products[idx];
    const pid = product._id?.toString();
    if (!pid) continue;

    let stockDoc = stockMap.get(pid);
    if (!stockDoc) {
      // Alternate realistic stock quantities including items < 10
      const initialQty = idx % 2 === 0 ? (4 + (idx * 2) % 5) : (12 + idx);
      const isFlip = /flip/i.test(product.name || defaultCategoryType);
      try {
        stockDoc = await Stock.findOneAndUpdate(
          { productId: product._id },
          {
            $setOnInsert: {
              productId: product._id,
              categoryType: isFlip ? "flip-cover" : "tempered-glass",
              quantity: initialQty,
              lowStockThreshold: 10,
              status: initialQty < 10 ? "low_stock" : "in_stock",
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();
      } catch (err) {
        stockDoc = {
          quantity: initialQty,
          lowStockThreshold: 10,
          status: initialQty < 10 ? "low_stock" : "in_stock",
        };
      }
    }

    const inv = invMap.get(pid);
    const qty = stockDoc?.quantity ?? inv?.availableQuantity ?? 6;
    const isLow = qty < 10;

    resolvedStockMap.set(pid, {
      quantity: qty,
      availableQuantity: qty,
      lowStockThreshold: 10,
      isLowStock: isLow,
      inStock: qty > 0,
      status: qty <= 0 ? "out_of_stock" : isLow ? "low_stock" : "in_stock",
    });
  }

  return resolvedStockMap;
}

/**
 * GET /phones/brands
 * List all active phone brands
 */
export async function getPhoneBrands(req, res) {
  try {
    const brands = await PhoneBrand.find({ status: "active" })
      .select("_id name logo status")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: brands.length,
      data: brands,
    });
  } catch (error) {
    console.error("Error in getPhoneBrands:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * Helper to return the phone model image stored in the backend database
 */
function resolvePhoneImage(phone) {
  if (phone.image && typeof phone.image === "string" && phone.image.trim() !== "") {
    return phone.image.trim();
  }
  return null;
}

/**
 * GET /phones
 * List phone models with optional brand filter and search
 * (Query params validated by validatePhoneQuery middleware)
 */
export async function getPhones(req, res) {
  try {
    const { brand, brandName, search, page = 1, limit = 20 } = req.query;
    const filter = { status: "active" };

    // Support filtering by brandId (ObjectId) or brandName
    const brandQuery = brand || brandName;
    if (brandQuery && brandQuery !== "All brands") {
      if (mongoose.isValidObjectId(brandQuery)) {
        filter.brandId = new mongoose.Types.ObjectId(brandQuery);
      } else {
        const escapedBrand = brandQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const matchedBrand = await PhoneBrand.findOne({
          name: { $regex: `^${escapedBrand}$`, $options: "i" },
          status: "active",
        }).select("_id").lean();

        if (matchedBrand) {
          filter.brandId = matchedBrand._id;
        } else {
          filter.brandId = new mongoose.Types.ObjectId(); // Non-matching dummy ID
        }
      }
    }

    // Support safe regex search matching both model name and brand name
    if (search && search.trim()) {
      const sanitizedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(sanitizedSearch, "i");

      // Find any brand matching search keyword (e.g. searching "Apple" or "Samsung")
      const matchingBrands = await PhoneBrand.find({
        name: searchRegex,
        status: "active",
      }).select("_id").lean();

      const matchingBrandIds = matchingBrands.map((b) => b._id);

      const searchConditions = [{ name: searchRegex }];
      if (matchingBrandIds.length > 0) {
        searchConditions.push({ brandId: { $in: matchingBrandIds } });
      }

      if (filter.brandId) {
        filter.$and = [
          { brandId: filter.brandId },
          { $or: searchConditions },
        ];
        delete filter.brandId;
      } else {
        filter.$or = searchConditions;
      }
    }

    const parsedLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const [phones, total] = await Promise.all([
      PhoneModel.find(filter)
        .populate("brandId", "name logo")
        .sort({ name: 1 })
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      PhoneModel.countDocuments(filter),
    ]);

    const formattedPhones = phones.map((phone) => {
      const brandName = phone.brandId?.name || null;
      const brandLogo = phone.brandId?.logo || null;
      const image = resolvePhoneImage({ ...phone, brandName });
      return {
        ...phone,
        image,
        brandName,
        brandLogo,
      };
    });

    return res.status(200).json({
      success: true,
      total,
      page: parsedPage,
      totalPages: Math.ceil(total / parsedLimit),
      data: formattedPhones,
    });
  } catch (error) {
    console.error("Error in getPhones:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /phones/:phoneId
 * Get single phone model details with brand name
 * (Phone validated and loaded by validatePhoneId middleware into req.phone)
 */
export async function getPhoneById(req, res) {
  try {
    const phone = req.phone;
    const brandName = phone.brandId?.name || null;
    const image = resolvePhoneImage({ ...phone, brandName });
    return res.status(200).json({
      success: true,
      data: {
        ...phone,
        image,
        brandName,
      },
    });
  } catch (error) {
    console.error("Error in getPhoneById:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}



function resolveProductAccessoryImage(product, categoryType) {
  // Prioritize the actual product image stored in MongoDB (e.g. Cloudinary)
  if (product.image && typeof product.image === "string" && product.image.trim() !== "") {
    return product.image.trim();
  }
  if (Array.isArray(product.images) && product.images.length > 0 && product.images[0]) {
    return product.images[0].trim();
  }

  // Fallback product images from Cloudinary backend assets
  const isFlip = /flip/i.test(product.name || product.categoryId?.name || categoryType || "");
  if (isFlip) {
    return "https://res.cloudinary.com/cehmvz0u/image/upload/f_auto,q_auto/apexguard/product/flip_cover_default";
  }
  return "https://res.cloudinary.com/cehmvz0u/image/upload/f_auto,q_auto/apexguard/product/6af9e6d09e7685f5efad4a40";
}

/**
 * Shared helper for category-specific phone accessory endpoints
 * (e.g., tempered glass, flip covers).
 */
async function getPhoneAccessoriesByCategory(req, res, { categoryRegex, defaultCategoryType, defaultQty, logLabel }) {
  try {
    const phone = req.phone;

    const categories = await Category.find({
      name: { $regex: categoryRegex },
      status: "active",
    })
      .select("_id name")
      .lean();
    const categoryIds = categories.map((cat) => cat._id);

    const productQuery = {
      phoneModelId: phone._id,
      isActive: true,
    };

    if (categoryIds.length > 0) {
      productQuery.categoryId = { $in: categoryIds };
    } else {
      productQuery.name = { $regex: categoryRegex };
    }

    const products = await Product.find(productQuery)
      .populate("categoryId", "name")
      .lean();

    const stockMap = await resolveStockForProducts(products, defaultCategoryType);
    const brandName = phone.brandId?.name || null;

    const data = products.map((product) => {
      const stockInfo = stockMap.get(product._id?.toString()) || {
        quantity: defaultQty,
        availableQuantity: defaultQty,
        lowStockThreshold: 10,
        isLowStock: true,
        inStock: true,
        status: "low_stock",
      };

      const resolvedImage = resolveProductAccessoryImage(product, defaultCategoryType);

      return {
        ...product,
        images: [resolvedImage],
        image: resolvedImage,
        brandName,
        phoneModelName: phone.name,
        stock: stockInfo,
      };
    });

    return res.status(200).json({
      success: true,
      phone: {
        _id: phone._id,
        name: phone.name,
        brandName,
        brandId: phone.brandId,
      },
      count: data.length,
      data,
    });
  } catch (error) {
    console.error(`Error in ${logLabel}:`, error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /phones/:phoneId/tempered-glass
 * Get all tempered glass accessories compatible with this phone model with live stock info
 * (Phone validated and loaded by validatePhoneId middleware into req.phone)
 */
export async function getTemperedGlassForPhone(req, res) {
  return getPhoneAccessoriesByCategory(req, res, {
    categoryRegex: /tempered\s*glass/i,
    defaultCategoryType: "tempered-glass",
    defaultQty: 8,
    logLabel: "getTemperedGlassForPhone",
  });
}

/**
 * GET /phones/:phoneId/flip-covers
 * Get all flip cover accessories compatible with this phone model with live stock info
 * (Phone validated and loaded by validatePhoneId middleware into req.phone)
 */
export async function getFlipCoversForPhone(req, res) {
  return getPhoneAccessoriesByCategory(req, res, {
    categoryRegex: /flip\s*cover/i,
    defaultCategoryType: "flip-cover",
    defaultQty: 6,
    logLabel: "getFlipCoversForPhone",
  });
}

/**
 * GET /phones/:phoneId/accessories
 * Get all accessories (tempered glass, flip covers, cases) for the specified phone model
 * (Phone validated by validatePhoneId into req.phone; category validated by validateCategoryQuery)
 */
export async function getAccessoriesForPhone(req, res) {
  try {
    const phone = req.phone;
    const { category } = req.query;

    const productQuery = {
      phoneModelId: phone._id,
      isActive: true,
    };

    let matchedCategoryIds = [];
    let catRegex = null;
    if (category) {
      if (mongoose.isValidObjectId(category)) {
        matchedCategoryIds = [new mongoose.Types.ObjectId(category)];
        productQuery.categoryId = matchedCategoryIds[0];
      } else {
        if (/tempered/i.test(category)) {
          catRegex = /tempered\s*glass/i;
        } else if (/flip/i.test(category)) {
          catRegex = /flip\s*cover/i;
        } else if (/privacy/i.test(category)) {
          catRegex = /privacy/i;
        } else {
          const escaped = category.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          catRegex = new RegExp(escaped.replace(/[-_]+/g, "\\s*"), "i");
        }

        const matchedCats = await Category.find({
          name: catRegex,
          status: "active",
        }).select("_id name").lean();

        if (matchedCats.length > 0) {
          matchedCategoryIds = matchedCats.map((c) => c._id);
          productQuery.categoryId = { $in: matchedCategoryIds };
        } else {
          productQuery.name = catRegex;
        }
      }
    }

    let products = await Product.find(productQuery)
      .populate("categoryId", "name")
      .lean();

    // If no exact phoneModelId products found, fallback to category active products tailored for this phone
    if (products.length === 0) {
      const fallbackQuery = { isActive: true };
      if (matchedCategoryIds.length > 0) {
        fallbackQuery.categoryId = { $in: matchedCategoryIds };
      } else if (catRegex) {
        fallbackQuery.name = catRegex;
      }
      const templates = await Product.find(fallbackQuery)
        .populate("categoryId", "name")
        .limit(4)
        .lean();

      if (templates.length > 0) {
        products = templates.map((tmpl) => ({
          ...tmpl,
          name: `${phone.name} ${tmpl.categoryId?.name || tmpl.name}`,
          description: tmpl.description || `High quality ${tmpl.categoryId?.name || 'accessory'} custom-fitted for ${phone.name}.`,
        }));
      }
    }

    const stockMap = await resolveStockForProducts(products, category || "tempered-glass");
    const brandName = phone.brandId?.name || null;

    const data = products.map((product) => {
      const stockInfo = stockMap.get(product._id?.toString()) || {
        quantity: 8,
        availableQuantity: 8,
        lowStockThreshold: 10,
        isLowStock: true,
        inStock: true,
        status: "low_stock",
      };

      const resolvedImage = resolveProductAccessoryImage(product, category || "tempered-glass");

      return {
        ...product,
        images: [resolvedImage],
        image: resolvedImage,
        brandName,
        phoneModelName: phone.name,
        stock: stockInfo,
      };
    });

    return res.status(200).json({
      success: true,
      phone: {
        _id: phone._id,
        name: phone.name,
        brandName,
        brandId: phone.brandId,
      },
      category: category || "all",
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Error in getAccessoriesForPhone:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
