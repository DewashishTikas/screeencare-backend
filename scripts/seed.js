import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/userModel.js";
import PhoneBrand from "../models/phoneBrandModel.js";
import PhoneModel from "../models/phoneModelModel.js";
import Category from "../models/categoryModel.js";
import Product from "../models/productModel.js";
import Inventory from "../models/inventoryModel.js";
import Address from "../models/addressModel.js";

const MONGODB_URL = process.env.MONGODBURL || process.env.MONGO_URI || "mongodb://localhost:27017/screencare";

async function seed() {
  try {
    console.log("Connecting to MongoDB for seeding...");
    await mongoose.connect(MONGODB_URL);
    console.log("Connected successfully.");

    // 1. Seed Categories (ScreenCare sells Accessories only: Tempered Glass & Flip Covers)
    console.log("Seeding accessory categories...");
    const categoriesData = [
      { name: "Tempered Glass", description: "Edge-to-edge screen protectors, anti-spy, UV curved, and matte tempered glass", status: "active" },
      { name: "Flip Covers", description: "Premium leather wallet, magnetic clasp, and protective flip covers", status: "active" },
      { name: "Camera Lens Protectors", description: "Scratch-resistant individual ring and glass camera protectors", status: "active" },
    ];

    const categoryMap = new Map();
    for (const cat of categoriesData) {
      let doc = await Category.findOne({ name: cat.name });
      if (!doc) {
        doc = await Category.create(cat);
      }
      categoryMap.set(cat.name, doc);
    }

    // 2. Seed Brands
    console.log("Seeding phone brands...");
    const brandsData = [
      { name: "Apple", logo: "https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg", status: "active" },
      { name: "Samsung", logo: "https://upload.wikimedia.org/wikipedia/commons/2/24/Samsung_Logo.svg", status: "active" },
      { name: "OnePlus", logo: "https://upload.wikimedia.org/wikipedia/commons/0/02/OnePlus_logo.svg", status: "active" },
    ];

    const brandMap = new Map();
    for (const b of brandsData) {
      let doc = await PhoneBrand.findOne({ name: b.name });
      if (!doc) {
        doc = await PhoneBrand.create(b);
      }
      brandMap.set(b.name, doc);
    }

    // 3. Seed Phone Models
    console.log("Seeding phone models...");
    const modelsData = [
      {
        brandId: brandMap.get("Apple")._id,
        name: "iPhone 15 Pro",
        image: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=600",
        status: "active",
      },
      {
        brandId: brandMap.get("Apple")._id,
        name: "iPhone 16",
        image: "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600",
        status: "active",
      },
      {
        brandId: brandMap.get("Samsung")._id,
        name: "Galaxy S24 Ultra",
        image: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=600",
        status: "active",
      },
      {
        brandId: brandMap.get("OnePlus")._id,
        name: "OnePlus 12",
        image: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=600",
        status: "active",
      },
    ];

    const modelMap = new Map();
    for (const m of modelsData) {
      let doc = await PhoneModel.findOne({ brandId: m.brandId, name: m.name });
      if (!doc) {
        doc = await PhoneModel.create(m);
      }
      modelMap.set(m.name, doc);
    }

    // 4. Seed Products (ScreenCare sells Accessories: Tempered Glass & Flip Covers)
    console.log("Seeding accessory products & inventory (Tempered Glass & Flip Covers)...");
    const iphone15 = modelMap.get("iPhone 15 Pro");
    const iphone16 = modelMap.get("iPhone 16");
    const s24Ultra = modelMap.get("Galaxy S24 Ultra");
    const oneplus12 = modelMap.get("OnePlus 12");
    const tgCategory = categoryMap.get("Tempered Glass");
    const fcCategory = categoryMap.get("Flip Covers");

    const productsData = [
      // 1. Tempered Glass for iPhone 15 Pro
      {
        categoryId: tgCategory._id,
        phoneModelId: iphone15._id,
        name: "iPhone 15 Pro 9H Matte Privacy Tempered Glass",
        sku: "TG-IP15P-MATTE",
        description: "Full coverage matte anti-spy tempered glass with 9H scratch resistance and oleophobic coating.",
        price: 499,
        images: ["https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=600"],
        specifications: {
          hardness: "9H",
          finish: "Matte Anti-Spy",
          thickness: "0.33mm",
          coverage: "Edge-to-Edge",
        },
        isActive: true,
        stock: 100,
      },
      // 2. Flip Cover for iPhone 15 Pro
      {
        categoryId: fcCategory._id,
        phoneModelId: iphone15._id,
        name: "iPhone 15 Pro Magnetic Leather Wallet Flip Cover",
        sku: "FC-IP15P-LTHR-BLK",
        description: "Premium PU leather wallet flip cover with magnetic lock and 3 cardholder slots.",
        price: 799,
        images: ["https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600"],
        specifications: {
          material: "PU Leather",
          color: "Midnight Black",
          cardSlots: 3,
          kickstandSupport: true,
        },
        isActive: true,
        stock: 50,
      },
      // 3. Tempered Glass for iPhone 16
      {
        categoryId: tgCategory._id,
        phoneModelId: iphone16._id,
        name: "iPhone 16 HD Clear 9H Tempered Glass",
        sku: "TG-IP16-HD-CLR",
        description: "Ultra-clear 9H tempered glass screen protector with 99.9% transparency.",
        price: 449,
        images: ["https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=600"],
        specifications: {
          hardness: "9H",
          finish: "Crystal Clear",
          thickness: "0.3mm",
        },
        isActive: true,
        stock: 80,
      },
      // 4. Flip Cover for iPhone 16
      {
        categoryId: fcCategory._id,
        phoneModelId: iphone16._id,
        name: "iPhone 16 Vintage Slim Flip Cover",
        sku: "FC-IP16-SLIM-BRN",
        description: "Ultra-slim textured leather flip cover with shock absorption inner shell.",
        price: 749,
        images: ["https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=600"],
        specifications: {
          material: "Vintage Leather",
          color: "Chestnut Brown",
          cardSlots: 2,
        },
        isActive: true,
        stock: 60,
      },
      // 5. Tempered Glass for Samsung S24 Ultra
      {
        categoryId: tgCategory._id,
        phoneModelId: s24Ultra._id,
        name: "Galaxy S24 Ultra UV Curved Tempered Glass",
        sku: "TG-S24U-UV-CLR",
        description: "Liquid dispersion optical technology with fingerprint sensor unlock support.",
        price: 599,
        images: ["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600"],
        specifications: {
          hardness: "9H",
          type: "UV Liquid Adhesive",
          fingerprintCompatible: true,
        },
        isActive: true,
        stock: 75,
      },
      // 6. Flip Cover for Samsung S24 Ultra
      {
        categoryId: fcCategory._id,
        phoneModelId: s24Ultra._id,
        name: "Galaxy S24 Ultra Smart View Leather Flip Cover",
        sku: "FC-S24U-SMART-BRN",
        description: "Vintage brown leather flip cover with shock absorption TPU inner shell.",
        price: 849,
        images: ["https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600"],
        specifications: {
          material: "Vintage Leather",
          color: "Saddle Brown",
          cardSlots: 2,
        },
        isActive: true,
        stock: 40,
      },
      // 7. Tempered Glass for OnePlus 12
      {
        categoryId: tgCategory._id,
        phoneModelId: oneplus12._id,
        name: "OnePlus 12 3D Curved Edge Tempered Glass",
        sku: "TG-OP12-3D-BLK",
        description: "Full screen coverage with black border curve design and case friendly edges.",
        price: 499,
        images: ["https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=600"],
        specifications: {
          hardness: "9H",
          finish: "3D Curved Silk Print",
        },
        isActive: true,
        stock: 50,
      },
      // 8. Flip Cover for OnePlus 12
      {
        categoryId: fcCategory._id,
        phoneModelId: oneplus12._id,
        name: "OnePlus 12 Executive Wallet Flip Case",
        sku: "FC-OP12-EXEC-BLK",
        description: "Executive black folio flip case with magnetic clasp and stand function.",
        price: 699,
        images: ["https://images.unsplash.com/photo-1580910051074-3eb694886505?w=600"],
        specifications: {
          material: "Faux Leather",
          color: "Executive Black",
          cardSlots: 3,
        },
        isActive: true,
        stock: 45,
      },
    ];

    for (const p of productsData) {
      const { stock, ...productFields } = p;
      let prod = await Product.findOne({ sku: productFields.sku });
      if (!prod) {
        prod = await Product.create(productFields);
      }

      await Inventory.findOneAndUpdate(
        { productId: prod._id },
        {
          productId: prod._id,
          quantity: stock,
          reservedQuantity: 0,
          availableQuantity: stock,
          lowStockThreshold: 5,
        },
        { upsert: true, new: true }
      );
    }

    // 5. Seed Users (Admin, Technician, Customer)
    console.log("Seeding test users...");
    const hashedPassword = await bcrypt.hash("Password@123", 10);

    const usersData = [
      {
        name: "Admin User",
        email: "admin@screencare.com",
        password: hashedPassword,
        role: "admin",
        phone: "+919999988888",
      },
      {
        name: "Ramesh Technician",
        email: "technician@screencare.com",
        password: hashedPassword,
        role: "technician",
        phone: "+919876543210",
      },
      {
        name: "John Customer",
        email: "customer@screencare.com",
        password: hashedPassword,
        role: "user",
        phone: "+919123456789",
      },
    ];

    const userMap = new Map();
    for (const u of usersData) {
      let doc = await User.findOne({ email: u.email });
      if (!doc) {
        doc = await User.create(u);
      }
      userMap.set(u.role, doc);
    }

    // 6. Seed Address for Customer (Consumer & Business)
    const customer = userMap.get("user");
    if (customer) {
      const existingAddress = await Address.findOne({ userId: customer._id });
      if (!existingAddress) {
        await Address.create({
          userId: customer._id,
          name: "John Customer",
          phone: "9123456789",
          addressLine1: "Flat 402, Green Glen Residency",
          addressLine2: "Bellandur Outer Ring Road",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560103",
          landmark: "Near EcoSpace Tech Park",
          isDefault: true,
          addressType: "consumer",
        });

        await Address.create({
          userId: customer._id,
          name: "John Customer (Office)",
          phone: "9123456789",
          addressLine1: "Tower B, Level 6, Global Tech Hub",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560037",
          isDefault: false,
          addressType: "business",
          businessName: "CloudTech Solutions Pvt Ltd",
          gstin: "29AABCU9603R1ZM",
        });
      }
    }

    console.log("\n=======================================================");
    console.log("✅ Seeding completed successfully!");
    console.log("-------------------------------------------------------");
    console.log("Test Accounts created (Password: Password@123):");
    console.log("  • Admin:      admin@screencare.com");
    console.log("  • Technician: technician@screencare.com (+91 9876543210)");
    console.log("  • Customer:   customer@screencare.com   (+91 9123456789)");
    console.log("=======================================================\n");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
