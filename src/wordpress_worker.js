const amqp = require("amqplib");
const WPAPI = require("wpapi");
const { JSDOM } = require("jsdom");
const Parse = require("parse/node");
const config = require('../general-config')
const categories = require('./categories.json')
const R = require('ramda')

const winston = require('winston')

/** 延时函数 */
const sleep = sec =>
  new Promise(resolve =>
    setTimeout(() => {
      resolve();
    }, sec * 1000)
  );

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'wordpress_worker.log' })
  ]
})

Parse.initialize(config.appId);
Parse.serverURL = config.serverURL;

/** 公众号 */
const Account = Parse.Object.extend("Account");

/** 文章 */
const Article = Parse.Object.extend("Article");

/** 内容 */
const Content = Parse.Object.extend("Content");

/** Wordpress */
const Post = Parse.Object.extend("Post");

const wp = new WPAPI({
  endpoint: config.endpoint,
  username: config.wpUsername,
  password: config.wpPassword
});

const feedWordPress = async content => {
  const rawHtml = content.get('rawHtml')
  const title = content.get('title')
  const date_gmt = content.get('publishedAt')
  const excerpt = content.get("digest")
  const category = content.get('category')

  const document = new JSDOM(rawHtml).window.document;

  const jsContent = document.querySelector("#js_content");

  if (jsContent) {
    jsContent.style.visibility = "visible";

    jsContent.querySelectorAll("img").forEach(e => {
      if (e.dataset["src"]) {
        e.src = e.dataset["src"]; //+ '&tp=webp&wxfrom=5&wx_lazy=1&wx_co=1'
        e.style.margin = "0 auto";

        // 绕过微信的防盗链
        e.setAttribute("referrerpolicy", "no-referrer");
      }
    });

    jsContent.querySelectorAll('iframe').forEach(e => { e.remove() })

    const categoryId = R.call(() => {
      if (R.isEmpty(category)) {
        return 1 // 未分类
      } else {
        const id = categories[category]

        if (R.isNil(id)) {
          return 1 // 未分类
        } else {
          return id
        }
      }
    })

    const { id } = await wp.posts().create({
      title,
      date_gmt,
      excerpt,
      content: jsContent.outerHTML,
      status: "publish",
      categories: [categoryId]
    });

    const post = new Post()
    post.set('sn', content.get('sn'))
    post.set('contentId', content.id)
    post.set('postId', id)
    await post.save()
  } else {
    logger.info(`ignored ${content.id} ${title}`)
  }
};

const main = async () => {
  const QUEUE_NAME = "contents";
  const connect = await amqp.connect("amqp://localhost");
  const channel = await connect.createChannel();

  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.prefetch(2);

  channel.consume(
    QUEUE_NAME,
    async msg => {
      if (msg) {
        const id = msg.content.toString();

        try {
          const content = await new Parse.Query(Content).get(id);
          await feedWordPress(content);

        } catch (error) {
          logger.error(error);
          channel.sendToQueue(QUEUE_NAME, Buffer.from(id))
        } finally {
          channel.ack(msg);
        }
      }
    },
    { noAck: false }
  );
};

main();
