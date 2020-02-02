const amqp = require("amqplib");
const Parse = require("parse/node");
const axios = require("axios");
const config = require('../general-config')

Parse.initialize(config.appId);
Parse.serverURL = config.serverURL;

/** 公众号 */
const Account = Parse.Object.extend("Account");

/** 文章 */
const Article = Parse.Object.extend("Article");

/** 内容 */
const Content = Parse.Object.extend("Content");

const main = async () => {
  const QUEUE_NAME = "articles";
  const connect = await amqp.connect(config.amqpURI);
  const channel = await connect.createChannel();

  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.prefetch(1);

  channel.consume(
    QUEUE_NAME,
    async msg => {
      if (msg) {
        const id = msg.content.toString();
        
        console.log(`处理 ${id} `);

        const article = await new Parse.Query(Article).get(id);
        const url = article.get("content_url");
        const sn = article.get("sn");

        // @ts-ignore
        const { data: rawHtml } = await axios.get(url);

        const contentExist = await new Parse.Query(Content).equalTo("sn", sn).first();
        
        if (!contentExist) {
          const content = new Content();

          content.set("rawHtml", rawHtml);
          content.set("sn", sn);
          content.set("articleId", id);

          await content.save();
        }

        channel.ack(msg);
      }
    },
    { noAck: false }
  );
};

main();
