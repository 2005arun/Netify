const {
  getLiked,
  like,
  unlike,
  getMyList,
  addToMyList,
  removeFromMyList,
} = require("../controllers/UserController");

const router = require("express").Router();
const auth = require("../middleware/auth");

router.get("/liked", auth, getLiked);
router.post("/liked", auth, like);
router.delete("/liked", auth, unlike);

router.get("/mylist", auth, getMyList);
router.post("/mylist", auth, addToMyList);
router.delete("/mylist", auth, removeFromMyList);

module.exports = router;