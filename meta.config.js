const fs = require("fs");
const R = require("ramda");

const meta = {
  appId: "MegaRaptor",
  masterKey: "tweiblz108",
  wpUsername: "admin",
  wpPassword: "YN9GA80YP*nu9(AYmeZyy#Qz",
  appName: "MegaRaptor",
  serverURL: "http://localhost:1337/parse",
  databaseURI: "mongodb://localhost:27017/megaraptor",
  amqpURI: "amqp://localhost",
  endpoint: "https://www.mewsq.xyz/wp-json/"
};

const configs = {
  "general-config.js": meta,
  "parse-dashboard-config.json": {
    apps: [
      {
        serverURL: meta.serverURL,
        appId: meta.appId,
        masterKey: meta.masterKey,
        appName: meta.appName
      }
    ]
  },
  "parse-server-config.json": {
    appId: meta.appId,
    masterKey: meta.masterKey,
    appName: meta.appName,
    cloud: "./src/cloud/main",
    databaseURI: meta.databaseURI
  }
};

R.compose(
  R.forEach(([name, entries]) => {
    if (R.endsWith(".json", name)) {
      fs.writeFileSync(name, JSON.stringify(entries, null, 2));
    } else {
      fs.writeFileSync(
        name,
        `module.exports = ${JSON.stringify(entries, null, 2)}`
      );
    }
  }),
  R.toPairs
)(configs);
