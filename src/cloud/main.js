const moment = require("moment");
const amqp = require("amqplib");
const config = require("../../general-config.js");
const winston = require('winston')

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'cloud.log' })
  ]
})

/** 公众号 */
const Account = Parse.Object.extend("Account");

/** 文章 */
const Article = Parse.Object.extend("Article");

/** 内容 */
const Content = Parse.Object.extend("Content");

/** 帖子 */
const Post = Parse.Object.extend("Post");

const main = async () => {
  const connect = await amqp.connect(config.amqpURI);
  const channel = await connect.createChannel();

  Parse.Cloud.define("foo", async request => {
    return "bar";
  });

  /** 刷新公众号，生成工作队列 */
  Parse.Cloud.job("walkAccounts", async () => {
    const QUEUE_NAME = "accounts";

    await channel.assertQueue(QUEUE_NAME, { durable: false });
    await channel.purgeQueue(QUEUE_NAME);

    const accounts = await Parse.Query.or(
      new Parse.Query(Account).doesNotExist("visitedAt"),
      new Parse.Query(Account).lessThanOrEqualTo(
        "visitedAt",
        moment()
          .subtract(7, "day")
          .toDate()
      )
      // @ts-ignore
    ).map(account => {
      channel.sendToQueue(QUEUE_NAME, Buffer.from(account.get("biz")));
    });
  });

  Parse.Cloud.job('生成 articles 抓取队列', async () => {
    const QUEUE_NAME = "articles";

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.purgeQueue(QUEUE_NAME);

    await new Parse.Query(Article).each(async article => {
      const sn = article.get('sn')

      const content = await new Parse.Query(Content).equalTo('sn', sn).first()

      if (!content) {
        channel.sendToQueue(QUEUE_NAME, Buffer.from(article.id));

        logger.info(`saved ${article.id} to queue articles`)
      } else {
        logger.info(`ignored ${article.id} to queue articles`)
      }
    });
  })

  Parse.Cloud.job('生成 contents 抓取队列', async () => {
    const QUEUE_NAME = "contents";

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    await channel.purgeQueue(QUEUE_NAME);

    await new Parse.Query(Content).each(async content => {
      const sn = content.get('sn')

      const post = await new Parse.Query(Post).equalTo('sn', sn).first()

      if (!post) {
        channel.sendToQueue(QUEUE_NAME, Buffer.from(content.id));

        logger.info(`saved ${content.id} to queue contents`)
      } else {
        logger.info(`ignored ${content.id} to queue contents`)
      }
    });
  })

  /** 保存文章后，存入爬取文章内容队列 */
  Parse.Cloud.afterSave(Article, async request => {
    const QUEUE_NAME = "articles";

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.sendToQueue(QUEUE_NAME, Buffer.from(request.object.id));
  });

  /** 保存内容后，存入向 wp 报告内容的队列 */
  Parse.Cloud.afterSave(Content, async request => {
    const QUEUE_NAME = "contents";

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.sendToQueue(QUEUE_NAME, Buffer.from(request.object.id));
  });
};

main();
