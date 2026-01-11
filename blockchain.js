const crypto = require("crypto");
let chain = [];

function addBlock(message, token){
  const block = {
    index: chain.length + 1,
    timestamp: Date.now(),
    messageHash: crypto.createHash("sha256").update(message).digest("hex"),
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
    prevHash: chain.length ? chain[chain.length-1].messageHash : "0"
  };
  chain.push(block);
}

module.exports = { addBlock, chain };
