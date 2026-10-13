(function () {
  "use strict";
  const C = window.TravelPulse;
  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const fmt = (n) => (n == null ? "--" : Number(n).toLocaleString("zh-CN"));
  const time = (n, short = false) =>
    n
      ? new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai",
          year: short ? undefined : "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(n)
      : "时间未知";
  const tones = {
    红色: "red",
    橙色: "orange",
    黄色: "yellow",
    普通: "",
    负面: "red",
    正面: "green",
    中性: "",
    已回复: "blue",
    已复盘: "green",
  };
  const pill = (text, tone) =>
    `<span class="pill ${tone || tones[text] || ""}">${esc(text)}</span>`;
  let base;
  try {
    base = C.normalizeBundle(
      window.TRAVEL_PULSE_LOCAL || window.TRAVEL_PULSE_SEED,
    );
  } catch (e) {
    base = C.normalizeBundle(window.TRAVEL_PULSE_SEED);
    setTimeout(() => toast("本地数据未载入：" + e.message, true), 50);
  }
  const storageKey =
    "travel-pulse:v2:" + C.hash(base.properties.map((p) => p.id).join("|"));
  let saved = {
    properties: [],
    records: [],
    batches: [],
    channels: [],
    workflow: {},
  };
  let storageOK = true;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      const properties = (parsed.properties || []).map(C.normalizeProperty);
      const normalized = C.normalizeBundle({
        ...parsed,
        properties: [
          ...new Map(
            [...base.properties, ...properties].map((p) => [p.id, p]),
          ).values(),
        ],
      });
      saved = { ...normalized, properties, workflow: parsed.workflow || {} };
    }
  } catch {
    storageOK = false;
    $("saveStatus").textContent = "存储不可用，请导出备份";
  }
  let bundle;
  let editingPropertyId = null;
  const state = {
    view: "overview",
    propertyId: base.properties[0].id,
    range: "all",
    platform: "all",
    level: "all",
    status: "all",
    verification: "all",
    query: "",
    pending: false,
    scope: "all",
    page: 1,
    detailId: null,
  };
  const pageSize = 25;
  let toastTimer;
  function toast(message, error = false) {
    $("toast").textContent = message;
    $("toast").className = "toast" + (error ? " error" : "");
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
  }
  function icons() {
    window.lucide?.createIcons();
  }
  function persist(next) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      saved = next;
      storageOK = true;
      $("saveStatus").textContent = "已保存 · " + time(Date.now(), true);
    } catch {
      storageOK = false;
      $("saveStatus").textContent = "保存失败，请导出备份";
      throw new Error("浏览器存储不可用或已满，请先备份工作空间");
    }
  }
  function rebuild() {
    const properties = [
      ...new Map(
        [...base.properties, ...saved.properties].map((p) => [p.id, p]),
      ).values(),
    ];
    const channelMap = new Map(
      [...base.channels, ...saved.channels].map((c) => [
        c.propertyId + "|" + c.platform,
        c,
      ]),
    );
    const records = C.dedupe([...base.records, ...saved.records]).map((r) => {
      const edit = saved.workflow[r.id];
      if (!edit) return r;
      const merged = { ...r, ...edit };
      merged.feedbackType =
        merged.sentiment === "负面" || merged.riskLevel !== "普通"
          ? "风险"
          : r.feedbackType === "风险"
            ? "普通"
            : r.feedbackType;
      return merged;
    });
    bundle = {
      schemaVersion: 2,
      properties,
      records,
      channels: [...channelMap.values()],
      batches: [
        ...new Map(
          [...base.batches, ...saved.batches].map((b) => [b.id, b]),
        ).values(),
      ],
    };
  }
  const property = () =>
    bundle.properties.find((p) => p.id === state.propertyId) ||
    bundle.properties[0];
  const objectRecords = () =>
    bundle.records.filter((r) => r.propertyId === state.propertyId);
  const rangeRecords = () =>
    objectRecords().filter((r) => C.inRange(r, state.range, Date.now()));
  function filteredRecords() {
    return rangeRecords()
      .filter((r) => {
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
          (state.platform === "all" || r.platform === state.platform) &&
          (state.level === "all" || r.riskLevel === state.level) &&
          (state.status === "all" || r.status === state.status) &&
          (state.verification === "all" ||
            r.verification === state.verification) &&
          (!state.pending || C.isPending(r)) &&
          (!state.query || text.includes(state.query.toLowerCase())) &&
          (state.scope === "all" ||
            (state.scope === "risk" &&
              (r.feedbackType === "风险" || r.sentiment === "负面")) ||
            (state.scope === "inquiry" && r.feedbackType === "咨询") ||
            (state.scope === "positive" && r.sentiment === "正面"))
        );
      })
      .sort((a, b) => {
        if (state.scope === "risk")
          return (
            b.riskScore - a.riskScore ||
            (b.publishedAt || 0) - (a.publishedAt || 0)
          );
        return (b.publishedAt || 0) - (a.publishedAt || 0);
      });
  }
  function setView(view) {
    state.view = view;
    document
      .querySelectorAll("[data-section]")
      .forEach((s) => (s.hidden = s.dataset.section !== view));
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
      b.setAttribute(
        "aria-current",
        b.dataset.view === view ? "page" : "false",
      );
    });
    $("pageTitle").textContent = {
      overview: "整体概览",
      feedback: "反馈与预警",
      coverage: "数据来源",
      settings: "监测对象",
    }[view];
    render();
  }
  function platformState(name) {
    const channel = bundle.channels.find(
      (c) => c.propertyId === state.propertyId && c.platform === name,
    );
    const items = objectRecords().filter((r) => r.platform === name);
    return (
      channel || {
        state: items.length ? "sample" : "not-connected",
        note: "",
        lastSuccessAt: items.length
          ? Math.max(...items.map((r) => r.observedAt || 0))
          : null,
      }
    );
  }
  const sourceLabel = (c) =>
    ({
      connected: "已接入",
      sample: "历史样本",
      partial: "部分收录",
      failed: "更新失败",
      "not-connected": "未接入",
    })[c.state] || "未接入";
  function renderFreshness() {
    const channels = C.PLATFORMS.map(platformState).filter(
      (c) => c.state !== "not-connected",
    );
    const t = Math.max(0, ...channels.map((c) => c.lastSuccessAt || 0));
    const stale = !t || Date.now() - t > 86400000;
    const connected = channels.filter((c) => c.state === "connected").length;
    const fullFresh =
      !stale &&
      connected > 0 &&
      channels.every(
        (c) =>
          c.state === "connected" &&
          Date.now() - (c.lastSuccessAt || 0) <= 86400000,
      );
    $("freshness").classList.toggle("fresh", fullFresh);
    const message = !channels.length
      ? "尚未导入反馈数据。各平台当前为未接入，暂不能判断整体舆情。"
      : `${stale ? "采集数据已过期" : fullFresh ? "数据已更新" : "当前为部分收录"} · 最近收录 ${time(t)} · ${connected} 个平台持续接入。${fullFresh ? "" : "未覆盖平台的0条仅表示未收录；负面率仅适用于当前样本。"}`;
    $("freshness").innerHTML =
      icon(fullFresh ? "circle-check" : "info") +
      `<span>${esc(message)}</span>`;
  }
  function renderStats(list) {
    const s = C.summary(list);
    $("stats").innerHTML = [
      [
        "已收录反馈",
        fmt(s.total),
        `内容 ${fmt(s.contents)} · 评论 ${fmt(s.comments)}`,
        "messages-square",
        "",
      ],
      [
        "样本负面率",
        s.negativeRate == null ? "--" : s.negativeRate.toFixed(1) + "%",
        `负面 ${s.negative} · 咨询 ${s.inquiries}`,
        "chart-pie",
        "negative",
      ],
      [
        "红橙预警",
        fmt(s.highRisk),
        "按当前研判等级统计",
        "shield-alert",
        "alert",
      ],
      ["待处理事项", fmt(s.pending), "已回复事项进入待复盘", "list-todo", ""],
    ]
      .map(
        ([label, value, note, glyph, cls]) =>
          `<div class="stat ${cls}"><div class="stat-label"><span>${label}</span>${icon(glyph)}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`,
      )
      .join("");
    $("navCount").textContent = C.summary(objectRecords()).pending;
  }
  function renderPlatforms(list) {
    $("platforms").innerHTML = C.PLATFORMS.filter((p) => p !== "视频号")
      .map((p) => {
        const items = list.filter((r) => r.platform === p),
          c = platformState(p);
        const counts = ["正面", "中性", "负面"].map(
          (sentiment) => items.filter((r) => r.sentiment === sentiment).length,
        );
        return `<button class="platform" data-platform="${p}"><div class="platform-head"><span class="platform-name">${p}</span>${pill(sourceLabel(c), c.state === "connected" ? "green" : c.state === "partial" ? "blue" : "")}</div><div class="platform-total">${fmt(items.length)}<small>条反馈</small></div><div class="sentiment-bar">${counts.map((n, i) => `<span style="width:${items.length ? (n / items.length) * 100 : 0}%;background:${["var(--green)", "#aebdc2", "var(--red)"][i]}"></span>`).join("")}</div><div class="sentiment-counts"><span class="positive-text">正面 ${counts[0]}</span><span>中性 ${counts[1]}</span><span class="negative-text">负面 ${counts[2]}</span></div></button>`;
      })
      .join("");
  }
  function renderAnalysis(list) {
    const topics = new Map();
    list
      .filter((r) => r.feedbackType === "风险")
      .forEach((r) => topics.set(r.topic, (topics.get(r.topic) || 0) + 1));
    const top = [...topics].sort((a, b) => b[1] - a[1]).slice(0, 6),
      max = Math.max(1, ...top.map((t) => t[1]));
    $("topics").innerHTML = top.length
      ? top
          .map(
            ([topic, n]) =>
              `<div class="topic-row"><span>${esc(topic)}</span><div class="topic-track"><div class="topic-fill" style="width:${(n / max) * 100}%"></div></div><span>${n}</span></div>`,
          )
          .join("")
      : '<div class="empty">当前样本暂无风险主题</div>';
    const now = Date.now();
    const buckets = C.hourly(objectRecords(), now),
      peak = Math.max(1, ...buckets.map((b) => b.count));
    $("hourChart").innerHTML =
      buckets
        .map(
          (b) =>
            `<div class="hour-column ${b.negative ? "negative" : ""}" title="${esc(time(b.start))}：${b.count}条，负面${b.negative}条"><span style="height:${Math.max(2, (b.count / peak) * 100)}%"></span></div>`,
        )
        .join("") +
      (buckets.every((b) => !b.count)
        ? '<div class="zero-chart">最近24小时未收录已知发布时间的反馈</div>'
        : "");
    $("hourChart").setAttribute(
      "aria-label",
      `最近24小时已知发布时间反馈${buckets.reduce((n, b) => n + b.count, 0)}条，红色柱表示该时段存在负面反馈`,
    );
    $("hourLabels").innerHTML = [0, 6, 12, 18, 23]
      .map(
        (i) =>
          `<span>${esc(time(buckets[i].start, true).split(" ").pop())}</span>`,
      )
      .join("");
    const priorities = list
      .filter(C.isPending)
      .sort(
        (a, b) =>
          b.riskScore - a.riskScore ||
          (a.firstSeenAt || Infinity) - (b.firstSeenAt || Infinity),
      )
      .slice(0, 4);
    const overdue = list.filter(
      (r) => C.sla(r, property(), now).overdue,
    ).length;
    $("slaCount").textContent = `超时 ${overdue}`;
    $("slaCount").className = "pill " + (overdue ? "red" : "green");
    $("priorities").innerHTML = priorities.length
      ? priorities
          .map(
            (r) =>
              `<div class="priority">${pill(r.riskLevel === "普通" ? "咨询" : r.riskLevel)}<div class="priority-main"><p>${esc(r.content)}</p><span class="muted">${esc(r.platform)} · ${esc(r.owner)} · ${esc(C.sla(r, property(), now).text)}</span></div><button class="icon-button" data-detail="${esc(r.id)}" title="查看反馈" aria-label="查看反馈">${icon("arrow-up-right")}</button></div>`,
          )
          .join("")
      : '<div class="empty">当前范围暂无待处理事项</div>';
    const origin = new Map();
    list.forEach((r) => {
      const key =
        r.origin.type === "未识别"
          ? "未识别"
          : r.origin.type + " · " + r.origin.city;
      origin.set(key, (origin.get(key) || 0) + 1);
    });
    $("origins").innerHTML =
      [...origin]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(
          ([name, n]) =>
            `<div class="origin-row"><span>${esc(name)}</span><span>${n} 条</span></div>`,
        )
        .join("") || '<div class="empty">暂无客源线索</div>';
    $("workflow").innerHTML = C.STATUSES.map(
      (status) =>
        `<button data-workflow="${status}"><span>${status}</span><strong>${list.filter((r) => C.needsAction(r) && r.status === status).length}</strong></button>`,
    ).join("");
  }
  function thumbnail(r) {
    return `<div class="thumbnail">${r.mediaPreview ? `<img src="${esc(r.mediaPreview)}" alt="${esc(r.mediaLabel)}" loading="lazy" referrerpolicy="no-referrer">` : icon("image-off")}</div>`;
  }
  function sourceLink(r) {
    return r.sourceUrl
      ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">原内容${icon("external-link")}</a>`
      : "<span>原链接缺失</span>";
  }
  function contentCell(r) {
    return `<div class="content-cell">${thumbnail(r)}<div class="content-main"><p>${esc(r.content)}</p><div class="source-line"><span>${esc(r.sourceAccount || "源账号未收录")}</span>${sourceLink(r)}<span>${r.verification === "verified" ? "已核验" : "待核验"}</span></div></div></div>`;
  }
  function renderFeedback() {
    const list = filteredRecords(),
      s = C.summary(list),
      pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.page = Math.min(state.page, pages);
    const rows = list.slice((state.page - 1) * pageSize, state.page * pageSize);
    $("listMeta").textContent =
      `共 ${fmt(s.total)} 条 · 负面 ${s.negative} · 红橙 ${s.highRisk} · 待处理 ${s.pending}`;
    $("feedbackRows").innerHTML = rows
      .map((r) => {
        const sla = C.sla(r, property(), Date.now());
        return `<tr><td>${contentCell(r)}</td><td>${esc(r.platform)}<span class="cell-sub">${esc(time(r.publishedAt, true))}</span><span class="cell-sub">${esc(r.recordKind === "comment" ? "评论" : "内容")}</span></td><td><div class="judgments">${pill(r.riskLevel)}${pill(r.sentiment)}</div><span class="cell-sub">${esc(r.topic)} · ${r.assessmentMode === "manual" ? "人工研判" : "规则初判"}</span></td><td>赞 ${fmt(r.metrics.likes)}<span class="cell-sub">评论 ${fmt(r.metrics.comments)}</span><span class="cell-sub">分享 ${fmt(r.metrics.shares)}</span></td><td>${C.needsAction(r) ? pill(r.status) : pill("无需跟进")}<span class="cell-sub">${esc(r.owner)}</span><span class="cell-sub ${sla.overdue ? "negative-text" : ""}">${esc(sla.text)}</span></td><td><button class="icon-button" data-detail="${esc(r.id)}" title="详情与处置" aria-label="详情与处置">${icon("arrow-up-right")}</button></td></tr>`;
      })
      .join("");
    $("feedbackMobile").innerHTML = rows
      .map(
        (r) =>
          `<article class="mobile-feedback"><div class="mobile-feedback-head"><span>${esc(r.platform)} · ${esc(time(r.publishedAt, true))}</span><div class="judgments">${pill(r.riskLevel)}${pill(r.sentiment)}</div></div>${contentCell(r)}<div class="mobile-feedback-footer"><span class="small muted">${C.needsAction(r) ? esc(r.status) : "无需跟进"} · ${esc(r.owner)}</span><button class="icon-button" data-detail="${esc(r.id)}" title="详情与处置" aria-label="详情与处置">${icon("arrow-up-right")}</button></div></article>`,
      )
      .join("");
    $("listEmpty").hidden = !!rows.length;
    $("listEmpty").textContent = objectRecords().length
      ? "当前筛选条件下暂无反馈"
      : "暂无反馈数据，可从右上角导入或在数据来源下载模板";
    $("pageMeta").textContent =
      `${state.page} / ${pages} 页 · 每页 ${pageSize} 条`;
    $("prevPage").disabled = state.page <= 1;
    $("nextPage").disabled = state.page >= pages;
    document
      .querySelectorAll("[data-scope]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.scope === state.scope),
      );
  }
  function renderSources() {
    $("sources").innerHTML = C.PLATFORMS.map((platform) => {
      const c = platformState(platform),
        records = objectRecords().filter((r) => r.platform === platform);
      const explanation =
        c.note ||
        (platform === "视频号"
          ? "保留人工导入入口"
          : ["携程", "美团", "大众点评"].includes(platform)
            ? "可导入商家后台授权导出或逐条核验数据"
            : ["百度地图", "高德地图"].includes(platform)
              ? "可导入公开页面核验或授权数据"
              : "等待授权数据导入");
      return `<div class="source-row"><strong>${platform}</strong><div>${pill(sourceLabel(c), c.state === "connected" ? "green" : "")}<p>${esc(explanation)}</p></div><div><b>${fmt(records.length)}</b><p>已收录样本</p></div><div><span class="small">${esc(time(c.lastSuccessAt))}</span><p>最近收录</p></div></div>`;
    }).join("");
    const batches = bundle.batches
      .filter((b) => b.propertyId === state.propertyId)
      .slice()
      .reverse()
      .slice(0, 20);
    $("batches").innerHTML = batches.length
      ? batches
          .map(
            (b) =>
              `<div class="batch"><span>${esc(b.label)} · ${b.count}条</span><span class="muted">数据时间 ${esc(time(b.observedAt))} · 导入 ${esc(time(b.importedAt))}</span></div>`,
          )
          .join("")
      : '<div class="empty">暂无导入批次</div>';
  }
  function renderProperties() {
    $("propertyList").innerHTML = bundle.properties
      .map(
        (p) =>
          `<div class="property-row"><div><h3>${esc(p.name)} ${pill(C.KINDS[p.kind])}</h3><p>${esc(p.city || "城市待填写")} · ${bundle.records.filter((r) => r.propertyId === p.id).length} 条样本 · 红/橙/黄 ${p.slaHours["红色"]}/${p.slaHours["橙色"]}/${p.slaHours["黄色"]} 小时</p><div class="property-tags">${p.aliases.map((a) => pill(a)).join("")}</div><p>责任团队：${esc(p.owners.join("、"))}</p></div><div class="button-group"><button class="icon-button" data-edit-property="${esc(p.id)}" title="编辑监测对象" aria-label="编辑监测对象">${icon("pencil")}</button><button class="button" data-select-property="${esc(p.id)}">${icon("arrow-up-right")}查看</button></div></div>`,
      )
      .join("");
  }
  function render() {
    const p = property();
    $("propertyKind").textContent = C.KINDS[p.kind] + "运营";
    const ranges = {
      all: "全部历史",
      today: "今天",
      "24h": "最近24小时",
      "7d": "最近7天",
      "30d": "最近30天",
    };
    $("pageSubtitle").textContent =
      `${p.name} · ${ranges[state.range]} · 按反馈发布时间统计`;
    $("clockLabel").textContent = time(Date.now());
    $("propertyFilter").innerHTML = bundle.properties
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join("");
    $("propertyFilter").value = state.propertyId;
    renderFreshness();
    const list = rangeRecords();
    if (state.view === "overview") {
      renderStats(list);
      renderPlatforms(list);
      renderAnalysis(list);
    }
    if (state.view === "feedback") renderFeedback();
    if (state.view === "coverage") renderSources();
    if (state.view === "settings") renderProperties();
    $("navCount").textContent = C.summary(objectRecords()).pending;
    icons();
    document.querySelectorAll("img").forEach((img) => {
      img.onerror = () => {
        const parent = img.parentElement;
        img.remove();
        parent.textContent = "图片不可用";
      };
    });
  }
  function openDetail(id) {
    const r = bundle.records.find((r) => r.id === id);
    if (!r) return;
    state.detailId = id;
    const edit = saved.workflow[id] || {},
      sla = C.sla(r, property(), Date.now());
    $("detailTitle").textContent = r.title;
    const ownerOptions = [...new Set([r.owner, ...property().owners])].filter(
      Boolean,
    );
    const detailItem = (name, value) =>
      `<div><span>${name}</span>${esc(value)}</div>`;
    $("detailBody").innerHTML =
      `<div class="detail-meta">${pill(r.platform)}${pill(r.riskLevel)}${pill(r.sentiment)}${pill(r.verification === "verified" ? "已核验" : "待核验")}${pill(r.assessmentMode === "manual" ? "人工研判" : "规则初判")}</div><div class="detail-content">${esc(r.content)}</div><div class="evidence-grid"><div class="evidence-image">${r.mediaPreview ? `<img src="${esc(r.mediaPreview)}" alt="${esc(r.mediaLabel)}" referrerpolicy="no-referrer">` : '<span class="muted small">尚未留存图片</span>'}</div><div class="evidence-data">${detailItem("源账号", r.sourceAccount || "未收录")}${detailItem("评论账号", r.commentAccount || "不适用 / 未收录")}${detailItem("发布时间", time(r.publishedAt))}${detailItem("首次发现时间", time(r.firstSeenAt))}${detailItem("最近收录时间", time(r.observedAt))}${detailItem("来源类型", r.provenance)}${detailItem("源内容标识", r.parentId || r.sourceId)}<div><span>原始内容</span>${sourceLink(r)}</div>${detailItem("客源线索", r.origin.type + (r.origin.city ? " · " + r.origin.city : ""))}${detailItem("客源依据", r.origin.evidence)}</div></div><p class="detail-disclaimer">${esc(r.mediaPreview ? r.mediaLabel + "仅为内容图像，评论需在原页面核对。" : "缺少图片时请打开原始内容核对。")}${esc(r.evidenceNote ? " " + r.evidenceNote : "")}</p><div class="detail-section"><h3>${esc(r.topic)}</h3><p>触发词：${esc(r.keywords.join("、") || "无")} · ${esc(sla.text)}</p><p>${esc(r.suggestion)}</p></div><form id="workflowForm"><div class="detail-section"><h3>研判与处置</h3><div class="form-grid"><label>负责人<select name="owner">${ownerOptions.map((o) => `<option ${o === r.owner ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label><label>处置状态<select name="status">${C.STATUSES.map((s) => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>情感研判<select name="sentiment">${["正面", "中性", "负面"].map((s) => `<option ${s === r.sentiment ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>风险等级<select name="riskLevel">${C.LEVELS.map((s) => `<option ${s === r.riskLevel ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="full">核查记录<textarea name="note" maxlength="4000">${esc(edit.note || "")}</textarea></label><label class="full">实际回复 / 处置结果<textarea name="reply" maxlength="4000">${esc(edit.reply || "")}</textarea></label><label class="full">复盘与整改<textarea name="review" maxlength="4000">${esc(edit.review || "")}</textarea></label></div><div class="dialog-footer"><label class="check"><input name="verification" type="checkbox" ${r.verification === "verified" ? "checked" : ""}>已核对原内容</label><button class="button primary" type="submit">${icon("save")}保存处置</button></div></div></form><div class="detail-section"><h3>操作记录</h3><div class="timeline">${
        (edit.history || [])
          .slice()
          .reverse()
          .map(
            (h) =>
              `<div class="timeline-entry">${esc(time(h.at))} · <b>${esc(h.status)}</b> · ${esc(h.owner)}${h.note ? " · " + esc(h.note) : ""}</div>`,
          )
          .join("") || "<p>暂无人工处置记录</p>"
      }</div></div>`;
    if (!$("detailDialog").open) $("detailDialog").showModal();
    icons();
    $("detailBody")
      .querySelector("img")
      ?.addEventListener("error", function () {
        this.parentElement.textContent = "图片已失效，请核对原链接";
      });
    $("workflowForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      data.verification = data.verification ? "verified" : "pending";
      try {
        const patch = C.validateWorkflow(r, data);
        const history = [
          ...(edit.history || []),
          {
            at: Date.now(),
            status: patch.status,
            owner: patch.owner,
            note: patch.note,
            reply: patch.reply,
            review: patch.review,
            sentiment: patch.sentiment,
            riskLevel: patch.riskLevel,
            verification: patch.verification,
          },
        ].slice(-100);
        persist({
          ...saved,
          workflow: { ...saved.workflow, [r.id]: { ...patch, history } },
        });
        rebuild();
        render();
        openDetail(r.id);
        toast("处置已保存");
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(
      new Blob([content], { type: type || "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csvSafe(value) {
    const text = String(value ?? "");
    return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  }
  function exportCsv() {
    const rows = filteredRecords().map((r) => ({
      平台: r.platform,
      内容: r.content,
      发布时间: time(r.publishedAt),
      来源账号: r.sourceAccount,
      评论账号: r.commentAccount,
      源链接: r.sourceUrl,
      情感: r.sentiment,
      风险: r.riskLevel,
      主题: r.topic,
      负责人: r.owner,
      状态: C.needsAction(r) ? r.status : "无需跟进",
      核验: r.verification === "verified" ? "已核验" : "待核验",
      赞: r.metrics.likes,
      评论: r.metrics.comments,
      分享: r.metrics.shares,
      采集时间: time(r.observedAt),
    }));
    if (!rows.length) {
      toast("当前列表没有可导出的反馈");
      return;
    }
    download(
      "\ufeff" +
        window.Papa.unparse(
          rows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k, csvSafe(v)]),
            ),
          ),
        ),
      "舆情反馈_" + property().name + ".csv",
      "text/csv;charset=utf-8",
    );
  }
  function makeBrief() {
    const list = filteredRecords(),
      s = C.summary(list),
      ranges = {
        all: "全部历史",
        today: "今天",
        "24h": "最近24小时",
        "7d": "最近7天",
        "30d": "最近30天",
      };
    const pending = list
      .filter(C.isPending)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);
    const channels = C.PLATFORMS.map(
      (p) => `${p}：${sourceLabel(platformState(p))}`,
    ).join("；");
    return [
      `${property().name} 舆情简报`,
      `生成时间：${time(Date.now())}`,
      `统计范围：${ranges[state.range]}，平台：${state.platform === "all" ? "全部" : state.platform}，列表：${{ all: "全部反馈", risk: "负面预警", inquiry: "咨询", positive: "正面" }[state.scope]}，风险：${state.level}，状态：${state.status}，核验：${state.verification}，搜索：${state.query || "无"}，仅待处理：${state.pending ? "是" : "否"}`,
      "",
      `收录反馈：${s.total}（内容${s.contents}，评论${s.comments}）`,
      `样本负面率：${s.negativeRate == null ? "暂无样本" : s.negativeRate.toFixed(1) + "%"}（负面${s.negative}，咨询${s.inquiries}）`,
      `红橙预警：${s.highRisk}；待处理：${s.pending}`,
      "",
      "优先处置：",
      ...(pending.length
        ? pending.map(
            (r, i) =>
              `${i + 1}. ${r.platform} / ${r.riskLevel} / ${r.owner} / ${r.verification === "verified" ? "已核验" : "待核验"}：${r.content.slice(0, 120)}\n   ${r.sourceUrl || "原链接缺失"}`,
          )
        : ["当前范围暂无待处理事项"]),
      "",
      `覆盖情况：${channels}`,
      "统计仅代表已收录样本；未接入平台的0条不代表无投诉；规则初判需人工核验。",
    ].join("\n");
  }
  function template() {
    download(
      "\ufeff" +
        window.Papa.unparse([
          [
            "platform",
            "sourceId",
            "recordKind",
            "content",
            "publishedAt",
            "sourceAccount",
            "sourceUrl",
            "rating",
            "likes",
            "comments",
            "shares",
            "mediaPreview",
            "observedAt",
            "provenance",
          ],
        ]),
      "舆情导入模板.csv",
      "text/csv;charset=utf-8",
    );
  }
  async function importFile(file) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024)
      throw new Error("单次导入文件不能超过25MB");
    const text = (await file.text()).replace(/^\ufeff/, "");
    let input;
    if (/\.csv$/i.test(file.name)) {
      const parsed = window.Papa.parse(text, {
        header: true,
        skipEmptyLines: "greedy",
      });
      if (parsed.errors.length)
        throw new Error("CSV格式有误：" + parsed.errors[0].message);
      if (
        !parsed.meta.fields.includes("platform") ||
        !parsed.meta.fields.includes("content")
      )
        throw new Error("请使用导入模板，CSV必须包含 platform 和 content 列");
      input = {
        properties: [property()],
        records: parsed.data.map((row) => ({
          ...row,
          propertyId: state.propertyId,
        })),
      };
    } else {
      input = JSON.parse(text);
      if (Array.isArray(input))
        input = { records: input, properties: [property()] };
    }
    if (!input.properties) input.properties = [property()];
    const incoming = C.normalizeBundle(input, property());
    // Parse and validate the whole batch before touching stored state.
    const propertyMap = new Map(bundle.properties.map((p) => [p.id, p]));
    incoming.properties.forEach((p) => {
      const existing = propertyMap.get(p.id);
      if (existing && existing.name !== p.name)
        throw new Error("监测对象 id 与现有名称冲突：" + p.name);
    });
    const batchId = "import-" + C.hash(text + file.name);
    if (bundle.batches.some((b) => b.id === batchId)) {
      toast("此文件已导入，无重复新增");
      return;
    }
    const seen = new Set(bundle.records.map((r) => r.id));
    const newCount = incoming.records.filter((r) => !seen.has(r.id)).length;
    const now = Date.now();
    const batches = incoming.properties.map((p) => ({
      id: batchId + (incoming.properties.length > 1 ? "-" + p.id : ""),
      propertyId: p.id,
      label: file.name,
      count: incoming.records.filter((r) => r.propertyId === p.id).length,
      importedAt: now,
      observedAt:
        Math.max(
          0,
          ...incoming.records
            .filter((r) => r.propertyId === p.id)
            .map((r) => r.observedAt || 0),
        ) || null,
    }));
    const workflow = { ...saved.workflow };
    if (
      input.workspaceBackup === true &&
      input.workflow &&
      typeof input.workflow === "object"
    ) {
      for (const [id, edit] of Object.entries(input.workflow)) {
        const r = incoming.records.find((r) => r.id === id);
        if (!r) continue;
        const patch = C.validateWorkflow({ ...r, status: edit.status }, edit);
        workflow[r.id] = {
          ...patch,
          history: (Array.isArray(edit.history) ? edit.history : [])
            .slice(-100)
            .map((h) => ({
              at: C.timestamp(h.at),
              status: C.STATUSES.includes(h.status) ? h.status : "待研判",
              owner: C.clean(h.owner, 80),
              note: C.clean(h.note, 4000),
            })),
        };
      }
    }
    const newChannels = incoming.channels.length
      ? incoming.channels
      : incoming.properties.flatMap((p) =>
          C.PLATFORMS.filter((platform) =>
            incoming.records.some(
              (r) => r.propertyId === p.id && r.platform === platform,
            ),
          ).map((platform) => ({
            propertyId: p.id,
            platform,
            state: "sample",
            lastSuccessAt:
              Math.max(
                0,
                ...incoming.records
                  .filter(
                    (r) => r.propertyId === p.id && r.platform === platform,
                  )
                  .map((r) => r.observedAt || 0),
              ) || null,
            note: "人工导入样本，持续采集尚未接入",
          })),
        );
    persist({
      ...saved,
      properties: [
        ...new Map(
          [
            ...saved.properties,
            ...incoming.properties.filter(
              (p) => !base.properties.some((b) => b.id === p.id),
            ),
          ].map((p) => [p.id, p]),
        ).values(),
      ],
      records: C.dedupe([...saved.records, ...incoming.records]),
      batches: [...saved.batches, ...batches].slice(-100),
      channels: [
        ...new Map(
          [...saved.channels, ...newChannels].map((c) => [
            c.propertyId + "|" + c.platform,
            c,
          ]),
        ).values(),
      ],
      workflow,
    });
    rebuild();
    render();
    toast(
      `已导入${incoming.records.length}条，新增${newCount}条；重复记录已合并`,
    );
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.view) setView(b.dataset.view);
    if (b.dataset.go) setView(b.dataset.go);
    if (b.dataset.close) $(b.dataset.close).close();
    if (b.dataset.detail) openDetail(b.dataset.detail);
    if (b.dataset.scope) {
      state.scope = b.dataset.scope;
      state.page = 1;
      render();
    }
    if (b.dataset.platform) {
      state.platform = b.dataset.platform;
      $("platformFilter").value = state.platform;
      state.scope = "all";
      state.page = 1;
      setView("feedback");
    }
    if (b.dataset.workflow) {
      state.status = b.dataset.workflow;
      $("statusFilter").value = state.status;
      state.page = 1;
      setView("feedback");
    }
    if (b.dataset.selectProperty) {
      state.propertyId = b.dataset.selectProperty;
      clearFilters();
      setView("overview");
    }
    if (b.dataset.editProperty)
      openPropertyForm(
        bundle.properties.find((p) => p.id === b.dataset.editProperty),
      );
  });
  function clearFilters() {
    Object.assign(state, {
      platform: "all",
      level: "all",
      status: "all",
      verification: "all",
      query: "",
      pending: false,
      scope: "all",
      page: 1,
    });
    [
      "platformFilter",
      "levelFilter",
      "statusFilter",
      "verificationFilter",
    ].forEach((id) => ($(id).value = "all"));
    $("query").value = "";
    $("pendingFilter").checked = false;
    render();
  }
  $("platformFilter").innerHTML =
    '<option value="all">全部平台</option>' +
    C.PLATFORMS.map((p) => `<option>${p}</option>`).join("");
  for (const [id, key] of [
    ["platformFilter", "platform"],
    ["levelFilter", "level"],
    ["statusFilter", "status"],
    ["verificationFilter", "verification"],
    ["rangeFilter", "range"],
  ])
    $(id).addEventListener("change", (e) => {
      state[key] = e.target.value;
      state.page = 1;
      render();
    });
  $("propertyFilter").addEventListener("change", (e) => {
    state.propertyId = e.target.value;
    clearFilters();
  });
  $("query").addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    state.page = 1;
    render();
  });
  $("pendingFilter").addEventListener("change", (e) => {
    state.pending = e.target.checked;
    state.page = 1;
    render();
  });
  $("clearFilters").addEventListener("click", clearFilters);
  $("prevPage").addEventListener("click", () => {
    state.page--;
    render();
  });
  $("nextPage").addEventListener("click", () => {
    state.page++;
    render();
  });
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (e) => {
    try {
      await importFile(e.target.files[0]);
    } catch (e) {
      toast("导入失败：" + e.message, true);
    } finally {
      $("importFile").value = "";
    }
  });
  $("backupBtn").addEventListener("click", () => {
    download(
      JSON.stringify(
        { ...bundle, workspaceBackup: true, workflow: saved.workflow },
        null,
        2,
      ),
      "旅声工作空间备份.json",
      "application/json",
    );
    toast("备份包含反馈数据与人工处置记录");
  });
  $("templateBtn").addEventListener("click", template);
  $("csvBtn").addEventListener("click", exportCsv);
  $("briefBtn").addEventListener("click", () => {
    $("briefText").value = makeBrief();
    $("briefDialog").showModal();
  });
  $("briefDownload").addEventListener("click", () =>
    download($("briefText").value, property().name + "_舆情简报.txt"),
  );
  function openPropertyForm(p) {
    $("propertyForm").reset();
    editingPropertyId = p?.id || null;
    $("propertyDialogTitle").textContent = p ? "编辑监测对象" : "新增监测对象";
    if (p)
      for (const [key, value] of Object.entries({
        name: p.name,
        kind: p.kind,
        city: p.city,
        aliases: p.aliases.join("、"),
        owners: p.owners.join("、"),
        redHours: p.slaHours["红色"],
        orangeHours: p.slaHours["橙色"],
        yellowHours: p.slaHours["黄色"],
      }))
        $("propertyForm").elements[key].value = value;
    $("propertyDialog").showModal();
  }
  $("addPropertyBtn").addEventListener("click", () => openPropertyForm());
  $("propertyForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try {
      const p = C.normalizeProperty({
        ...f,
        id: editingPropertyId || "property-" + C.hash(f.name + Date.now()),
        aliases: f.aliases
          .split(/[,，、]/)
          .map((v) => v.trim())
          .filter(Boolean),
        owners: f.owners
          .split(/[,，、]/)
          .map((v) => v.trim())
          .filter(Boolean),
        slaHours: {
          红色: Number(f.redHours),
          橙色: Number(f.orangeHours),
          黄色: Number(f.yellowHours),
        },
      });
      if (
        bundle.properties.some((old) => old.id !== p.id && old.name === p.name)
      )
        throw new Error("已有同名监测对象");
      persist({
        ...saved,
        properties: [...saved.properties.filter((old) => old.id !== p.id), p],
      });
      rebuild();
      state.propertyId = p.id;
      clearFilters();
      $("propertyDialog").close();
      render();
      toast("监测对象已保存");
    } catch (e) {
      toast(e.message, true);
    }
  });
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      )
        dialog.close();
    }),
  );
  rebuild();
  render();
  setInterval(() => {
    if (!$("detailDialog").open) render();
  }, 60000);
})();
