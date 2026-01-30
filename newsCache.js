const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 1800, checkperiod: 120 }); // Increased to 30 mins

module.exports = cache;
