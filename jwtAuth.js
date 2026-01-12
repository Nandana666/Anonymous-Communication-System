const jwt = require("jsonwebtoken");
const memoryStore = require("./memoryStore");

const SECRET = "jwt-secret";
exports.SECRET = SECRET;

exports.verifyToken = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.sendStatus(403);

  try {
    req.user = jwt.verify(h.split(" ")[1], SECRET);
    next();
  } catch {
    res.sendStatus(401);
  }
};

exports.loginOfficial = ({ email, accessKey }) => {
  const official = memoryStore.getOfficial(email);
  if (!official || official.accessKey !== accessKey)
    throw new Error("Invalid credentials");

  return jwt.sign(
    { email, department: official.department },
    SECRET,
    { expiresIn: "2h" }
  );
};

exports.verifyJWTToken = (token) => {
  try { return jwt.verify(token, SECRET); }
  catch { return null; }
};
