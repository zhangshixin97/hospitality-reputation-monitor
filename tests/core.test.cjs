"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");
const p = C.normalizeProperty({
  id: "hotel1",
  name: "测试酒店",
  city: "杭州",
  kind: "hotel",
});
const r = (patch) =>
  C.normalizeRecord(
    { platform: "抖音", sourceId: "123", content: "很好", ...patch },
    p,
  );
test("普通问询不计差评；低分和安全事件优先", () => {
  assert.equal(C.classify("门票多少钱？好玩吗？", p).feedbackType, "咨询");
  assert.equal(C.classify("值不值得去？", p).feedbackType, "咨询");
  assert.equal(
    C.classify("卫生很差，请问为什么不给退款？", p).sentiment,
    "负面",
  );
  assert.equal(C.classify("房间有偷拍设备，早餐多少钱", p).riskLevel, "红色");
  assert.equal(C.classify("早餐多少钱", p, 1).sentiment, "负面");
  assert.equal(C.classify("好玩不踩雷，不容错过", p).sentiment, "正面");
  assert.equal(C.classify("打铁花很震撼，畅玩只要68", p).sentiment, "正面");
  assert.equal(
    C.classify("开始时肯定很多人，要错峰，不然人挤人不好玩", p).feedbackType,
    "咨询",
  );
});
test("同一内容重复收录不增量，首次发现保持最早", () => {
  const a = r({
    observedAt: 1785772800000,
    likes: 1,
    mediaPreview: "assets/test.jpg",
  });
  const b = r({ observedAt: 1785859200000, likes: 3 });
  const list = C.dedupe([a, b]);
  assert.equal(list.length, 1);
  assert.equal(list[0].metrics.likes, 3);
  assert.equal(list[0].firstSeenAt, a.firstSeenAt);
  assert.equal(list[0].mediaPreview, "assets/test.jpg");
  assert.notEqual(r({ recordKind: "comment" }).id, a.id);
});
test("北京时间日期边界正确，未知时间不算今天", () => {
  const now = C.timestamp("2026-10-13T00:30:00+08:00");
  assert.equal(
    C.inRange(r({ publishedAt: "2026-10-12T23:59:59+08:00" }), "today", now),
    false,
  );
  assert.equal(
    C.inRange(r({ publishedAt: "2026-10-13T00:01:00+08:00" }), "today", now),
    true,
  );
  assert.equal(C.inRange(r({ publishedAt: null }), "today", now), false);
  assert.equal(
    C.timestamp("2026/8/4 00:57:54"),
    Date.parse("2026-08-04T00:57:54+08:00"),
  );
});
test("24小时趋势排除历史及未来，并包括窗口首尾", () => {
  const now = C.timestamp("2026-10-13T12:45:00+08:00");
  const times = [now - 86400001, now - 86400000, now - 1000, now, now + 1];
  const list = times.map((t, i) => r({ sourceId: String(i), publishedAt: t }));
  assert.equal(
    C.hourly(list, now).reduce((n, b) => n + b.count, 0),
    3,
  );
});
test("SLA按首次发现计算，已回复不再计超时", () => {
  const firstSeenAt = C.timestamp("2026-10-13T08:00:00+08:00");
  const record = r({
    content: "房型不符",
    observedAt: firstSeenAt,
    publishedAt: "2026-09-01",
  });
  const now = C.timestamp("2026-10-13T11:00:00+08:00");
  assert.equal(C.sla(record, p, now).overdue, true);
  assert.equal(C.sla({ ...record, status: "已回复" }, p, now).overdue, false);
  assert.equal(C.isPending({ ...record, status: "已回复" }), false);
});
test("处置流转需要责任人、实际回复和复盘", () => {
  const record = r({ content: "服务差" });
  assert.throws(() => C.validateWorkflow(record, { status: "已回复" }), /依次/);
  assert.throws(
    () => C.validateWorkflow(record, { status: "已派单", owner: "" }),
    /负责人/,
  );
  assert.throws(
    () =>
      C.validateWorkflow(
        { ...record, status: "处理中" },
        { status: "已回复", owner: "客服" },
      ),
    /回复/,
  );
  assert.throws(
    () =>
      C.validateWorkflow(
        { ...record, status: "已回复" },
        { status: "已复盘", owner: "客服", reply: "已回复" },
      ),
    /复盘/,
  );
});
test("导入拒绝不合法记录；不信任链接及自动闭环状态", () => {
  assert.equal(C.safeUrl("javascript:alert(1)"), "");
  assert.equal(C.imageUrl("../cookie.txt"), "");
  assert.equal(C.imageUrl("data:image/svg+xml;base64,xx"), "");
  assert.equal(r({ status: "已复盘" }).status, "待研判");
  assert.throws(
    () =>
      C.normalizeBundle({
        properties: [p],
        records: [{ platform: "抖音", content: "" }],
      }),
    /第1条/,
  );
  assert.throws(
    () =>
      C.normalizeRecord({ platform: "携程", content: "体验", rating: 9 }, p),
    /评分/,
  );
});
test("只有明确自述才能形成客源判断", () => {
  assert.equal(
    r({ content: "平潭旅游攻略，上海也有这样的海景" }).origin.type,
    "未识别",
  );
  assert.equal(r({ content: "我是杭州人，体验不错" }).origin.type, "疑似本地");
  assert.equal(r({ content: "我是说书人，我喜欢旅游" }).origin.type, "未识别");
});
