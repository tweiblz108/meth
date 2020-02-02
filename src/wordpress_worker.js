const amqp = require("amqplib");
const WPAPI = require("wpapi");
const { JSDOM } = require("jsdom");
const Parse = require("parse/node");
const config = require('../general-config')

Parse.initialize(config.appId);
Parse.serverURL = config.serverURL;

/** 公众号 */
const Account = Parse.Object.extend("Account");

/** 文章 */
const Article = Parse.Object.extend("Article");

/** 内容 */
const Content = Parse.Object.extend("Content");

const wp = new WPAPI({
  endpoint: config.endpoint,
  username: config.wpUsername,
  password: config.wpPassword
});

const feedWordPress = async rawHtml => {
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
  }

  const activityName = document
    .querySelector("#activity-name")
    .innerHTML.trim();
  const wpContent = jsContent.outerHTML;

  return wp.posts().create({
    title: activityName,
    content: wpContent,
    status: "publish"
  });
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
        try {
          const id = msg.content.toString();
          console.log(`处理 ${id}`)
          const content = await new Parse.Query(Content).get(id);

          const rawHtml = content.get("rawHtml");

          await feedWordPress(rawHtml);

          
        } catch (error) {
          console.error(error);
        } finally {
          channel.ack(msg);
        }
      }
    },
    { noAck: false }
  );
};

main();
