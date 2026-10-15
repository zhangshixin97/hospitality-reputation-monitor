window.createTravelDemo = function (now = Date.now()) {
  const C = window.TravelPulse,
    W = window.TravelWorkspace;
  const property = C.normalizeProperty({
    id: "demo-coast",
    name: "示例 · 海岸旅居",
    kind: "homestay",
    city: "厦门",
    aliases: ["海岸旅居"],
    owners: ["值班经理", "前厅部", "客房部", "工程部", "市场运营"],
    slaHours: { 红色: 1, 橙色: 2, 黄色: 24 },
  });
  const rows = [
    ["携程", "房间床单脏，床头还有残留污渍，希望认真检查卫生。", 2, 3, 1.5],
    ["美团", "隔音差，凌晨走廊很吵，一夜没睡。", 1, 8, 5],
    ["小红书", "退改沟通了两次，仍不给退款，说明和预订时不一样。", null, 9, 4],
    ["门店反馈", "住客反映房间内疑似有偷拍设备，要求立即核实。", null, 1, 0.4],
    ["抖音", "从机场怎么去？停车方便吗？早餐几点开始？", null, 4, 2],
    ["小红书", "房间明亮很干净，服务很好，早餐也很棒。", null, 28, 24],
    [
      "携程",
      "之前卫生差，门店已经安排重新清洁，想看后续有没有改善。",
      3,
      50,
      48,
    ],
    ["大众点评", "设备坏了没人处理，没有热水，晚上体验很差。", 2, 30, 26],
  ];
  const records = rows.map(
    ([platform, content, rating, publishedHours, observedHours], i) =>
      C.normalizeRecord(
        {
          platform,
          sourceId: "demo-" + (i + 1),
          recordKind: "comment",
          content,
          rating,
          publishedAt: now - publishedHours * 3600000,
          observedAt: now - observedHours * 3600000,
          sourceAccount: "示例住客",
          source: "模拟点评",
          provenance: "模拟演示数据",
          evidenceNote: "虚构场景，没有真实账号、订单或原链接。",
          likes: null,
          comments: null,
          shares: null,
        },
        property,
      ),
  );
  const base = {
    schemaVersion: 2,
    properties: [property],
    records,
    batches: [
      {
        id: "demo-batch",
        label: "模拟酒旅运营场景",
        propertyId: property.id,
        observedAt: now,
        importedAt: now,
        count: records.length,
      },
    ],
    channels: [...new Set(records.map((r) => r.platform))].map((platform) => ({
      platform,
      propertyId: property.id,
      state: "sample",
      lastSuccessAt: now,
      note: "模拟演示数据，不代表平台真实覆盖。",
    })),
  };
  let saved = W.empty();
  for (const index of [6, 7]) {
    const r = records[index];
    for (const status of ["已派单", "处理中", "已回复", "已复盘"]) {
      saved = W.saveWorkflow(
        saved,
        {
          ...r,
          status:
            status === "已派单"
              ? "待研判"
              : C.STATUSES[C.STATUSES.indexOf(status) - 1],
        },
        {
          status,
          owner: r.owner,
          reply: "示例：已记录实际处理并告知住客。",
          review: "示例：需持续检查整改效果。",
          note: "模拟处置记录",
          sentiment: r.sentiment,
          riskLevel: r.riskLevel,
          verification: "verified",
        },
        now - 12 * 3600000,
      );
    }
  }
  saved.actions = [
    {
      id: "demo-action",
      propertyId: property.id,
      topic: "卫生与餐饮",
      title: "增加交房前床品与床头双人复查",
      owner: "客房部",
      dueAt: now + 24 * 3600000,
      status: "整改中",
      result: "",
      createdAt: now - 5 * 3600000,
      updatedAt: now - 2 * 3600000,
    },
  ];
  return { base: C.normalizeBundle(base), saved };
};
