
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    unique: true,
    sparse: true,
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    max: 50,
  },
  passwordHash: {
    type: String,
    required: false,
  },
  liked: {
    type: [Object],
    default: [],
  },
  myList: {
    type: [Object],
    default: [],
  },
}, { timestamps: true });

module.exports = mongoose.model("users", userSchema);
