const express = require("express");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const userRoutes = require("./routes/UserRoutes");
const authRoutes = require("./routes/AuthRoutes");
const catalogRoutes = require("./routes/CatalogRoutes");
const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(compression());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10kb" }));

const DEFAULT_CACHE_SECONDS = 60;
app.use((req, res, next) => {
  if (req.method === "GET") {
    res.set(
      "Cache-Control",
      `public, max-age=${DEFAULT_CACHE_SECONDS}, stale-while-revalidate=${DEFAULT_CACHE_SECONDS}`
    );
  }
  next();
});

const mongoOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 50,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
};

mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/netify", mongoOptions)
  .then(() => {
    console.log("DB Connection Successfully");
  })
  .catch((err) => {
    console.log(err.message);
  });

app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/user", userRoutes);

app.use((err, req, res, next) => {
  const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  return res.status(status).json({
    message: err.message || "Server error",
  });
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`server started on port ${process.env.PORT || 5000}`);
});