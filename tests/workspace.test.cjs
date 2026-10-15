"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../core.js"),
  W = require("../workspace.js"),
  I = require("../importer.js"),
  O = require("../operations.js");
const p = C.normalizeProperty({
  id: "hotel-test",
  name: "测试酒店",
  kind: "hotel",
  city: "厦门",
});
const record = (raw) =>
  C.normalizeRecord(
    { platform: "携程", sourceId: "review-1", content: "隔音差", ...raw },
    p,
  );
const base = (records = []) => ({
  schemaVersion: 2,
  properties: [p],
  records,
  channels: [],
  batches: [],
});
test("未知发现时间的重复记录不会产生Infinity", () => {
  const r = record({ observedAt: null });
  const merged = C.dedupe([r, r])[0];
  assert.equal(merged.firstSeenAt, null);
  assert.equal(C.sla(merged, p, Date.now()).dueAt, null);
});
test("严格校验日期，仅日期不进入小时图；否定安全事件不误报", () => {
  assert.equal(C.timestamp("2026-02-31"), null);
  assert.equal(C.timestamp("昨天"), null);
  assert.equal(C.timestamp("10-14 08:00"), null);
  const r = record({ publishedAt: "2026-10-14" }),
    now = C.timestamp("2026-10-14T12:00:00+08:00");
  assert.equal(r.publishedPrecision, "day");
  assert.equal(C.inRange(r, "24h", now), false);
  assert.equal(
    C.hourly([r], now).reduce((n, b) => n + b.count, 0),
    0,
  );
  assert.notEqual(C.classify("未发现偷拍设备，服务很好", p).riskLevel, "红色");
});
test("旧来源批次不会倒退最新收录时间", () => {
  const channels = W.mergeChannels([
    {
      propertyId: p.id,
      platform: "抖音",
      state: "partial",
      lastSuccessAt: 100,
    },
    { propertyId: p.id, platform: "抖音", state: "sample", lastSuccessAt: 50 },
  ]);
  assert.equal(channels[0].lastSuccessAt, 100);
  assert.equal(channels[0].state, "partial");
});
test("人工调整优先级有效；来源改变后需重新研判", () => {
  const r = record({ observedAt: 1785772800000 });
  let saved = W.saveWorkflow(
    W.empty(),
    r,
    {
      status: "已派单",
      owner: "前厅部",
      sentiment: "负面",
      riskLevel: "红色",
      verification: "verified",
      note: "核实",
    },
    1785772800001,
  );
  let view = W.build(base([r]), saved).records[0];
  assert.equal(view.riskScore, 90);
  assert.equal(view.verification, "verified");
  saved.records = [
    record({ content: "没有热水，情况变化", observedAt: 1785859200000 }),
  ];
  view = W.build(base([r]), saved).records[0];
  assert.equal(view.status, "待研判");
  assert.equal(view.verification, "pending");
  assert.equal(view.evidenceChanged, true);
});
test("未填写真实处理结果的草稿不能作为已回复", () => {
  const r = { ...record(), status: "处理中" };
  assert.throws(
    () =>
      W.saveWorkflow(
        W.empty(),
        r,
        {
          status: "已回复",
          owner: "前厅部",
          reply: O.responseDraft(r, p),
          sentiment: r.sentiment,
          riskLevel: r.riskLevel,
        },
        Date.now(),
      ),
    /真实处理结果/,
  );
});
test("多个对象重复导入不新增批次，备份恢复对象配置与整改", () => {
  const current = base(),
    incoming = C.normalizeBundle({
      properties: [{ ...p, name: "新名称" }],
      records: [record()],
    });
  const action = {
    id: "action-1",
    propertyId: p.id,
    title: "检查隔音",
    topic: "噪音与睡眠",
    owner: "工程部",
    status: "整改中",
    dueAt: 1785859200000,
    createdAt: 1785772800000,
    updatedAt: 1785772800000,
  };
  const input = { workspaceBackup: true, actions: [action], workflow: {} };
  const first = W.mergeImport(
    W.empty(),
    current,
    incoming,
    input,
    { id: "test-batch", label: "backup" },
    1785772800000,
  );
  const built = W.build(current, first.saved);
  assert.equal(built.properties[0].name, "新名称");
  assert.equal(built.actions.length, 1);
  const again = W.mergeImport(
    first.saved,
    built,
    incoming,
    input,
    { id: "test-batch", label: "backup" },
    1785772800001,
  );
  assert.equal(again.duplicate, true);
  assert.equal(again.saved.batches.length, 1);
});
test("中文点评CSV预览、平台缺失和门店混入检查", () => {
  const text =
    '点评内容,点评时间,点评ID,酒店名称\n"床单脏，卫生差",2026-10-14T08:00:00+08:00,id2,测试酒店\n';
  assert.equal(I.prepare(text, "reviews.csv", p).missingPlatform, true);
  const parsed = I.prepare(text, "reviews.csv", p, "携程");
  assert.equal(parsed.incoming.records.length, 1);
  assert.equal(parsed.errors.length, 0);
  const mixed = I.prepare(
    text.replace("测试酒店", "别的酒店"),
    "reviews.csv",
    p,
    "携程",
  );
  assert.match(mixed.errors[0].message, /不符/);
  const wrong = I.prepare(
    text.replace("2026-10-14T08:00:00+08:00", "昨天"),
    "reviews.csv",
    p,
    "携程",
  );
  assert.equal(wrong.errors.length, 1);
});
test("大盘数据各层守恒，未知反馈不被发明成地理分布", () => {
  const flow = O.monitorFlow([
    record(),
    record({ sourceId: "second", content: "服务很好", platform: "抖音" }),
  ]);
  assert.equal(
    flow.links
      .filter((l) => l.source.startsWith("平台:"))
      .reduce((n, l) => n + l.value, 0),
    2,
  );
  assert.equal(
    flow.links
      .filter((l) => l.source.startsWith("情感:"))
      .reduce((n, l) => n + l.value, 0),
    2,
  );
  assert.equal(
    flow.nodes.some((n) => n.name.includes("厦门")),
    false,
  );
});
test("大盘情感、红橙、无需跟进筛选与相应数字一致", () => {
  const rows = [
    record(),
    record({ sourceId: "neutral", content: "请问早餐几点？" }),
    record({ sourceId: "positive", content: "服务很好" }),
    record({ sourceId: "yellow", content: "常规体验记录", rating: 3 }),
  ];
  assert.equal(O.selectFeedback(rows, { sentiment: "中性" }).length, 2);
  assert.equal(O.selectFeedback(rows, { level: "high" }).length, 1);
  assert.equal(O.selectFeedback(rows, { scope: "risk" }).length, 2);
  assert.equal(O.selectFeedback(rows, { status: "none" }).length, 1);
  assert.equal(O.selectFeedback(rows, { status: "待研判" }).length, 3);
});
test("CSV导出格式再次导入保留来源标识、类型、评分和日期精度", () => {
  const parsed = I.prepare(
    "平台,记录类型,内容,源标识,发布时间,评分,赞\n携程,comment,体验待改善,review-export,2026-10-14,3,8\n",
    "export.csv",
    p,
  );
  const row = parsed.incoming.records[0];
  assert.equal(row.sourceId, "review-export");
  assert.equal(row.recordKind, "comment");
  assert.equal(row.rating, 3);
  assert.equal(row.metrics.likes, 8);
  assert.equal(row.publishedPrecision, "day");
});
