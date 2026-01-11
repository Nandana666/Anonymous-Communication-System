const jwt = require("jsonwebtoken");
const SECRET = "jwt-secret";

exports.SECRET = SECRET;

exports.verifyJWT = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.sendStatus(403);
  try {
    jwt.verify(token, SECRET);
    next();
  } catch {
    res.sendStatus(401);
  }
};
