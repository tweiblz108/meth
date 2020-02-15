const amqp = require("amqplib");
const Parse = require("parse/node");
const axios = require("axios");
const config = require('../general-config')
const winston = require('winston')

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'content_worker.log' })
  ]
})

/** 延时函数 */
const sleep = sec =>
  new Promise(resolve =>
    setTimeout(() => {
      resolve();
    }, sec * 1000)
  );

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

        try {
          const article = await new Parse.Query(Article).get(id);
          const url = article.get("content_url");

          await sleep(0.2)

          // @ts-ignore
          const { data: rawHtml } = await axios.get(url, {
            headers: {
              'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/605.1.15 (KHTML, like Gecko) MicroMessenger/2.3.27(0x12031b12) MacWechat Chrome/39.0.2171.95 Safari/537.36 NetType/WIFI WindowsWechat"
            }
          });

          if (rawHtml.indexOf('global_error_msg') !== -1) {
            logger.info(`ignore aritcle ${id} due to bad response`)
            channel.ack(msg)
          } else if (rawHtml.indexOf('你的访问过于频繁') !== -1) {
            console.log('你的访问过于频繁')
            logger.error(`你的访问过于频繁`)
            process.exit()
          } else {
            const content = new Content();

            content.set("rawHtml", rawHtml);
            content.set("sn", article.get('sn'));
            content.set("articleId", article.id);
            content.set('title', article.get('title'))
            content.set('digest', article.get('digest'))
            content.set('publishedAt', article.get('publishedAt'))

            await content.save();

            channel.ack(msg);
          }


        } catch (error) {
          channel.sendToQueue(QUEUE_NAME, Buffer.from(id))
          channel.ack(msg)

          logger.debug(`an error occuer while process ${id}, retry`)
        }
      }
    },
    { noAck: false }
  );
};

main();
