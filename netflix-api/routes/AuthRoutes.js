const router = require("express").Router();
const auth = require("../middleware/auth");
const { signup, login, me } = require("../controllers/AuthController");

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", auth, me);

module.exports = router;
