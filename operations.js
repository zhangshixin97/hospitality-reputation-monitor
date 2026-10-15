(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./core.js"));
  else root.TravelOperations = factory(root.TravelPulse);
})(typeof globalThis !== "undefined" ? globalThis : this, function (C) {
  "use strict";
  function quality(records) {
    return {
      links: records.filter((r) => r.sourceUrl).length,
      verified: records.filter((r) => r.verification === "verified").length,
      unknownTime: records.filter((r) => !r.publishedAt).length,
      dayOnly: records.filter((r) => r.publishedPrecision === "day").length,
    };
  }
  function groups(records, property, now) {
    const map = new Map();
    for (const r of records.filter(
      (r) => r.feedbackType === "风险" || r.sentiment === "负面",
    )) {
      const row = map.get(r.topic) || {
        topic: r.topic,
        count: 0,
        pending: 0,
        replied: 0,
        reviewed: 0,
        overdue: 0,
        platforms: new Set(),
        suggestions: r.suggestion,
        owner: r.owner,
      };
      row.count++;
      if (C.isPending(r)) row.pending++;
      if (r.status === "已回复") row.replied++;
      if (r.status === "已复盘") row.reviewed++;
      if (C.sla(r, property, now).overdue) row.overdue++;
      row.platforms.add(r.platform);
      map.set(r.topic, row);
    }
    return [...map.values()]
      .map((row) => ({ ...row, platforms: [...row.platforms] }))
      .sort((a, b) => b.pending - a.pending || b.count - a.count);
  }
  function responseDraft(r, property) {
    if (r.feedbackType === "咨询")
      return `您好，感谢关注${property.name}。关于您咨询的问题，我们已收到。当前准确安排为【填写核实后的价格、权益或时间】；如需进一步确认，可通过平台私信联系门店。`;
    if (r.sentiment === "正面")
      return `您好，感谢您对${property.name}的认可。我们已把您的反馈分享给团队，期待下次为您带来同样舒适的体验。`;
    return `您好，感谢您反馈${r.topic}的问题。我们重视这次体验，正在核实具体情况。请通过平台私信提供便于核对的信息，我们会由【填写责任团队】在【填写已确认的时间】跟进。核实后的处理结果为【填写真实措施】。`;
  }
  function priorities(records, property, now) {
    return records
      .filter(C.isPending)
      .sort(
        (a, b) =>
          b.riskScore - a.riskScore ||
          Number(C.sla(b, property, now).overdue) -
            Number(C.sla(a, property, now).overdue) ||
          (a.firstSeenAt || Infinity) - (b.firstSeenAt || Infinity),
      );
  }
  function monitorFlow(records) {
    const nodes = new Map(),
      links = new Map();
    const node = (name, color, depth) => {
      if (!nodes.has(name))
        nodes.set(name, { name, depth, itemStyle: { color } });
    };
    const link = (source, target) => {
      const id = source + "|" + target;
      const old = links.get(id);
      links.set(id, { source, target, value: (old?.value || 0) + 1 });
    };
    for (const r of records) {
      const source = "平台:" + r.platform,
        sentiment = "情感:" + r.sentiment;
      const status = "处置:" + (C.needsAction(r) ? r.status : "无需跟进");
      node(source, "#3b5bfd", 0);
      node(
        sentiment,
        { 正面: "#218c60", 中性: "#9aa4b5", 负面: "#bd393e" }[r.sentiment],
        1,
      );
      node(
        status,
        {
          待研判: "#b86c21",
          已派单: "#c49744",
          处理中: "#3b5bfd",
          已回复: "#308d8a",
          已复盘: "#218c60",
          无需跟进: "#aeb8c8",
        }[status.slice(3)],
        2,
      );
      link(source, sentiment);
      link(sentiment, status);
    }
    return { nodes: [...nodes.values()], links: [...links.values()] };
  }
  function selectFeedback(records, filters) {
    const active = (field, value) =>
      !filters[field] || filters[field] === "all" || filters[field] === value;
    return records
      .filter((r) => {
        const statusMatches =
          !filters.status ||
          filters.status === "all" ||
          (filters.status === "none"
            ? !C.needsAction(r)
            : C.needsAction(r) && r.status === filters.status);
        const levelMatches =
          filters.level === "high"
            ? ["红色", "橙色"].includes(r.riskLevel)
            : active("level", r.riskLevel);
        const text = [
          r.content,
          r.title,
          r.sourceAccount,
          r.commentAccount,
          r.topic,
          r.owner,
          ...r.keywords,
        ]
          .join(" ")
          .toLowerCase();
        return (
          active("platform", r.platform) &&
          levelMatches &&
          statusMatches &&
          active("sentiment", r.sentiment) &&
          active("verification", r.verification) &&
          (!filters.pending || C.isPending(r)) &&
          (!filters.query || text.includes(filters.query.toLowerCase())) &&
          (!filters.scope ||
            filters.scope === "all" ||
            (filters.scope === "risk" &&
              (r.feedbackType === "风险" || r.sentiment === "负面")) ||
            (filters.scope === "inquiry" && r.feedbackType === "咨询") ||
            (filters.scope === "positive" && r.sentiment === "正面"))
        );
      })
      .sort((a, b) =>
        filters.scope === "risk"
          ? b.riskScore - a.riskScore ||
            (b.publishedAt || 0) - (a.publishedAt || 0)
          : (b.publishedAt || 0) - (a.publishedAt || 0),
      );
  }
  return {
    quality,
    groups,
    responseDraft,
    priorities,
    monitorFlow,
    selectFeedback,
  };
});
