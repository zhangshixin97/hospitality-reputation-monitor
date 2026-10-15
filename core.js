(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TravelPulse = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const PLATFORMS = [
    "抖音",
    "小红书",
    "携程",
    "美团",
    "大众点评",
    "百度地图",
    "高德地图",
    "视频号",
    "门店反馈",
  ];
  const STATUSES = ["待研判", "已派单", "处理中", "已回复", "已复盘"];
  const LEVELS = ["红色", "橙色", "黄色", "普通"];
  const KINDS = { hotel: "酒店", homestay: "民宿", attraction: "景区" };
  const rules = [
    {
      topic: "安全与隐私",
      level: "红色",
      owner: "值班经理",
      words: [
        "偷拍",
        "针孔摄像",
        "泄露个人",
        "受伤",
        "触电",
        "溺水",
        "食物中毒",
        "被打",
        "火灾",
      ],
      advice:
        "先联系现场负责人核实人身安全、事实和证据，保全记录，及时启动应急响应。",
    },
    {
      topic: "卫生与餐饮",
      level: "橙色",
      owner: "客房部",
      words: [
        "床单脏",
        "床单有血",
        "有蟑螂",
        "有臭虫",
        "发霉",
        "卫生很差",
        "卫生差",
        "不干净",
        "饭菜变质",
        "吃坏肚子",
        "餐饮卫生差",
      ],
      advice: "核查房间或餐饮批次及清洁记录，提供处理方案，并记录整改结果。",
    },
    {
      topic: "预订与退改",
      level: "橙色",
      owner: "前厅部",
      words: [
        "拒绝退款",
        "不给退款",
        "无法退款",
        "退不了",
        "重复扣款",
        "临时加价",
        "到店没房",
        "无房可住",
        "乱收费",
        "被宰",
        "被骗",
        "宰客",
      ],
      advice:
        "核查订单、价格与退改约定，给出处理负责人和明确时间；沟通时避免公开订单信息。",
    },
    {
      topic: "房型与设施",
      level: "橙色",
      owner: "工程部",
      kinds: ["hotel", "homestay"],
      words: [
        "房型不符",
        "与图片不符",
        "照骗",
        "空调坏",
        "没有热水",
        "没热水",
        "设备坏",
        "设施破旧",
      ],
      advice:
        "核对售卖图片、房型描述和设备状态，安排维修或调房，并同步更新平台信息。",
    },
    {
      topic: "噪音与睡眠",
      level: "橙色",
      owner: "前厅部",
      kinds: ["hotel", "homestay"],
      words: [
        "隔音差",
        "隔音不好",
        "吵得",
        "吵到",
        "吵死",
        "噪音大",
        "睡不着",
        "一夜没睡",
      ],
      advice: "核实噪音时段和来源，安排安静房间或现场协调，记录后续改善。",
    },
    {
      topic: "服务与体验",
      level: "橙色",
      owner: "值班经理",
      words: [
        "态度差",
        "态度恶劣",
        "服务差",
        "没人管",
        "不理人",
        "差评",
        "不好玩",
        "不值",
        "后悔",
        "避雷",
        "踩雷",
        "体验很差",
      ],
      advice:
        "核查具体经历，联系相应责任团队，确认补救方案后回复，并保留处理记录。",
    },
    {
      topic: "交通与停车",
      level: "橙色",
      owner: "现场运营",
      words: [
        "没地方停车",
        "没有停车位",
        "不好打车",
        "路破破烂烂",
        "路真的破破烂烂",
        "接驳迟到",
        "接站迟到",
      ],
      advice: "核查停车与接驳情况，提供准确导航、班次和替代方案。",
    },
    {
      topic: "开园与演艺",
      level: "黄色",
      owner: "现场运营",
      kinds: ["attraction"],
      words: [
        "跑空",
        "演出取消",
        "临时停演",
        "排队太久",
        "等太久",
        "体验不符",
        "还没有营业",
      ],
      advice: "核对开放与演出安排、排队动线，及时同步变更及补救方案。",
    },
  ];
  const inquiryRules = [
    [
      "预订与退改",
      [
        "多少钱",
        "票价",
        "门票",
        "退票",
        "退款",
        "改期",
        "团购",
        "儿童票",
        "儿童免票",
        "收费",
        "免费吗",
        "怎么订",
        "有房吗",
      ],
    ],
    [
      "交通与停车",
      [
        "怎么去",
        "怎么走",
        "导航",
        "停车",
        "接驳",
        "接站",
        "公交",
        "给位置",
        "在哪里",
        "多长时间",
      ],
    ],
    [
      "营业与权益",
      [
        "营业时间",
        "几点",
        "什么时候",
        "演出时间",
        "演出时间表",
        "每天演出",
        "铁花",
        "早餐",
        "泳池",
        "宠物",
        "带娃",
        "好玩吗",
        "值得去吗",
        "值不值得",
        "贵不贵",
      ],
    ],
  ];
  const positiveWords = [
    "好玩",
    "推荐",
    "很满意",
    "很干净",
    "干净整洁",
    "服务很好",
    "服务非常好",
    "很棒",
    "漂亮",
    "震撼",
    "浪漫",
    "喜欢",
    "绝美",
    "出片",
    "快乐",
    "惊喜",
    "赞",
    "支持",
  ];
  function clean(value, max = 12000) {
    return String(value ?? "")
      .trim()
      .slice(0, max);
  }
  function count(value) {
    if (value === null || value === undefined || value === "") return null;
    const text = String(value).replace(/,/g, "").trim();
    const m = text.match(/^(\d+(?:\.\d+)?)\s*([万千kK])?$/);
    return m
      ? Math.max(
          0,
          Math.round(
            Number(m[1]) *
              ({ 万: 10000, 千: 1000, k: 1000, K: 1000 }[m[2]] || 1),
          ),
        )
      : null;
  }
  function timestamp(value) {
    if (value === null || value === undefined || value === "") return null;
    let n;
    if (typeof value === "number" || /^\d{10,13}$/.test(String(value))) {
      n = Number(value);
      if (n < 100000000000) n *= 1000;
    } else {
      const raw = String(value).trim().replace(/\//g, "-");
      const m = raw.match(
        /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/,
      );
      if (!m) return null;
      const y = Number(m[1]),
        month = Number(m[2]),
        day = Number(m[3]);
      const check = new Date(Date.UTC(y, month - 1, day));
      if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day ||
        Number(m[4] || 0) > 23 ||
        Number(m[5] || 0) > 59 ||
        Number(m[6] || 0) > 59
      )
        return null;
      const text = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${(m[4] || "00").padStart(2, "0")}:${m[5] || "00"}:${m[6] || "00"}${m[7] || ""}${m[8] || "+08:00"}`;
      n = Date.parse(text);
    }
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function iso(value) {
    const t = timestamp(value);
    return t ? new Date(t).toISOString() : null;
  }
  function safeUrl(value) {
    try {
      const u = new URL(clean(value, 2500));
      return ["https:", "http:"].includes(u.protocol) &&
        !u.username &&
        !u.password
        ? u.href
        : "";
    } catch {
      return "";
    }
  }
  function imageUrl(value) {
    const v = clean(value, 2500);
    if (safeUrl(v)) return safeUrl(v);
    return v &&
      !v.startsWith("/") &&
      !v.includes("..") &&
      !/[\x00-\x20<>]/.test(v) &&
      !/[:\\]/.test(v)
      ? v
      : "";
  }
  function maskAccount(value) {
    const v = clean(value, 80);
    if (!v) return "";
    if (v.includes("*")) return v;
    const chars = Array.from(v);
    return chars.length <= 2
      ? chars[0] + "*"
      : chars[0] + "***" + chars[chars.length - 1];
  }
  function hash(value) {
    let h = 2166136261;
    for (const c of String(value)) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }
  function normalizeProperty(p) {
    if (!p || !clean(p.id) || !clean(p.name))
      throw new Error("监测对象缺少 id 或名称");
    const kind = KINDS[p.kind] ? p.kind : "hotel";
    return {
      id: clean(p.id, 120),
      name: clean(p.name, 80),
      kind,
      city: clean(p.city, 40),
      aliases: (Array.isArray(p.aliases) ? p.aliases : [])
        .map((v) => clean(v, 80))
        .slice(0, 30),
      owners: (Array.isArray(p.owners) && p.owners.length
        ? p.owners
        : ["值班经理", "市场运营"]
      )
        .map((v) => clean(v, 40))
        .slice(0, 30),
      slaHours: Object.fromEntries(
        ["红色", "橙色", "黄色"].map((level, i) => [
          level,
          Math.max(
            0.5,
            Math.min(168, Number(p.slaHours?.[level]) || [1, 2, 24][i]),
          ),
        ]),
      ),
    };
  }
  function classify(text, p, rating = null) {
    const value = clean(text);
    const positiveContext = value.replace(
      /(?:不|别|避免)踩[雷坑]|避[雷坑](?:攻略|指南)|别错过|不要错过|不容错过|值不值得|(?:没有|未发现|未发生|不存在)(?:偷拍|火灾|受伤|触电|溺水|食物中毒)/g,
      "",
    );
    const rule = rules.find(
      (r) =>
        (!r.kinds || r.kinds.includes(p.kind)) &&
        r.words.some((w) => positiveContext.includes(w)),
    );
    const prospective =
      /(?:不然|否则|会不会|建议).*?(?:不好玩|排队|人挤人|拥挤|没房)/.test(
        value,
      ) && !/去了|去过|昨天|已经|亲历/.test(value);
    if (prospective && rule?.topic !== "安全与隐私")
      return {
        sentiment: "中性",
        feedbackType: "咨询",
        topic: "人流与体验",
        riskLevel: "普通",
        riskScore: 15,
        keywords: ["人流体验咨询"],
        owner: p.kind === "attraction" ? "客服" : "前厅部",
        suggestion: "回复适合到访的时段和预约建议，核对人流与接待安排。",
      };
    if (rule) {
      const words = rule.words.filter((w) => positiveContext.includes(w));
      const score =
        rule.level === "红色" ? 90 : rule.level === "橙色" ? 74 : 52;
      return {
        sentiment: "负面",
        feedbackType: "风险",
        topic: rule.topic,
        riskLevel: rule.level,
        riskScore: score,
        keywords: words,
        owner:
          p.kind === "attraction" &&
          ["客房部", "前厅部", "工程部"].includes(rule.owner)
            ? "现场运营"
            : rule.owner,
        suggestion: rule.advice,
      };
    }
    if (rating !== null && rating <= 2)
      return {
        sentiment: "负面",
        feedbackType: "风险",
        topic: "低分点评",
        riskLevel: "橙色",
        riskScore: 74,
        keywords: ["低分点评"],
        owner: "值班经理",
        suggestion: "打开原点评，核对具体问题后派发给责任团队。",
      };
    const inquiry = inquiryRules.find(([, words]) =>
      words.some((w) => value.includes(w)),
    );
    const positive = positiveWords.filter((w) => value.includes(w));
    const isQuestion =
      /[?？]|请问|吗|能不能|有没有|多少钱|怎么|几点|什么时候|哪里/.test(value);
    if (inquiry && (isQuestion || !positive.length))
      return {
        sentiment: "中性",
        feedbackType: "咨询",
        topic: inquiry[0],
        riskLevel: "普通",
        riskScore: 15,
        keywords: inquiry[1].filter((w) => value.includes(w)),
        owner: p.kind === "attraction" ? "客服" : "前厅部",
        suggestion:
          "核对当前价格、权益或营业安排后提供准确答复，记录需要补充的信息。",
      };
    if (positive.length || (rating !== null && rating >= 4))
      return {
        sentiment: "正面",
        feedbackType: "正面",
        topic: "正面口碑",
        riskLevel: "普通",
        riskScore: 0,
        keywords: positive,
        owner: "市场运营",
        suggestion: "记录受欢迎的体验，作为服务改进和内容选题参考。",
      };
    if (rating !== null && rating <= 3)
      return {
        sentiment: "中性",
        feedbackType: "风险",
        topic: "中低分点评",
        riskLevel: "黄色",
        riskScore: 45,
        keywords: ["中低分点评"],
        owner: "值班经理",
        suggestion: "核对原点评，判断是否需要整改和跟进。",
      };
    return {
      sentiment: "中性",
      feedbackType: "普通",
      topic: "常规讨论",
      riskLevel: "普通",
      riskScore: 0,
      keywords: [],
      owner: "市场运营",
      suggestion: "保留样本，观察后续相关反馈。",
    };
  }
  function inferOrigin(text, p) {
    const value = clean(text);
    const m = value.match(
      /(?:我|我们|本人)(?:是|来自|住在|从)([\u4e00-\u9fa5]{2,6}?)(?:人|出发|过来|来的|来玩|，|,|。|$)/,
    );
    if (!m) return { type: "未识别", city: "", evidence: "无明确来源自述" };
    const city = m[1];
    const known = [
      p.city,
      "平潭",
      "福州",
      "厦门",
      "泉州",
      "漳州",
      "莆田",
      "宁德",
      "南平",
      "三明",
      "龙岩",
      "北京",
      "上海",
      "广州",
      "深圳",
      "杭州",
      "南京",
      "苏州",
      "无锡",
      "温州",
      "宁波",
      "嘉兴",
      "湖州",
      "金华",
      "台州",
      "成都",
      "重庆",
      "武汉",
      "长沙",
      "南昌",
      "合肥",
      "郑州",
      "西安",
      "天津",
      "济南",
      "青岛",
      "沈阳",
      "大连",
      "长春",
      "哈尔滨",
      "昆明",
      "贵阳",
      "南宁",
      "海口",
      "三亚",
      "香港",
      "澳门",
      "台北",
    ];
    if (!known.includes(city.replace(/市$/, "")))
      return { type: "未识别", city: "", evidence: "自述未匹配可识别的城市" };
    const normalizedCity = city.replace(/市$/, "");
    return {
      type:
        normalizedCity === p.city.replace(/市$/, "") ? "疑似本地" : "疑似外地",
      city: normalizedCity,
      evidence: m[0],
    };
  }
  function normalizeRecord(raw, p, defaults = {}) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("反馈记录格式不正确");
    const content = clean(raw.content);
    const platform = clean(raw.platform, 40);
    if (!content || !PLATFORMS.includes(platform))
      throw new Error("反馈缺少内容或平台不在支持列表中");
    const publishedAt = timestamp(raw.publishedAt ?? raw.timestamp);
    const observedAt = timestamp(raw.observedAt ?? defaults.observedAt);
    const firstSeenAt = timestamp(raw.firstSeenAt ?? observedAt);
    const ratingNumber =
      raw.rating === "" || raw.rating == null ? null : Number(raw.rating);
    if (
      ratingNumber !== null &&
      (!Number.isFinite(ratingNumber) || ratingNumber < 0 || ratingNumber > 5)
    )
      throw new Error("点评评分应在 0-5 之间");
    const profile = classify(content, p, ratingNumber);
    const sourceId = clean(raw.sourceId ?? raw.id, 150);
    const recordKind =
      raw.recordKind === "comment" || String(raw.source || "").includes("评论")
        ? "comment"
        : "content";
    const key =
      sourceId || hash([content, publishedAt, raw.sourceUrl].join("|"));
    const supplied =
      raw.assessmentMode === "manual" &&
      ["正面", "中性", "负面"].includes(raw.sentiment) &&
      LEVELS.includes(raw.riskLevel);
    return {
      id: `${p.id}|${platform}|${recordKind}|${key}`,
      propertyId: p.id,
      platform,
      recordKind,
      sourceId,
      parentId: clean(raw.parentId, 150),
      source: clean(
        raw.source || (recordKind === "comment" ? "评论" : "内容"),
        80,
      ),
      title: clean(raw.title || content, 180),
      content,
      publishedAt,
      observedAt,
      firstSeenAt,
      ...profile,
      ...(supplied
        ? {
            sentiment: raw.sentiment,
            riskLevel: raw.riskLevel,
            feedbackType:
              raw.sentiment === "负面" || raw.riskLevel !== "普通"
                ? "风险"
                : profile.feedbackType,
            riskScore: Math.max(0, Math.min(100, Number(raw.riskScore) || 0)),
          }
        : {}),
      assessmentMode: supplied ? "manual" : "rules",
      publishedPrecision:
        raw.publishedPrecision ||
        (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(
          String(raw.publishedAt ?? raw.timestamp),
        )
          ? "day"
          : "minute"),
      rating: ratingNumber,
      metrics: {
        likes: count(raw.metrics?.likes ?? raw.likes),
        comments: count(raw.metrics?.comments ?? raw.comments),
        shares: count(raw.metrics?.shares ?? raw.shares),
      },
      sourceUrl: safeUrl(raw.sourceUrl || raw.url),
      sourceAccount: maskAccount(raw.sourceAccount),
      commentAccount: maskAccount(raw.commentAccount),
      parentTitle: clean(raw.parentTitle, 180),
      mediaPreview: imageUrl(raw.mediaPreview),
      mediaLabel: clean(raw.mediaLabel || "内容封面", 80),
      provenance: clean(
        raw.provenance || defaults.provenance || "人工导入",
        100,
      ),
      evidenceNote: clean(raw.evidenceNote, 600),
      verification: raw.verification === "verified" ? "verified" : "pending",
      origin: inferOrigin(content, p),
      status:
        STATUSES.includes(raw.status) && raw.workflowConfirmed === true
          ? raw.status
          : "待研判",
      batchId: clean(defaults.batchId || raw.batchId, 150),
    };
  }
  function dedupe(records) {
    const map = new Map();
    for (const r of records) {
      const old = map.get(r.id);
      if (!old) {
        map.set(r.id, r);
        continue;
      }
      const newer = (r.observedAt || 0) >= (old.observedAt || 0) ? r : old;
      const older = newer === r ? old : r;
      map.set(r.id, {
        ...newer,
        firstSeenAt: [old.firstSeenAt, r.firstSeenAt]
          .filter(Number.isFinite)
          .filter((v) => v > 0).length
          ? Math.min(
              ...[old.firstSeenAt, r.firstSeenAt]
                .filter(Number.isFinite)
                .filter((v) => v > 0),
            )
          : null,
        mediaPreview: newer.mediaPreview || older.mediaPreview,
        sourceUrl: newer.sourceUrl || older.sourceUrl,
        verification:
          newer.verification === "verified" ||
          (older.verification === "verified" &&
            newer.content === older.content &&
            newer.sourceUrl === older.sourceUrl)
            ? "verified"
            : "pending",
      });
    }
    return [...map.values()].sort(
      (a, b) => (b.publishedAt || 0) - (a.publishedAt || 0),
    );
  }
  function normalizeBundle(input, fallbackProperty) {
    const properties = (
      input.properties || (fallbackProperty ? [fallbackProperty] : [])
    ).map(normalizeProperty);
    if (!properties.length) throw new Error("导入文件缺少监测对象");
    if (new Set(properties.map((p) => p.id)).size !== properties.length)
      throw new Error("监测对象 id 重复");
    const props = new Map(properties.map((p) => [p.id, p]));
    if (!Array.isArray(input.records) || input.records.length > 100000)
      throw new Error("records 应为数组，单次最多10万条");
    const records = input.records.map((r, i) => {
      const p = props.get(
        r.propertyId || fallbackProperty?.id || properties[0].id,
      );
      if (!p) throw new Error(`第${i + 1}条反馈的监测对象不存在`);
      try {
        return normalizeRecord(r, p);
      } catch (e) {
        throw new Error(`第${i + 1}条反馈：${e.message}`);
      }
    });
    return {
      schemaVersion: 2,
      properties,
      records: dedupe(records),
      batches: (input.batches || [])
        .map((b) => ({
          id: clean(b.id, 150),
          label: clean(b.label, 160),
          importedAt: timestamp(b.importedAt),
          observedAt: timestamp(b.observedAt),
          count: Math.max(0, Number(b.count) || 0),
          propertyId: clean(b.propertyId, 120),
        }))
        .slice(-100),
      channels: (input.channels || [])
        .filter(
          (c) => PLATFORMS.includes(c.platform) && props.has(c.propertyId),
        )
        .map((c) => ({
          propertyId: c.propertyId,
          platform: c.platform,
          state: [
            "sample",
            "partial",
            "connected",
            "failed",
            "not-connected",
          ].includes(c.state)
            ? c.state
            : "sample",
          lastSuccessAt: timestamp(c.lastSuccessAt),
          lastAttemptAt: timestamp(c.lastAttemptAt),
          note: clean(c.note, 600),
        })),
    };
  }
  function inRange(r, range, now) {
    if (range === "all") return true;
    if (!r.publishedAt || r.publishedAt > now) return false;
    if (range === "24h" && r.publishedPrecision === "day") return false;
    const ms = { "24h": 86400000, "7d": 7 * 86400000, "30d": 30 * 86400000 }[
      range
    ];
    if (ms) return r.publishedAt >= now - ms;
    const day = (t) => new Date(t + 8 * 3600000).toISOString().slice(0, 10);
    return day(r.publishedAt) === day(now);
  }
  function needsAction(r) {
    return (
      r.feedbackType === "风险" ||
      r.feedbackType === "咨询" ||
      r.sentiment === "负面"
    );
  }
  function isPending(r) {
    return needsAction(r) && !["已回复", "已复盘"].includes(r.status);
  }
  function sla(r, p, now) {
    if (!needsAction(r))
      return { text: "无需跟进", dueAt: null, overdue: false };
    if (r.status === "已复盘")
      return { text: "已完成", dueAt: null, overdue: false };
    if (r.status === "已回复")
      return { text: "待复盘", dueAt: null, overdue: false };
    const start = r.firstSeenAt;
    if (!start) return { text: "发现时间待补", dueAt: null, overdue: false };
    const hours = p.slaHours[r.riskLevel] || 24;
    const dueAt = start + hours * 3600000;
    const overdue = now > dueAt;
    return {
      dueAt,
      overdue,
      text: overdue
        ? `超时${Math.ceil((now - dueAt) / 3600000)}小时`
        : `剩余${Math.max(1, Math.ceil((dueAt - now) / 60000))}分钟`,
    };
  }
  function summary(records) {
    const negative = records.filter((r) => r.sentiment === "负面").length;
    return {
      total: records.length,
      contents: records.filter((r) => r.recordKind === "content").length,
      comments: records.filter((r) => r.recordKind === "comment").length,
      negative,
      negativeRate: records.length ? (negative / records.length) * 100 : null,
      highRisk: records.filter((r) => ["红色", "橙色"].includes(r.riskLevel))
        .length,
      pending: records.filter(isPending).length,
      inquiries: records.filter((r) => r.feedbackType === "咨询").length,
    };
  }
  function hourly(records, now) {
    const start = now - 86400000;
    const buckets = Array.from({ length: 24 }, (_, i) => ({
      start: start + i * 3600000,
      count: 0,
      negative: 0,
    }));
    for (const r of records) {
      if (
        !r.publishedAt ||
        r.publishedPrecision === "day" ||
        r.publishedAt < now - 86400000 ||
        r.publishedAt > now
      )
        continue;
      const bucket =
        buckets[Math.min(23, Math.floor((r.publishedAt - start) / 3600000))];
      if (bucket) {
        bucket.count++;
        if (r.sentiment === "负面") bucket.negative++;
      }
    }
    return buckets;
  }
  function validateWorkflow(r, patch) {
    if (!STATUSES.includes(patch.status)) throw new Error("请选择有效状态");
    if (STATUSES.indexOf(patch.status) > STATUSES.indexOf(r.status) + 1)
      throw new Error("请依次完成研判、派单和处置");
    if (patch.status === "已派单" && !clean(patch.owner))
      throw new Error("派单前请填写负责人");
    if (["已回复", "已复盘"].includes(patch.status) && !clean(patch.reply))
      throw new Error("请先记录实际回复或处置结果");
    if (
      ["已回复", "已复盘"].includes(patch.status) &&
      /【(?:填写|核实|待)/.test(patch.reply)
    )
      throw new Error("请先用真实处理结果替换回复草稿中的待核实项");
    if (patch.status === "已复盘" && !clean(patch.review))
      throw new Error("请填写复盘结果");
    return {
      status: patch.status,
      owner: clean(patch.owner, 80),
      reply: clean(patch.reply, 4000),
      review: clean(patch.review, 4000),
      verification: patch.verification === "verified" ? "verified" : "pending",
      note: clean(patch.note, 4000),
      sentiment: ["正面", "中性", "负面"].includes(patch.sentiment)
        ? patch.sentiment
        : r.sentiment,
      riskLevel: LEVELS.includes(patch.riskLevel)
        ? patch.riskLevel
        : r.riskLevel,
      riskScore: { 红色: 90, 橙色: 74, 黄色: 45, 普通: 0 }[
        LEVELS.includes(patch.riskLevel) ? patch.riskLevel : r.riskLevel
      ],
      assessmentMode: "manual",
    };
  }
  return {
    PLATFORMS,
    STATUSES,
    LEVELS,
    KINDS,
    clean,
    count,
    timestamp,
    iso,
    safeUrl,
    imageUrl,
    hash,
    normalizeProperty,
    normalizeRecord,
    normalizeBundle,
    classify,
    dedupe,
    inRange,
    needsAction,
    isPending,
    sla,
    summary,
    hourly,
    validateWorkflow,
  };
});
