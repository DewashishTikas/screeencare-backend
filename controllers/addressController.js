import Address from "../models/addressModel.js";

/**
 * POST /addresses
 * Store an address for the logged-in user (consumer or business)
 */
export async function createAddress(req, res) {
  try {
    const userId = req.user._id;
    const {
      name,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      landmark,
      isDefault,
      addressType = "consumer",
      businessName,
      gstin,
      pan,
    } = req.body;

    if (!name || !phone || !addressLine1 || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        error: "Name, phone, addressLine1, city, state, and pincode are required",
      });
    }

    // Business-specific validations
    if (addressType === "business") {
      if (!businessName || !businessName.trim()) {
        return res.status(400).json({
          success: false,
          error: "Business name is required for business addresses",
        });
      }
    }

    // Check if this is the user's first address, make it default if so
    const existingCount = await Address.countDocuments({ userId });
    const shouldBeDefault = existingCount === 0 ? true : Boolean(isDefault);

    const newAddress = new Address({
      userId,
      name: name.trim(),
      phone: phone.trim(),
      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2 ? addressLine2.trim() : "",
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      landmark: landmark ? landmark.trim() : "",
      isDefault: shouldBeDefault,
      addressType,
      businessName: addressType === "business" && businessName ? businessName.trim() : null,
      gstin: addressType === "business" && gstin ? gstin.trim().toUpperCase() : null,
      pan: addressType === "business" && pan ? pan.trim().toUpperCase() : null,
    });

    await newAddress.save();

    return res.status(201).json({
      success: true,
      message: "Address saved successfully",
      data: newAddress,
    });
  } catch (error) {
    console.error("Error in createAddress:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /addresses
 * Get all addresses of the logged-in user
 */
export async function getAddresses(req, res) {
  try {
    const userId = req.user._id;
    const addresses = await Address.find({ userId }).sort({ isDefault: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: addresses.length,
      data: addresses,
    });
  } catch (error) {
    console.error("Error in getAddresses:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * GET /addresses/:id
 * Get single address of logged-in user
 */
export async function getAddressById(req, res) {
  try {
    const userId = req.user._id;
    const address = await Address.findOne({ _id: req.params.id, userId });

    if (!address) {
      return res.status(404).json({ success: false, error: "Address not found" });
    }

    return res.status(200).json({ success: true, data: address });
  } catch (error) {
    console.error("Error in getAddressById:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * PUT /addresses/:id
 * Update an existing address
 */
export async function updateAddress(req, res) {
  try {
    const userId = req.user._id;
    const address = await Address.findOne({ _id: req.params.id, userId });

    if (!address) {
      return res.status(404).json({ success: false, error: "Address not found" });
    }

    const {
      name,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      landmark,
      isDefault,
      addressType,
      businessName,
      gstin,
      pan,
    } = req.body;

    if (name) address.name = name.trim();
    if (phone) address.phone = phone.trim();
    if (addressLine1) address.addressLine1 = addressLine1.trim();
    if (addressLine2 !== undefined) address.addressLine2 = addressLine2.trim();
    if (city) address.city = city.trim();
    if (state) address.state = state.trim();
    if (pincode) address.pincode = pincode.trim();
    if (landmark !== undefined) address.landmark = landmark.trim();
    if (isDefault !== undefined) address.isDefault = Boolean(isDefault);
    if (addressType) address.addressType = addressType;
    if (businessName !== undefined) address.businessName = businessName ? businessName.trim() : null;
    if (gstin !== undefined) address.gstin = gstin ? gstin.trim().toUpperCase() : null;
    if (pan !== undefined) address.pan = pan ? pan.trim().toUpperCase() : null;

    await address.save();

    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      data: address,
    });
  } catch (error) {
    console.error("Error in updateAddress:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * PATCH /addresses/:id/default
 * Set address as default
 */
export async function setDefaultAddress(req, res) {
  try {
    const userId = req.user._id;
    const address = await Address.findOne({ _id: req.params.id, userId });

    if (!address) {
      return res.status(404).json({ success: false, error: "Address not found" });
    }

    address.isDefault = true;
    await address.save();

    return res.status(200).json({
      success: true,
      message: "Default address updated successfully",
      data: address,
    });
  } catch (error) {
    console.error("Error in setDefaultAddress:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

/**
 * DELETE /addresses/:id
 * Delete address
 */
export async function deleteAddress(req, res) {
  try {
    const userId = req.user._id;
    const deleted = await Address.findOneAndDelete({ _id: req.params.id, userId });

    if (!deleted) {
      return res.status(404).json({ success: false, error: "Address not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteAddress:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
