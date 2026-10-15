(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(
      require("./core.js"),
      require("./assets/papaparse.min.js"),
    );
  else root.TravelImporter = factory(root.TravelPulse, root.Papa);
})(typeof globalThis !== "undefined" ? globalThis : this, function (C, Papa) {
  "use strict";
  const columns = {
    platform: ["platform", "平台", "渠道"],
    content: ["content", "内容", "点评内容", "评价内容", "评论内容", "评语"],
    sourceId: ["sourceId", "源标识", "点评ID", "评价ID", "评论ID", "内容ID"],
    sourceAccount: ["sourceAccount", "来源账号", "用户昵称", "昵称"],
    sourceUrl: ["sourceUrl", "源链接", "原链接", "链接"],
    publishedAt: [
      "publishedAt",
      "发布时间",
      "点评时间",
      "评价时间",
      "评论时间",
    ],
    observedAt: ["observedAt", "采集时间", "收录时间"],
    rating: ["rating", "评分", "点评分数"],
    likes: ["likes", "赞", "点赞", "点赞数"],
    comments: ["comments", "评论数"],
    shares: ["shares", "分享数"],
    mediaPreview: ["mediaPreview", "图片", "截图"],
    provenance: ["provenance", "来源说明"],
    recordKind: ["recordKind", "记录类型"],
    propertyName: ["propertyName", "门店名称", "酒店名称", "民宿名称"],
  };
  function mapRow(row) {
    const out = {};
    for (const [field, aliases] of Object.entries(columns)) {
      const key = Object.keys(row).find((key) => aliases.includes(key.trim()));
      if (key) out[field] = row[key];
    }
    if (out.recordKind === "评论") out.recordKind = "comment";
    return out;
  }
  function prepare(text, name, property, defaultPlatform = "") {
    let input,
      missingPlatform = false;
    if (/\.csv$/i.test(name)) {
      const parsed = Papa.parse(text.replace(/^\ufeff/, ""), {
        header: true,
        skipEmptyLines: "greedy",
      });
      if (parsed.errors.length)
        throw new Error("CSV格式错误：" + parsed.errors[0].message);
      const rows = parsed.data.map(mapRow);
      missingPlatform = rows.some((r) => !r.platform);
      const errors = [];
      const records = rows.flatMap((row, i) => {
        try {
          if (!row.platform) row.platform = defaultPlatform;
          if (!row.platform) return [];
          if (
            row.propertyName &&
            ![property.name, ...property.aliases].includes(
              row.propertyName.trim(),
            )
          )
            throw new Error("门店名称与当前对象不符");
          for (const key of ["publishedAt", "observedAt"])
            if (row[key] && !C.timestamp(row[key]))
              throw new Error(
                (key === "publishedAt" ? "发布时间" : "采集时间") + "无法识别",
              );
          return [
            C.normalizeRecord({ ...row, propertyId: property.id }, property),
          ];
        } catch (e) {
          errors.push({ row: i + 2, message: e.message });
          return [];
        }
      });
      input = { properties: [property], records };
      return {
        input,
        incoming: C.normalizeBundle(input, property),
        errors,
        missingPlatform: missingPlatform && !defaultPlatform,
        rawCount: rows.length,
      };
    }
    input = JSON.parse(text);
    if (Array.isArray(input))
      input = { records: input, properties: [property] };
    if (!input.properties) input.properties = [property];
    return {
      input,
      incoming: C.normalizeBundle(input, property),
      errors: [],
      missingPlatform: false,
      rawCount: input.records.length,
    };
  }
  return { columns, mapRow, prepare };
});
