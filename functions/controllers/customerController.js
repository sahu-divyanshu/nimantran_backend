const { User } = require("../models/User");

const getCustomer = async(req,res) =>{
    try {
        const {customerId} = req.params;
        const customer = await User.findById(customerId);
        res.status(200).json({
            success:true,
            message:"customer Info fetched successfully",
            data:customer
        })
    } catch (error) {
        console.error("Error fetching customer profile:", error); // Log the detailed error
        res.status(400).json({
            error: error.message,
            message: "Error Fetching Customer Info",
        });
    }
}

const updateCustomer = async (req, res) => {
    try {
      const { customerId } = req.params;
      const { name, mobile, email, gender, dateOfBirth, location } = req.body;
  
      // Find the customer by ID
      const customer = await User.findById(customerId);
      if (!customer) {
        return res.status(404).json({
          message: "Customer not found",
        });
      }
  
      // Update customer details
      if (name) customer.name = name;
      if (mobile) customer.mobile = mobile;
      if (email) customer.email = email;
      if (gender) customer.gender = gender;
      if (dateOfBirth) customer.dateOfBirth = dateOfBirth;
      if (location) customer.location = location;
  
      // Save the updated customer
      await customer.save();
  
      res.status(200).json({
        data: customer,
        message: "Customer details updated successfully",
      });
    } catch (error) {
      console.error("Error updating customer profile:", error); // Log the detailed error
      res.status(500).json({
        error: error.message,
        message: "Error updating customer info",
      });
    }
  };

module.exports = {getCustomer,updateCustomer}