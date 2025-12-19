const asyncHandler = require("express-async-handler");
const User = require("../models/UserModel");

const getOrCreateUser = async ({ uid, email }) => {
  if (!uid) return null;
  let user = await User.findOne({ firebaseUid: uid });
  if (user) return user;

  if (email) {
    user = await User.findOne({ email });
    if (user) {
      user.firebaseUid = uid;
      await user.save();
      return user;
    }
  }

  user = await User.create({ firebaseUid: uid, email: email || undefined, liked: [], myList: [] });
  return user;
};

const normalizeItem = (data) => {
  if (!data || typeof data !== "object") return null;
  const id = data.id;
  if (id === undefined || id === null) return null;
  return {
    id: data.id,
    type: data.type || "movie",
    title: data.title || data.name || "",
    overview: data.overview || "",
    year: data.year || "",
    image: data.image || null,
    genres: Array.isArray(data.genres) ? data.genres : [],
  };
};

module.exports.getLiked = asyncHandler(async (req, res) => {
  const user = await getOrCreateUser({ uid: req.user?.uid, email: req.user?.email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  return res.json({ items: user.liked || [] });
});

module.exports.like = asyncHandler(async (req, res) => {
  const item = normalizeItem(req.body?.data);
  if (!item) {
    res.status(400);
    throw new Error("Invalid item");
  }
  const user = await getOrCreateUser({ uid: req.user?.uid, email: req.user?.email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const exists = (user.liked || []).some((x) => x.id === item.id && x.type === item.type);
  if (!exists) {
    user.liked.push(item);
    await user.save();
  }
  return res.json({ items: user.liked });
});

module.exports.unlike = asyncHandler(async (req, res) => {
  const { id, type } = req.body || {};
  if (id === undefined || id === null) {
    res.status(400);
    throw new Error("Missing id");
  }
  const mediaType = type || "movie";
  const user = await getOrCreateUser({ uid: req.user?.uid, email: req.user?.email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  user.liked = (user.liked || []).filter((x) => !(x.id === id && x.type === mediaType));
  await user.save();
  return res.json({ items: user.liked });
});

module.exports.getMyList = asyncHandler(async (req, res) => {
  const user = await getOrCreateUser({ uid: req.user?.uid, email: req.user?.email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  return res.json({ items: user.myList || [] });
});

module.exports.addToMyList = asyncHandler(async (req, res) => {
  const item = normalizeItem(req.body?.data);
  if (!item) {
    res.status(400);
    throw new Error("Invalid item");
  }
  const user = await getOrCreateUser({ uid: req.user?.uid, email: req.user?.email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const exists = (user.myList || []).some((x) => x.id === item.id && x.type === item.type);
  if (!exists) {
    user.myList.push(item);
    await user.save();
  }
  return res.json({ items: user.myList });
});

module.exports.removeFromMyList = asyncHandler(async (req, res) => {
  const { id, type } = req.body || {};
  if (id === undefined || id === null) {
    res.status(400);
    throw new Error("Missing id");
  }
  const mediaType = type || "movie";
  const user = await getOrCreateUser({ uid: req.user?.uid, email: req.user?.email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  user.myList = (user.myList || []).filter((x) => !(x.id === id && x.type === mediaType));
  await user.save();
  return res.json({ items: user.myList });
});