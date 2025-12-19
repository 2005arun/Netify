const fs = require("fs");
const admin = require("firebase-admin");

const ensureFirebaseAdmin = () => {
  if (admin.apps.length) return;

  const serviceAccountPath = (process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "").trim();
  if (serviceAccountPath) {
    const raw = fs.readFileSync(serviceAccountPath, "utf8");
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
};

module.exports = async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    ensureFirebaseAdmin();
  } catch (err) {
    return res.status(500).json({ message: "Firebase admin is not configured" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { id: decoded.uid, uid: decoded.uid, email: decoded.email };
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
