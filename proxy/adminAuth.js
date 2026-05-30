import jwt from "jsonwebtoken";

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.JWT_SECRET;

// Validates the short-lived session token issued by POST /admin-auth/login
// (sent back as the x-admin-key header). Credential checking — and the
// brute-force lockout — live in adminLogin.js, the only place raw
// passwords/2FA codes are ever compared.
export function adminAuth(req, res, next) {
  const token = req.headers["x-admin-key"];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, SESSION_SECRET);
    if (decoded.role !== "admin") throw new Error("wrong role");
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
