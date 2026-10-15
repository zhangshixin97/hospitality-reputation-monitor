(function () {
  "use strict";
  const C = window.TravelPulse,
    W = window.TravelWorkspace,
    I = window.TravelImporter,
    O = window.TravelOperations;
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
    C.timestamp(n)
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
  const localField = (n) =>
    n ? new Date(n + 8 * 3600000).toISOString().slice(0, 16) : "";
  const publishTime = (r) =>
    r.publishedPrecision === "day" && r.publishedAt
      ? time(r.publishedAt).split(" ")[0] + " · 日期"
      : time(r.publishedAt, true);
  const tones = {
    红色: "red",
    橙色: "orange",
    黄色: "yellow",
    负面: "red",
    正面: "green",
    已回复: "blue",
    已复盘: "green",
    已完成: "green",
    整改中: "blue",
  };
  const pill = (text, tone) =>
    `<span class="pill ${tone || tones[text] || ""}">${esc(text)}</span>`;
  const rangeLabels = {
    all: "全部历史",
    today: "今天",
    "24h": "最近24小时",
    "7d": "最近7天",
    "30d": "最近30天",
  };
  let base;
  let initialError = "";
  try {
    base = C.normalizeBundle(
      window.TRAVEL_PULSE_LOCAL || window.TRAVEL_PULSE_SEED,
    );
  } catch (e) {
    base = C.normalizeBundle(window.TRAVEL_PULSE_SEED);
    initialError = "本地数据载入失败：" + e.message;
  }
  const realBase = base;
  const storageKey =
    "travel-pulse:v2:" + C.hash(base.properties.map((p) => p.id).join("|"));
  let saved = W.empty(),
    corruptedSnapshot = "",
    storageProblem = false;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      corruptedSnapshot = raw;
      saved = W.normalizeSaved(JSON.parse(raw), base);
      corruptedSnapshot = "";
    }
  } catch (e) {
    storageProblem = true;
    initialError =
      "浏览器保存的数据无法读取，请先导出原始备份，再导入有效工作空间恢复。";
  }
  let bundle = W.build(base, saved),
    demoMode = false,
    realSaved = null,
    editingPropertyId = null,
    editingActionId = null,
    pendingImport = null,
    toastTimer;
  const state = {
    view: "overview",
    propertyId: base.properties[0].id,
    range: "all",
    platform: "all",
    level: "all",
    status: "all",
    sentiment: "all",
    verification: "all",
    query: "",
    pending: false,
    scope: "all",
    page: 1,
  };
  const pageSize = 25;
  let monitorChart = null;
  const property = () =>
    bundle.properties.find((p) => p.id === state.propertyId) ||
    bundle.properties[0];
  const objectRecords = () =>
    bundle.records.filter((r) => r.propertyId === state.propertyId);
  const rangeRecords = () =>
    objectRecords().filter((r) => C.inRange(r, state.range, Date.now()));
  function icons() {
    window.lucide?.createIcons();
  }
  function toast(message, error = false) {
    $("toast").textContent = message;
    $("toast").className = "toast" + (error ? " error" : "");
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
  }
  function persist(next, restore = false) {
    if (demoMode) {
      saved = next;
      $("saveStatus").textContent = "模拟操作，退出后丢弃";
      return;
    }
    if (corruptedSnapshot && !restore)
      throw new Error("保存已暂停，请备份并恢复异常存储");
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      saved = next;
      corruptedSnapshot = "";
      storageProblem = false;
      initialError = "";
      $("saveStatus").textContent = "已保存 · " + time(Date.now(), true);
    } catch {
      storageProblem = true;
      $("saveStatus").textContent = "保存失败，请导出备份";
      throw new Error("浏览器存储不可用或已满，本次修改未保存");
    }
  }
  function rebuild() {
    bundle = W.build(base, saved);
  }
  function setView(view) {
    if (view !== "overview" && document.fullscreenElement) {
      document.exitFullscreen().then(
        () => setView(view),
        () => toast("请先退出大盘全屏再查看列表"),
      );
      return;
    }
    state.view = view;
    document
      .querySelectorAll("[data-section]")
      .forEach((el) => (el.hidden = el.dataset.section !== view));
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
      review: "运营复盘",
    }[view];
    render();
  }
  function filteredRecords() {
    return O.selectFeedback(rangeRecords(), state);
  }
  function platformState(platform) {
    const channel = bundle.channels.find(
      (c) => c.propertyId === state.propertyId && c.platform === platform,
    );
    const items = objectRecords().filter((r) => r.platform === platform);
    return (
      channel || {
        state: items.length ? "sample" : "not-connected",
        lastSuccessAt:
          Math.max(0, ...items.map((r) => r.observedAt || 0)) || null,
        note: "",
      }
    );
  }
  const sourceLabel = (c) =>
    ({
      connected: "已接入",
      sample: "收录样本",
      partial: "部分收录",
      failed: "更新失败",
      "not-connected": "未接入",
    })[c.state] || "未接入";
  function renderFreshness() {
    const channels = C.PLATFORMS.map(platformState).filter(
      (c) => c.state !== "not-connected",
    );
    const latest = Math.max(0, ...channels.map((c) => c.lastSuccessAt || 0));
    const connected = channels.filter((c) => c.state === "connected").length;
    const fresh =
      channels.length > 0 &&
      channels.every(
        (c) =>
          c.state === "connected" &&
          Date.now() - (c.lastSuccessAt || 0) <= 86400000,
      );
    let message = !channels.length
      ? "暂无反馈数据，各平台尚未持续接入。暂不能判断整体舆情。"
      : `${!latest || Date.now() - latest > 86400000 ? "采集数据已过期" : fresh ? "数据已更新" : "当前为部分收录"} · 最近收录 ${time(latest)} · ${connected}个平台持续接入。未覆盖平台的0条仅表示未收录。`;
    if (demoMode)
      message = "当前为模拟演示。样本、来源状态和处置记录均为虚构。";
    $("freshness").classList.toggle("fresh", fresh && !demoMode);
    $("freshness").innerHTML = icon("info") + `<span>${esc(message)}</span>`;
  }
  function renderStats(list) {
    const s = C.summary(list);
    $("stats").innerHTML = [
      [
        "已收录反馈",
        fmt(s.total),
        `内容 ${s.contents} · 点评/评论 ${s.comments}`,
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
        "含待核验的规则初判",
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
    const q = O.quality(list);
    $("qualityStrip").innerHTML =
      `${icon("shield-check")}<span>已核验 <b>${q.verified}/${list.length}</b></span><span>有原链接 <b>${q.links}/${list.length}</b></span><span>发布时间未知 <b>${q.unknownTime}</b></span><span>仅日期 <b>${q.dayOnly}</b></span>`;
    const actionable = O.priorities(list, property(), Date.now());
    const high = actionable.filter((r) =>
      ["红色", "橙色"].includes(r.riskLevel),
    ).length;
    const due = actionable.filter(
      (r) => C.sla(r, property(), Date.now()).overdue,
    ).length;
    $("dutyFocus").innerHTML =
      `<div><h2>当班聚焦</h2><p>${high ? `${high}条红橙风险需核实，` : ""}${due ? `${due}条事项已超时。` : "当前范围暂无超时事项。"}${actionable.length ? `待处理${actionable.length}条。` : ""}</p></div><div class="focus-actions"><button class="button" data-pending-risk>${icon("list-filter")}查看待处理</button><button class="text-button" data-go="review">整改台账${icon("arrow-up-right")}</button>${objectRecords().length && !demoMode ? `<button class="icon-button" data-demo title="体验模拟示例" aria-label="体验模拟示例">${icon("play")}</button>` : ""}</div>`;
    $("onboarding").hidden = objectRecords().length > 0 || demoMode;
  }
  function renderPlatforms(list) {
    $("platforms").innerHTML = C.PLATFORMS.filter((p) => p !== "视频号")
      .map((platform) => {
        const items = list.filter((r) => r.platform === platform),
          c = platformState(platform);
        const counts = ["正面", "中性", "负面"].map(
          (sentiment) => items.filter((r) => r.sentiment === sentiment).length,
        );
        return `<button class="platform" data-platform="${platform}"><div class="platform-head"><span class="platform-name">${platform}</span>${pill(demoMode ? "模拟" : sourceLabel(c), c.state === "connected" ? "green" : "")}</div><div class="platform-total">${fmt(items.length)}<small>条反馈</small></div><div class="sentiment-bar">${counts.map((n, i) => `<span style="width:${items.length ? (n / items.length) * 100 : 0}%;background:${["var(--green)", "#aebdc2", "var(--red)"][i]}"></span>`).join("")}</div><div class="sentiment-counts"><span class="positive-text">正面 ${counts[0]}</span><span>中性 ${counts[1]}</span><span class="negative-text">负面 ${counts[2]}</span></div></button>`;
      })
      .join("");
  }
  function renderMonitor(list) {
    const s = C.summary(list),
      q = O.quality(list),
      reviewed = list.filter(
        (r) => C.needsAction(r) && r.status === "已复盘",
      ).length;
    $("boardScope").textContent =
      `${rangeLabels[state.range]} · 平台 → 情感 → 处置`;
    $("boardMode").textContent = demoMode ? "模拟演示" : "收录样本";
    $("boardMetrics").innerHTML = [
      ["待处理", s.pending, "待研判、已派单、处理中", "pending", "alert"],
      ["红橙风险", s.highRisk, "含待核验初判", "risk", "negative"],
      ["未核验", list.length - q.verified, "原内容需核对", "verify", ""],
      ["已闭环", reviewed, "已记录实际回复及复盘", "done", ""],
    ]
      .map(
        ([title, count, note, mode, cls]) =>
          `<button class="board-metric ${cls}" data-board-state="${mode}"><span>${title}</span><strong>${count}</strong><small>${note}</small></button>`,
      )
      .join("");
    $("boardCoverage").textContent =
      `${s.total}条反馈 · ${new Set(list.map((r) => r.platform)).size}个平台有样本 · ${q.verified}条已核验`;
    $("boardEmpty").hidden = list.length > 0;
    $("monitorChart").setAttribute(
      "aria-label",
      `${demoMode ? "模拟演示。" : ""}${s.total}条反馈，负面${s.negative}条，咨询${s.inquiries}条，待处理${s.pending}条，已复盘${reviewed}条。按平台、情感与处置状态展示流向。`,
    );
    if (!window.echarts) {
      $("boardEmpty").hidden = false;
      $("boardEmpty").textContent = "图表未载入，统计仍可查看";
      return;
    }
    if (!monitorChart) {
      monitorChart = window.echarts.init($("monitorChart"), null, {
        renderer: "canvas",
      });
      monitorChart.on("click", (params) => {
        if (params.dataType !== "node") return;
        const [group, name] = params.name.split(":");
        clearFilters();
        if (group === "平台") {
          state.platform = name;
          $("platformFilter").value = name;
        }
        if (group === "情感") {
          state.sentiment = name;
          $("sentimentFilter").value = name;
        }
        if (group === "处置") {
          state.status = name === "无需跟进" ? "none" : name;
          $("statusFilter").value = state.status;
        }
        setView("feedback");
      });
    }
    const flow = O.monitorFlow(list);
    monitorChart.resize();
    monitorChart.setOption(
      {
        animation: false,
        tooltip: {
          trigger: "item",
          renderMode: "richText",
          formatter: (params) =>
            params.dataType === "edge"
              ? `${params.data.source.split(":")[1]} → ${params.data.target.split(":")[1]}：${params.value}条`
              : `${params.name.split(":")[1]}：${params.value}条`,
        },
        series: [
          {
            type: "sankey",
            left: 8,
            right: 8,
            top: 20,
            bottom: 20,
            nodeWidth: 11,
            nodeGap: innerWidth <= 800 ? 18 : 14,
            draggable: false,
            nodeAlign: "justify",
            emphasis: { focus: "adjacency" },
            label: {
              color: "#111318",
              fontFamily: "MiSans, sans-serif",
              fontSize:
                innerWidth <= 800 ? 13 : document.fullscreenElement ? 20 : 14,
              backgroundColor: "rgba(255,255,255,.94)",
              padding: [3, 5],
              formatter: (p) => p.name.split(":")[1] + " " + p.value,
            },
            lineStyle: { color: "gradient", opacity: 0.2, curveness: 0.52 },
            data: flow.nodes.map((n) => ({
              ...n,
              label: { position: n.depth === 2 ? "left" : "right" },
            })),
            links: flow.links,
          },
        ],
      },
      true,
    );
    requestAnimationFrame(() => monitorChart.resize());
  }
  function renderAnalysis(list) {
    const groups = O.groups(list, property(), Date.now()).slice(0, 6),
      max = Math.max(1, ...groups.map((g) => g.count));
    $("topics").innerHTML =
      groups
        .map(
          (g) =>
            `<div class="topic-row"><span>${esc(g.topic)}</span><div class="topic-track"><div class="topic-fill" style="width:${(g.count / max) * 100}%"></div></div><span>${g.count}</span></div>`,
        )
        .join("") || '<div class="empty">当前样本暂无风险主题</div>';
    const hours = C.hourly(objectRecords(), Date.now()),
      peak = Math.max(1, ...hours.map((h) => h.count));
    $("hourChart").innerHTML =
      hours
        .map(
          (h) =>
            `<div class="hour-column ${h.negative ? "negative" : ""}" title="${esc(time(h.start))}：${h.count}条，负面${h.negative}条"><span style="height:${Math.max(2, (h.count / peak) * 100)}%"></span></div>`,
        )
        .join("") +
      (hours.every((h) => !h.count)
        ? '<div class="zero-chart">最近24小时未收录已知具体时间的反馈</div>'
        : "");
    $("hourChart").setAttribute(
      "aria-label",
      `最近24小时${hours.reduce((n, h) => n + h.count, 0)}条反馈，${hours.reduce((n, h) => n + h.negative, 0)}条负面。仅日期或时间未知的反馈不进入此图。`,
    );
    $("hourLabels").innerHTML = [0, 6, 12, 18, 23]
      .map(
        (i) =>
          `<span>${esc(time(hours[i].start, true).split(" ").pop())}</span>`,
      )
      .join("");
    const priorities = O.priorities(list, property(), Date.now()).slice(0, 4),
      overdue = list.filter(
        (r) => C.sla(r, property(), Date.now()).overdue,
      ).length;
    $("slaCount").textContent = `超时 ${overdue}`;
    $("slaCount").className = "pill " + (overdue ? "red" : "green");
    $("priorities").innerHTML =
      priorities
        .map(
          (r) =>
            `<div class="priority">${pill(r.riskLevel === "普通" ? "咨询" : r.riskLevel)}<div class="priority-main"><p>${esc(r.content)}</p><span class="muted">${esc(r.platform)} · ${esc(r.owner)} · ${esc(C.sla(r, property(), Date.now()).text)}</span></div><button class="icon-button" data-detail="${esc(r.id)}" title="核验与处置" aria-label="核验与处置">${icon("arrow-up-right")}</button></div>`,
        )
        .join("") || '<div class="empty">当前范围暂无待处理事项</div>';
    const origins = new Map();
    list.forEach((r) => {
      const key =
        r.origin.type === "未识别"
          ? "未识别"
          : r.origin.type + " · " + r.origin.city;
      origins.set(key, (origins.get(key) || 0) + 1);
    });
    $("origins").innerHTML =
      [...origins]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(
          ([name, n]) =>
            `<div class="origin-row"><span>${esc(name)}</span><span>${n}条</span></div>`,
        )
        .join("") || '<div class="empty">暂无明确自述线索</div>';
    $("workflow").innerHTML = C.STATUSES.map(
      (status) =>
        `<button data-workflow="${status}"><span>${status}</span><strong>${list.filter((r) => C.needsAction(r) && r.status === status).length}</strong></button>`,
    ).join("");
  }
  function sourceLink(r) {
    return r.sourceUrl
      ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">原内容${icon("external-link")}</a>`
      : "<span>原链接缺失</span>";
  }
  function contentCell(r) {
    return `<div class="content-cell"><div class="thumbnail">${r.mediaPreview ? `<img src="${esc(r.mediaPreview)}" alt="${esc(r.mediaLabel)}" loading="lazy" referrerpolicy="no-referrer">` : icon("image-off")}</div><div class="content-main"><p>${esc(r.content)}</p><div class="source-line"><span>${esc(r.sourceAccount || "账号未收录")}</span>${sourceLink(r)}<span>${r.verification === "verified" ? "已核验" : r.evidenceChanged ? "内容变化·待复核" : "待核验"}</span></div></div></div>`;
  }
  function renderFeedback() {
    const list = filteredRecords(),
      s = C.summary(list),
      pages = Math.max(1, Math.ceil(list.length / pageSize));
    state.page = Math.min(state.page, pages);
    const rows = list.slice((state.page - 1) * pageSize, state.page * pageSize);
    $("listMeta").textContent =
      `共 ${fmt(s.total)}条 · 负面 ${s.negative} · 红橙 ${s.highRisk} · 待处理 ${s.pending}`;
    $("feedbackRows").innerHTML = rows
      .map((r) => {
        const sla = C.sla(r, property(), Date.now());
        return `<tr><td>${contentCell(r)}</td><td>${esc(r.platform)}<span class="cell-sub">${esc(publishTime(r))}</span><span class="cell-sub">${r.recordKind === "comment" ? "点评 / 评论" : "内容"}</span></td><td><div class="judgments">${pill(r.riskLevel)}${pill(r.sentiment)}</div><span class="cell-sub">${esc(r.topic)} · ${r.assessmentMode === "manual" ? "人工研判" : "规则初判"}</span></td><td>赞 ${fmt(r.metrics.likes)}<span class="cell-sub">评论 ${fmt(r.metrics.comments)}</span><span class="cell-sub">分享 ${fmt(r.metrics.shares)}</span></td><td>${pill(C.needsAction(r) ? r.status : "无需跟进")}<span class="cell-sub">${esc(r.owner)}</span><span class="cell-sub ${sla.overdue ? "negative-text" : ""}">${esc(sla.text)}</span></td><td><button class="icon-button" data-detail="${esc(r.id)}" title="详情与处置" aria-label="详情与处置">${icon("arrow-up-right")}</button></td></tr>`;
      })
      .join("");
    $("feedbackMobile").innerHTML = rows
      .map(
        (r) =>
          `<article class="mobile-feedback"><div class="mobile-feedback-head"><span>${esc(r.platform)} · ${esc(publishTime(r))}</span><div class="judgments">${pill(r.riskLevel)}${pill(r.sentiment)}</div></div>${contentCell(r)}<div class="mobile-feedback-footer"><span class="small muted">${C.needsAction(r) ? esc(r.status) : "无需跟进"} · ${esc(r.owner)}</span><button class="icon-button" data-detail="${esc(r.id)}" title="详情与处置" aria-label="详情与处置">${icon("arrow-up-right")}</button></div></article>`,
      )
      .join("");
    $("listEmpty").hidden = rows.length > 0;
    $("listEmpty").textContent = objectRecords().length
      ? "当前条件下暂无反馈"
      : "尚未收录反馈";
    $("pageMeta").textContent = `${state.page}/${pages}页 · 每页${pageSize}条`;
    $("prevPage").disabled = state.page <= 1;
    $("nextPage").disabled = state.page >= pages;
    document
      .querySelectorAll("[data-scope]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.scope === state.scope),
      );
  }
  function renderReview() {
    const list = rangeRecords(),
      risks = list.filter((r) => r.feedbackType === "风险"),
      actions = (saved.actions || []).filter(
        (a) => a.propertyId === state.propertyId,
      );
    $("reviewMetrics").innerHTML = [
      ["风险反馈", risks.length],
      ["已回复待复盘", risks.filter((r) => r.status === "已回复").length],
      ["已完成复盘", risks.filter((r) => r.status === "已复盘").length],
      ["待完成整改", actions.filter((a) => a.status !== "已完成").length],
    ]
      .map(
        ([name, n]) =>
          `<div class="review-metric"><span>${name}</span><strong>${n}</strong></div>`,
      )
      .join("");
    $("reviewTopics").innerHTML =
      O.groups(list, property(), Date.now())
        .map(
          (g) =>
            `<div class="review-row"><div><strong>${esc(g.topic)}</strong><small>${g.count}条风险反馈 · ${g.platforms.length}个平台</small></div><div><span class="small">${esc(g.owner)}</span><p>${esc(g.platforms.join("、"))}</p></div><div><strong>${g.pending}</strong><small>待处理</small></div><div><strong>${g.reviewed}</strong><small>已复盘</small></div><div><button class="button" data-topic-action="${esc(g.topic)}" data-topic-owner="${esc(g.owner)}">${icon("plus")}整改</button></div></div>`,
        )
        .join("") ||
      '<div class="review-empty">当前范围暂无可聚合的风险反馈</div>';
    $("actionList").innerHTML =
      actions
        .slice()
        .sort(
          (a, b) =>
            Number(a.status === "已完成") - Number(b.status === "已完成") ||
            (a.dueAt || Infinity) - (b.dueAt || Infinity),
        )
        .map(
          (a) =>
            `<div class="action-row"><div><h3>${esc(a.title)} ${pill(a.status)}</h3><p>${esc(a.topic)} · ${esc(a.owner)} · 截止${esc(time(a.dueAt))}${a.status !== "已完成" && a.dueAt && a.dueAt < Date.now() ? " · 已超时" : ""}</p>${a.result ? `<p class="action-result">${esc(a.result)}</p>` : ""}</div><button class="icon-button" data-action="${esc(a.id)}" title="编辑整改" aria-label="编辑整改">${icon("pencil")}</button></div>`,
        )
        .join("") || '<div class="review-empty">暂无整改事项</div>';
  }
  function renderSources() {
    $("sources").innerHTML = C.PLATFORMS.map((platform) => {
      const c = platformState(platform),
        items = objectRecords().filter((r) => r.platform === platform);
      return `<div class="source-row"><strong>${platform}</strong><div>${pill(demoMode ? "模拟" : sourceLabel(c))}<p>${esc(c.note || (platform === "门店反馈" ? "手工登记，不自动收集客人信息" : "等待授权导出或人工核验后收录"))}</p></div><div><b>${fmt(items.length)}</b><p>已收录样本</p></div><div><span class="small">${esc(time(c.lastSuccessAt))}</span><p>最近收录</p></div></div>`;
    }).join("");
    const batches = bundle.batches
      .filter((b) => b.propertyId === state.propertyId)
      .slice()
      .reverse()
      .slice(0, 20);
    $("batches").innerHTML =
      batches
        .map(
          (b) =>
            `<div class="batch"><span>${esc(b.label)} · ${b.count}条</span><span class="muted">数据时间${esc(time(b.observedAt))} · 导入${esc(time(b.importedAt))}</span></div>`,
        )
        .join("") || '<div class="empty">暂无导入记录</div>';
  }
  function renderProperties() {
    $("propertyList").innerHTML = bundle.properties
      .map(
        (p) =>
          `<div class="property-row"><div><h3>${esc(p.name)} ${pill(C.KINDS[p.kind])}</h3><p>${esc(p.city || "城市待填写")} · ${bundle.records.filter((r) => r.propertyId === p.id).length}条 · 红/橙/黄 ${p.slaHours["红色"]}/${p.slaHours["橙色"]}/${p.slaHours["黄色"]}小时</p><div class="property-tags">${p.aliases.map((a) => pill(a)).join("")}</div><p>责任团队：${esc(p.owners.join("、"))}</p></div><div class="button-group"><button class="icon-button" data-edit-property="${esc(p.id)}" title="编辑监测对象" aria-label="编辑监测对象">${icon("pencil")}</button><button class="button" data-select-property="${esc(p.id)}">${icon("arrow-up-right")}查看</button></div></div>`,
      )
      .join("");
  }
  function render() {
    $("propertyKind").textContent = C.KINDS[property().kind] + "运营";
    $("pageSubtitle").textContent =
      `${property().name} · ${rangeLabels[state.range]} · 按发布时间统计`;
    $("clockLabel").textContent = time(Date.now());
    $("propertyFilter").innerHTML = bundle.properties
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join("");
    $("propertyFilter").value = state.propertyId;
    $("navCount").textContent = C.summary(objectRecords()).pending;
    $("demoBanner").hidden = !demoMode;
    $("loadError").hidden = !initialError || demoMode;
    $("loadError").textContent = initialError;
    if (storageProblem && !demoMode)
      $("saveStatus").textContent = "存储异常，请备份检查";
    renderFreshness();
    const list = rangeRecords();
    if (state.view === "overview") {
      renderStats(list);
      renderMonitor(list);
      renderPlatforms(list);
      renderAnalysis(list);
    }
    if (state.view === "feedback") renderFeedback();
    if (state.view === "review") renderReview();
    if (state.view === "coverage") renderSources();
    if (state.view === "settings") renderProperties();
    icons();
    document.querySelectorAll("img").forEach(
      (img) =>
        (img.onerror = () => {
          img.parentElement.textContent = "图片已失效";
        }),
    );
  }
  function openDetail(id) {
    const r = bundle.records.find((r) => r.id === id);
    if (!r) return;
    const edit = saved.workflow[id] || {},
      sla = C.sla(r, property(), Date.now()),
      owners = [...new Set([r.owner, ...property().owners])];
    $("detailTitle").textContent = r.title;
    const item = (name, value) =>
      `<div><span>${name}</span>${esc(value)}</div>`;
    $("detailBody").innerHTML =
      `<div class="detail-meta">${pill(r.platform)}${pill(r.riskLevel)}${pill(r.sentiment)}${pill(r.verification === "verified" ? "已核验" : "待核验")}${pill(r.assessmentMode === "manual" ? "人工研判" : "规则初判")}${demoMode ? pill("模拟演示", "demo") : ""}</div><div class="detail-content">${esc(r.content)}</div><div class="evidence-grid"><div class="evidence-image">${r.mediaPreview ? `<img src="${esc(r.mediaPreview)}" alt="${esc(r.mediaLabel)}" referrerpolicy="no-referrer">` : '<span class="muted small">尚未留存图片</span>'}</div><div class="evidence-data">${item("源账号", r.sourceAccount || "未收录")}${item("评论账号", r.commentAccount || "未收录")}${item("发布时间", publishTime(r))}${item("首次发现", time(r.firstSeenAt))}${item("最近收录", time(r.observedAt))}${item("来源类型", r.provenance)}${item("源标识", r.parentId || r.sourceId || "未提供")}<div><span>原始内容</span>${sourceLink(r)}</div>${item("客源判断", r.origin.type + (r.origin.city ? " · " + r.origin.city : ""))}${item("依据", r.origin.evidence)}</div></div><p class="detail-disclaimer">${esc(r.mediaPreview ? r.mediaLabel + "不是评论截图，请核对原内容。" : "尚未留存截图。")}${esc(r.evidenceNote ? " " + r.evidenceNote : "")}</p>${r.evidenceChanged ? '<p class="draft-warning">内容或原链接发生变化，已重新进入待研判。</p>' : ""}<div class="detail-section"><h3>${esc(r.topic)} · ${esc(sla.text)}</h3><p>触发词：${esc(r.keywords.join("、") || "无")}</p><p>${esc(r.suggestion)}</p></div><form id="workflowForm"><div class="detail-section"><div class="draft-panel"><h3>研判与处置</h3><button class="button" type="button" id="replyDraftBtn">${icon("file-pen-line")}生成回复草稿</button></div><div class="form-grid"><label>负责人<select name="owner">${owners.map((o) => `<option ${o === r.owner ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label><label>处置状态<select name="status">${C.STATUSES.map((s) => `<option ${s === r.status ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>情感研判<select name="sentiment">${["正面", "中性", "负面"].map((s) => `<option ${s === r.sentiment ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>风险等级<select name="riskLevel">${C.LEVELS.map((s) => `<option ${s === r.riskLevel ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="full">核查记录<textarea name="note" maxlength="4000">${esc(edit.note || "")}</textarea></label><label class="full">实际回复 / 处置结果<textarea name="reply" maxlength="4000">${esc(edit.reply || "")}</textarea></label><label class="full">复盘与整改<textarea name="review" maxlength="4000">${esc(edit.review || "")}</textarea></label></div><p id="draftWarning" class="draft-warning" hidden>草稿待核实，保存“已回复”前需填写真实处理结果。</p><div class="dialog-footer"><label class="check"><input name="verification" type="checkbox" ${r.verification === "verified" ? "checked" : ""}>已核对原内容</label><button class="button primary" type="submit">${icon("save")}保存处置</button></div></div></form><div class="detail-section"><h3>操作记录</h3><div class="timeline">${
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
        this.parentElement.textContent = "图片已失效";
      });
    $("replyDraftBtn").addEventListener("click", () => {
      const box = $("workflowForm").elements.reply;
      if (box.value.trim()) {
        toast("已有回复内容，请先整理现有记录");
        return;
      }
      box.value = O.responseDraft(r, property());
      $("draftWarning").hidden = false;
    });
    $("workflowForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      data.verification = data.verification ? "verified" : "pending";
      try {
        persist(W.saveWorkflow(saved, r, data, Date.now()));
        rebuild();
        render();
        openDetail(r.id);
        toast(demoMode ? "模拟处置已记录" : "处置记录已保存");
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
  function clearFilters() {
    Object.assign(state, {
      platform: "all",
      level: "all",
      status: "all",
      sentiment: "all",
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
      "sentimentFilter",
      "verificationFilter",
    ].forEach((id) => ($(id).value = "all"));
    $("query").value = "";
    $("pendingFilter").checked = false;
    render();
  }
  function startDemo() {
    if (demoMode) return;
    realSaved = saved;
    const demo = window.createTravelDemo();
    base = demo.base;
    saved = demo.saved;
    demoMode = true;
    rebuild();
    state.propertyId = base.properties[0].id;
    state.range = "all";
    $("rangeFilter").value = "all";
    clearFilters();
    $("saveStatus").textContent = "演示数据，不写入真实空间";
    setView("overview");
  }
  function exitDemo() {
    base = realBase;
    saved = realSaved;
    demoMode = false;
    rebuild();
    state.propertyId = base.properties[0].id;
    clearFilters();
    $("saveStatus").textContent = "真实工作空间";
    setView("overview");
  }
  function download(content, name, type = "text/plain;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const csvSafe = (value) =>
    /^[=+\-@\t\r]/.test(String(value ?? "")) ? "'" + value : (value ?? "");
  function exportCsv() {
    const rows = filteredRecords().map((r) => ({
      平台: r.platform,
      记录类型: r.recordKind,
      内容: r.content,
      发布时间: r.publishedAt
        ? r.publishedPrecision === "day"
          ? new Date(r.publishedAt + 8 * 3600000).toISOString().slice(0, 10)
          : time(r.publishedAt)
        : "",
      源标识: r.sourceId,
      来源账号: r.sourceAccount,
      原链接: r.sourceUrl,
      评分: r.rating,
      情感: r.sentiment,
      风险: r.riskLevel,
      问题主题: r.topic,
      负责人: r.owner,
      状态: C.needsAction(r) ? r.status : "无需跟进",
      核验: r.verification === "verified" ? "已核验" : "待核验",
      赞: r.metrics.likes,
      评论数: r.metrics.comments,
      分享数: r.metrics.shares,
      采集时间: r.observedAt ? time(r.observedAt) : "",
      来源说明: demoMode ? "模拟演示数据" : r.provenance,
    }));
    if (!rows.length) {
      toast("当前列表没有反馈");
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
      (demoMode ? "模拟_" : "") + property().name + "_反馈.csv",
      "text/csv;charset=utf-8",
    );
  }
  function makeBrief() {
    const list = filteredRecords(),
      s = C.summary(list),
      q = O.quality(list),
      priorities = O.priorities(list, property(), Date.now()).slice(0, 5),
      actions = (saved.actions || []).filter(
        (a) => a.propertyId === state.propertyId && a.status !== "已完成",
      );
    return [
      (demoMode ? "【模拟演示】" : "") + property().name + " 舆情简报",
      "生成：" + time(Date.now()),
      `范围：${rangeLabels[state.range]} · 平台${state.platform} · 风险${state.level} · 状态${state.status} · 核验${state.verification} · 视图${state.scope} · 搜索${state.query || "无"} · 仅待处理${state.pending ? "是" : "否"}`,
      "",
      `收录${s.total}条（内容${s.contents}，点评/评论${s.comments}）；负面${s.negative}，咨询${s.inquiries}。`,
      `样本负面率${s.negativeRate == null ? "暂无样本" : s.negativeRate.toFixed(1) + "%"}，红橙${s.highRisk}，待处理${s.pending}。`,
      `核验${q.verified}/${list.length}，有原链接${q.links}/${list.length}，发布时间未知${q.unknownTime}。`,
      "",
      "优先处置：",
      ...(priorities.length
        ? priorities.map(
            (r, i) =>
              `${i + 1}. ${r.platform}/${r.riskLevel}/${r.owner}：${r.content.slice(0, 100)}\n   ${r.sourceUrl || "原链接缺失"}；${r.verification === "verified" ? "已核验" : "待核验"}`,
          )
        : ["当前范围暂无待处理事项"]),
      "",
      "未完成整改：",
      ...(actions.length
        ? actions.map(
            (a) =>
              `- ${a.title}；${a.owner}；${a.status}；截止${time(a.dueAt)}`,
          )
        : ["暂无"]),
      "",
      "覆盖：" +
        C.PLATFORMS.map((p) => p + " " + sourceLabel(platformState(p))).join(
          "；",
        ),
      "仅代表已收录样本；未接入平台的0条不表示没有投诉。规则初判、回复草稿需要人工核验。",
      "旅声 · 张世鑫AI开源项目",
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
  async function prepareImport(file) {
    if (!file) return;
    if (demoMode) throw new Error("请退出演示后导入真实数据");
    if (file.size > 25 * 1024 * 1024) throw new Error("单次导入不能超过25MB");
    pendingImport = {
      file,
      text: (await file.text()).replace(/^\ufeff/, ""),
      property: property(),
      result: null,
    };
    $("importPlatform").value = "";
    renderImport();
    $("importDialog").showModal();
    icons();
  }
  function renderImport() {
    if (!pendingImport) return;
    const { file, text, property: p } = pendingImport;
    const result = I.prepare(text, file.name, p, $("importPlatform").value);
    pendingImport.result = result;
    $("importFilename").textContent = file.name + " · 当前对象：" + p.name;
    $("importPlatformLabel").hidden =
      !/\.csv$/i.test(file.name) ||
      (!result.missingPlatform && !$("importPlatform").value);
    const q = O.quality(result.incoming.records),
      seen = new Set(bundle.records.map((r) => r.id));
    const added = result.incoming.records.filter((r) => !seen.has(r.id)).length;
    $("importPreview").innerHTML =
      `<div class="import-counts"><div><b>${result.rawCount}</b>文件记录</div><div><b>${added}</b>新增</div><div><b>${result.incoming.records.length - added}</b>合并更新</div><div><b>${q.unknownTime}</b>发布时间未知</div></div>${result.missingPlatform ? '<p class="import-info">来源平台待选择</p>' : ""}${
        result.errors.length
          ? `<div class="import-errors"><b>${result.errors.length}行需要修正，本次尚未导入。</b>${result.errors
              .slice(0, 6)
              .map((e) => `<p>第${e.row}行：${esc(e.message)}</p>`)
              .join("")}</div>`
          : ""
      }${result.input.workspaceBackup ? '<p class="import-info">包含工作空间备份，将合并监测对象、人工处置和整改记录。</p>' : ""}<div>${result.incoming.records
        .slice(0, 4)
        .map(
          (r) =>
            `<div class="preview-row">${pill(r.platform)}<p>${esc(r.content.slice(0, 130))}</p></div>`,
        )
        .join("")}</div>`;
    $("confirmImportBtn").disabled =
      result.missingPlatform ||
      result.errors.length > 0 ||
      result.rawCount === 0;
  }
  function confirmImport() {
    if (!pendingImport?.result) return;
    const { incoming, input } = pendingImport.result;
    try {
      const batch = {
        id:
          "import-" +
          C.hash(
            pendingImport.text +
              pendingImport.file.name +
              incoming.properties.map((p) => p.id).join("|") +
              $("importPlatform").value,
          ),
        label: pendingImport.file.name,
      };
      const merged = W.mergeImport(
        saved,
        bundle,
        incoming,
        input,
        batch,
        Date.now(),
      );
      if (merged.duplicate) {
        $("importDialog").close();
        toast("此文件已导入，无重复新增");
        return;
      }
      persist(merged.saved, input.workspaceBackup === true);
      rebuild();
      render();
      $("importDialog").close();
      pendingImport = null;
      toast(
        `已导入${incoming.records.length}条，新增${merged.added}条；重复已合并`,
      );
    } catch (e) {
      toast("导入失败：" + e.message, true);
    }
  }
  function openManual() {
    $("feedbackForm").reset();
    $("manualPlatform").value = "门店反馈";
    $("feedbackFormDialog").showModal();
  }
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
  function openAction(action, topic = "", owner = "") {
    $("actionForm").reset();
    editingActionId = action?.id || null;
    $("actionOwners").innerHTML = property()
      .owners.map((o) => `<option value="${esc(o)}"></option>`)
      .join("");
    const values = action
      ? { ...action, dueAt: localField(action.dueAt) }
      : {
          topic,
          title: topic ? "核查并改善" + topic : "",
          owner: owner || property().owners[0],
          dueAt: localField(Date.now() + 86400000),
        };
    for (const [key, value] of Object.entries(values))
      if ($("actionForm").elements[key])
        $("actionForm").elements[key].value = value;
    $("actionDialog").showModal();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.view) setView(b.dataset.view);
    if (b.dataset.go) setView(b.dataset.go);
    if (b.dataset.close) $(b.dataset.close).close();
    if (b.dataset.open === "feedbackFormDialog") openManual();
    if (b.dataset.detail) openDetail(b.dataset.detail);
    if (b.dataset.scope) {
      state.scope = b.dataset.scope;
      state.page = 1;
      render();
    }
    if (b.dataset.platform) {
      clearFilters();
      state.platform = b.dataset.platform;
      $("platformFilter").value = state.platform;
      setView("feedback");
    }
    if (b.dataset.workflow) {
      clearFilters();
      state.status = b.dataset.workflow;
      $("statusFilter").value = state.status;
      setView("feedback");
    }
    if (b.hasAttribute("data-pending-risk")) {
      clearFilters();
      state.pending = true;
      $("pendingFilter").checked = true;
      setView("feedback");
    }
    if (b.hasAttribute("data-demo")) startDemo();
    if (b.dataset.boardState) {
      clearFilters();
      if (b.dataset.boardState === "pending") {
        state.pending = true;
        $("pendingFilter").checked = true;
      }
      if (b.dataset.boardState === "risk") {
        state.level = "high";
        $("levelFilter").value = "high";
      }
      if (b.dataset.boardState === "verify") {
        state.verification = "pending";
        $("verificationFilter").value = "pending";
      }
      if (b.dataset.boardState === "done") {
        state.status = "已复盘";
        $("statusFilter").value = "已复盘";
      }
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
    if (b.dataset.topicAction)
      openAction(null, b.dataset.topicAction, b.dataset.topicOwner);
    if (b.dataset.action)
      openAction(saved.actions.find((a) => a.id === b.dataset.action));
  });
  document.querySelector(".brand").addEventListener("click", (e) => {
    e.preventDefault();
    setView("overview");
  });
  $("platformFilter").innerHTML =
    '<option value="all">全部平台</option>' +
    C.PLATFORMS.map((p) => `<option>${p}</option>`).join("");
  $("manualPlatform").innerHTML = C.PLATFORMS.map(
    (p) => `<option>${p}</option>`,
  ).join("");
  $("importPlatform").innerHTML += C.PLATFORMS.map(
    (p) => `<option>${p}</option>`,
  ).join("");
  for (const [id, key] of [
    ["platformFilter", "platform"],
    ["levelFilter", "level"],
    ["statusFilter", "status"],
    ["sentimentFilter", "sentiment"],
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
  $("emptyImportBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (e) => {
    try {
      await prepareImport(e.target.files[0]);
    } catch (e) {
      toast("导入失败：" + e.message, true);
    } finally {
      $("importFile").value = "";
    }
  });
  $("importPlatform").addEventListener("change", () => {
    try {
      renderImport();
    } catch (e) {
      toast(e.message, true);
    }
  });
  $("confirmImportBtn").addEventListener("click", confirmImport);
  $("demoBtn").addEventListener("click", startDemo);
  $("exitDemoBtn").addEventListener("click", exitDemo);
  $("addFeedbackBtn").addEventListener("click", openManual);
  $("feedbackForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.target));
    try {
      const now = Date.now();
      if (raw.publishedAt && !C.timestamp(raw.publishedAt))
        throw new Error("发布时间无法识别");
      const r = C.normalizeRecord(
        {
          ...raw,
          observedAt: now,
          provenance: "手工登记",
          source: raw.platform === "门店反馈" ? "门店手工登记" : "人工核对收录",
        },
        property(),
      );
      const added = !bundle.records.some((old) => old.id === r.id);
      persist({
        ...saved,
        records: C.dedupe([...saved.records, r]),
        channels: W.mergeChannels([
          ...saved.channels,
          {
            propertyId: property().id,
            platform: r.platform,
            state: "sample",
            lastSuccessAt: now,
            note: "手工登记样本；持续采集未接入",
          },
        ]),
      });
      rebuild();
      render();
      $("feedbackFormDialog").close();
      toast(added ? "反馈已登记" : "重复反馈已合并");
    } catch (e) {
      toast(e.message, true);
    }
  });
  $("backupBtn").addEventListener("click", () => {
    if (demoMode) {
      toast("请退出演示后备份真实工作空间");
      return;
    }
    if (corruptedSnapshot) {
      download(corruptedSnapshot, "旅声原始存储备份.json", "application/json");
      toast("原始存储已备份，请用有效工作空间恢复");
      return;
    }
    download(
      JSON.stringify(
        {
          ...bundle,
          workspaceBackup: true,
          workflow: saved.workflow,
          actions: saved.actions,
          exportedAt: Date.now(),
        },
        null,
        2,
      ),
      "旅声工作空间备份.json",
      "application/json",
    );
    toast("已备份反馈、处置及整改记录");
  });
  $("templateBtn").addEventListener("click", template);
  $("csvBtn").addEventListener("click", exportCsv);
  $("briefBtn").addEventListener("click", () => {
    $("briefText").value = makeBrief();
    $("briefDialog").showModal();
  });
  $("briefDownload").addEventListener("click", () =>
    download(
      $("briefText").value,
      (demoMode ? "模拟_" : "") + property().name + "_舆情简报.txt",
    ),
  );
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
      toast("监测对象已保存");
    } catch (e) {
      toast(e.message, true);
    }
  });
  $("addActionBtn").addEventListener("click", () => openAction());
  $("actionForm").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const f = Object.fromEntries(new FormData(e.target)),
        old = saved.actions.find((a) => a.id === editingActionId),
        now = Date.now();
      const a = W.normalizeAction(
        {
          ...f,
          id: editingActionId || "action-" + C.hash(f.title + now),
          propertyId: property().id,
          createdAt: old?.createdAt || now,
          updatedAt: now,
        },
        bundle.properties,
      );
      persist({
        ...saved,
        actions: [...saved.actions.filter((old) => old.id !== a.id), a],
      });
      rebuild();
      render();
      $("actionDialog").close();
      toast("整改记录已保存");
    } catch (e) {
      toast(e.message, true);
    }
  });
  $("fullscreenBoard").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $("monitorBoard").requestFullscreen();
    } catch {
      toast("当前浏览器不支持全屏，可使用窗口放大查看");
    }
  });
  const resizeChart = () => {
    if (monitorChart && $("monitorChart").clientWidth) monitorChart.resize();
  };
  window.addEventListener("resize", () => {
    if (state.view === "overview") renderMonitor(rangeRecords());
  });
  if (window.ResizeObserver)
    new ResizeObserver(resizeChart).observe($("monitorChart"));
  document.addEventListener("fullscreenchange", () => {
    $("fullscreenBoard").innerHTML = icon(
      document.fullscreenElement ? "minimize-2" : "maximize-2",
    );
    $("fullscreenBoard").title = document.fullscreenElement
      ? "退出大盘全屏"
      : "大盘全屏";
    $("fullscreenBoard").setAttribute("aria-label", $("fullscreenBoard").title);
    icons();
    requestAnimationFrame(() => {
      if (state.view === "overview") renderMonitor(rangeRecords());
      else resizeChart();
    });
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
  render();
  setInterval(() => {
    if (![...document.querySelectorAll("dialog")].some((d) => d.open)) render();
  }, 60000);
})();
