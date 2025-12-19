const asyncHandler = require("express-async-handler");
const User = require("../models/UserModel");

module.exports.signup = asyncHandler(async (req, res) => {
  res.status(410);
  throw new Error("Signup is handled by Firebase Authentication");
});

module.exports.login = asyncHandler(async (req, res) => {
  res.status(410);
  throw new Error("Login is handled by Firebase Authentication");
});

module.exports.me = asyncHandler(async (req, res) => {
  const uid = req.user?.uid;
  const email = req.user?.email;
  if (!uid) {
    res.status(401);
    throw new Error("Unauthorized");
  }

  let user = await User.findOne({ firebaseUid: uid });
  if (!user && email) {
    user = await User.findOne({ email });
    if (user) {
      user.firebaseUid = uid;
      await user.save();
    }
  }
  if (!user) {
    user = await User.create({ firebaseUid: uid, email: email || undefined, liked: [], myList: [] });
  }

  return res.json({
    user: {
      id: user.firebaseUid,
      email: user.email,
      liked: user.liked,
      myList: user.myList,
    },
  });
});
