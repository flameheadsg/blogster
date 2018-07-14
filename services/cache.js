const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');
const exec = mongoose.Query.prototype.exec;
const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.hget = util.promisify(client.hget);

mongoose.Query.prototype.cache = function(options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');

  return this;
}

mongoose.Query.prototype.exec = async function() {
  if (!this.useCache) {
    console.log('QUERYING MONGODB');
    return exec.apply(this, arguments);
  } else {
    const key = JSON.stringify(Object.assign({}, this.getQuery(), {
      collection: this.mongooseCollection.name
    }));

    const cacheVal = await client.hget(this.hashKey, key);

    if (cacheVal) {
      const doc = JSON.parse(cacheVal);

      return Array.isArray(doc)
        ? doc.map(doc => new this.model(doc))
        : new this.model(doc);

      console.log('RETRIEVING VALUE FROM CACHE');
      return doc;
    } else {
      const res = await exec.apply(this, arguments);

      client.hset(this.hashKey, key, JSON.stringify(res), 'EX', 15);

      console.log('STORING VALUE IN CACHE');
      return res;
    }
  }
}

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  }
};
