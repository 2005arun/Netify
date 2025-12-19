const router = require("express").Router();
const { getGenres, discover, trailer, trending, sections } = require("../controllers/CatalogController");

router.get("/genres", getGenres);
router.get("/discover", discover);
router.get("/sections", sections);
router.get("/trailer", trailer);
router.get("/trending", trending);

module.exports = router;
