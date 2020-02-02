const moment = require("moment");
const amqp = require("amqplib");
const config = require("../../general-config.js");

/** 公众号 */
const Account = Parse.Object.extend("Account");

/** 文章 */
const Article = Parse.Object.extend("Article");

/** 内容 */
const Content = Parse.Object.extend("Content");

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
