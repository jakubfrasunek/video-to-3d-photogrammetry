const QUALITY_IDS = [
  { id: "preview", label: "Preview", hint: "q_preview" },
  { id: "small", label: "Small", hint: "q_small" },
  { id: "medium", label: "Medium", hint: "q_medium" },
  { id: "full", label: "Full", hint: "q_full" },
  { id: "profi", label: "Profi", hint: "q_profi" },
];

const state = {
  projectId: null,
  batch: [],
  batchIndex: 0,
  analysis: null,
  quality: "medium",
  photoCount: 80,
  events: null,
  timer: null,
  startedAt: 0,
  maxImages: null,
  lastEvent: null,
  lastErrorKey: null,
  estimate: {
    base_reconstruct_sec: 180,
    photo_ref: 80,
    photo_exp: 1.35,
    quality_weight: {
      preview: 0.22,
      small: 0.42,
      medium: 1,
      full: 2.6,
      profi: 6.5,
    },
    machine_factor: 1,
  },
};

const etaClock = {
  remaining: null,
  at: 0,
};

const $ = (id) => document.getElementById(id);

function show(id) {
  for (const section of document.querySelectorAll(".panel")) {
    section.classList.toggle("hidden", section.id !== id);
  }
}

function fmtBytes(n) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = n;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m ? `${m}m ${String(rem).padStart(2, "0")}s` : `${rem}s`;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function estimateSeconds(quality, photos) {
  const a = state.analysis || {};
  const cfg = state.estimate;
  const weight = cfg.quality_weight[quality] || 1;
  const area = Math.max(1, (a.width || 1920) * (a.height || 1080));
  const px = clamp(area / (1920 * 1080), 0.7, 2.2);
  const count = Math.max(2, photos);
  const extract = 2 + count * 0.05;
  const reconstruct =
    cfg.base_reconstruct_sec *
    weight *
    (count / cfg.photo_ref) ** cfg.photo_exp *
    cfg.machine_factor *
    px;
  return extract + reconstruct + 6 + weight * 8;
}

function formatEta(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 40) return t("eta_under_minute");
  if (s < 90) return t("eta_about_1min");
  return t("eta_about_min", { n: Math.round(s / 60) });
}

function setEtaSeconds(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return;
  const next = Number(sec);
  const now = Date.now();
  if (etaClock.remaining == null) {
    etaClock.remaining = next;
  } else {
    const current = Math.max(0, etaClock.remaining - (now - etaClock.at) / 1000);
    const blended = current * 0.72 + next * 0.28;
    etaClock.remaining = clamp(blended, current * 0.6, current * 1.4);
  }
  etaClock.at = now;
}

function remainingEta() {
  if (etaClock.remaining == null) return null;
  return Math.max(0, etaClock.remaining - (Date.now() - etaClock.at) / 1000);
}

function resetEta() {
  etaClock.remaining = null;
  etaClock.at = 0;
}

function apiError(data, status) {
  if (data.error_key) return t(data.error_key, data.error_args);
  return data.error || `HTTP ${status}`;
}

async function api(path, options = {}) {
  const headers = { "Accept-Language": lang, ...(options.headers || {}) };
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(apiError(data, res.status));
    err.key = data.error_key || null;
    throw err;
  }
  return data;
}

async function createProject() {
  const job = await api("/api/projects", { method: "POST" });
  state.projectId = job.id;
  return job.id;
}

function modelCountLabel(n) {
  const locale = langMeta(lang).locale || lang;
  const rule = new Intl.PluralRules(locale).select(n);
  const key = rule === "one" ? "model_one" : rule === "few" ? "model_few" : "model_many";
  return t(key, { n });
}

function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString(langMeta(lang).locale || lang, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function loadLibrary() {
  const data = await api("/api/projects");
  const projects = data.projects || [];
  $("library-empty").classList.toggle("hidden", projects.length > 0);
  if (!projects.length) $("library-empty").textContent = t("library_empty");
  $("project-list").innerHTML = projects
    .map(
      (p) => `
    <article class="project-card" data-id="${p.id}">
      <div class="project-thumb${p.poster ? "" : " is-empty"}">
        ${p.poster ? `<img src="/api/projects/${p.id}/poster" alt="">` : ""}
      </div>
      <div class="project-meta">
        <strong>${p.name || p.filename || p.id}</strong>
        <span>${p.status === "processing" ? t("in_progress") : modelCountLabel(p.model_count || 0)} · ${fmtDate(p.created_at)}</span>
      </div>
      <div class="row-actions">
        <button type="button" class="btn primary" data-open-project="${p.id}">${p.status === "processing" ? t("watch") : t("open")}</button>
        ${p.status === "processing" ? "" : `<button type="button" class="btn" data-delete-project="${p.id}">${t("delete")}</button>`}
      </div>
    </article>`
    )
    .join("");
  return projects;
}

async function goHome() {
  if (state.events) {
    state.events.close();
    state.events = null;
  }
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (window.ObjectCaptureViewer) window.ObjectCaptureViewer.disposeAll();
  setViewerFullscreen(null, false);
  $("compare").innerHTML = "";
  state.projectId = null;
  state.batch = [];
  state.batchIndex = 0;
  state.analysis = null;
  if ($("video-batch")) $("video-batch").textContent = "";
  if ($("start")) $("start").textContent = t("create_model");
  state.quality = "medium";
  setStatus("");
  show("stage-home");
  try {
    await loadLibrary();
  } catch (err) {
    $("library-empty").classList.remove("hidden");
    $("library-empty").textContent = err.message;
  }
}

function setStatus(text) {
  $("drop-status").textContent = text;
}

function qualityLabel(id) {
  return QUALITY_IDS.find((item) => item.id === id)?.label || id;
}

function renderQualityButtons(el) {
  if (!el) return;
  el.innerHTML = QUALITY_IDS.map(
    (q) => `
    <button type="button" class="quality${q.id === state.quality ? " is-on" : ""}" data-q="${q.id}">
      <strong>${q.label}</strong>
      <span>${t(q.hint)}</span>
    </button>`
  ).join("");
}

function photoPills(max) {
  const steps = [20, 40, 80, 120, 160, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000];
  const values = steps.filter((n) => n < max);
  if (max >= 2) values.push(max);
  return values;
}

function renderPills(el) {
  if (!el) return;
  const max = sliderMax();
  el.innerHTML = photoPills(max)
    .map(
      (n) => `<button type="button" data-n="${n}" class="${n === state.photoCount ? "is-on" : ""}">${n}</button>`
    )
    .join("");
}

function sliderMax() {
  const frames = Number(state.analysis?.frame_count || 0);
  if (state.maxImages) {
    return Math.max(2, frames ? Math.min(frames, state.maxImages) : state.maxImages);
  }
  return Math.max(2, frames || 2);
}

function applyHardwareLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 2) return;
  state.maxImages = n;
  syncPhotoSlider();
}

function hardwareLimitHtml() {
  if (!state.maxImages) {
    return `<strong>${t("hw_loading_title")}</strong><span>${t("hw_loading_body")}</span>`;
  }
  const frames = Number(state.analysis?.frame_count || 0);
  const extra =
    frames > state.maxImages
      ? t("hw_limit_extra", { frames, n: state.maxImages })
      : "";
  return `<strong>${t("hw_limit_title", { n: state.maxImages })}</strong><span>${t("hw_limit_body")}${extra}</span>`;
}

function syncPhotoSlider() {
  if (!state.analysis) {
    for (const id of ["photo-limit", "again-limit"]) {
      if ($(id)) $(id).innerHTML = hardwareLimitHtml();
    }
    return;
  }
  const max = sliderMax();
  const min = Math.min(20, max);
  for (const id of ["photo-range", "again-range"]) {
    if ($(id)) {
      $(id).min = String(min);
      $(id).max = String(max);
    }
  }
  state.photoCount = Math.min(Math.max(state.photoCount || min, min), max);
  updatePhotoHelp();
}

function updatePhotoHelp() {
  const a = state.analysis;
  if (!a) return;
  const count = state.photoCount;
  const every = a.frame_count ? (a.frame_count / count).toFixed(1) : "—";
  const interval = a.duration_sec ? (a.duration_sec / count).toFixed(2) : "—";
  const text =
    state.batch.length > 1
      ? t("photos_help_batch", { n: state.batch.length })
      : t("photos_help_single", { frames: a.frame_count, every, interval });
  for (const id of ["photo-help", "again-help"]) {
    if ($(id)) $(id).textContent = text;
  }
  for (const id of ["photo-count-label", "again-count-label"]) {
    if ($(id)) $(id).textContent = String(count);
  }
  for (const id of ["photo-range", "again-range"]) {
    if ($(id)) $(id).value = String(count);
  }
  for (const id of ["photo-limit", "again-limit"]) {
    if ($(id)) $(id).innerHTML = hardwareLimitHtml();
  }
  renderPills($("photo-pills"));
  renderPills($("again-pills"));
  renderQualityButtons($("qualities"));
  renderQualityButtons($("again-qualities"));
}

function applyImported(projects) {
  const items = (projects || []).filter((item) => item?.analysis);
  if (!items.length) throw new Error(t("no_videos_prepared"));
  state.batch = items;
  state.batchIndex = 0;
  state.projectId = items[0].id;
  if (items[0].max_images) applyHardwareLimit(items[0].max_images);
  const frames = Math.min(...items.map((item) => Number(item.analysis.frame_count || 0)));
  const suggested = Math.round(
    items.reduce((sum, item) => sum + (item.analysis.suggested_photos || 80), 0) / items.length
  );
  state.analysis = {
    ...items[0].analysis,
    filename: items.length === 1 ? items[0].analysis.filename : t("n_videos", { n: items.length }),
    frame_count: frames,
    suggested_photos: suggested,
  };
  const max = sliderMax();
  const min = Math.min(20, max);
  state.photoCount = Math.min(Math.max(suggested || 80, min), max);
  $("video-name").textContent = state.analysis.filename;
  $("video-batch").textContent =
    items.length > 1 ? items.map((item) => item.analysis.filename).join(" · ") : "";
  $("start").textContent = items.length > 1 ? t("create_n_models", { n: items.length }) : t("create_model");
  syncPhotoSlider();
  show("stage-settings");
}

function applyAnalysis(job) {
  applyImported([job]);
}

function fail(err) {
  const key = err?.key || (isI18nKey(err?.message) ? err.message : null);
  state.lastErrorKey = key;
  $("error-text").textContent = key ? t(key) : err.message || String(err);
  show("stage-error");
}

function startTimer(startedAt) {
  state.startedAt = startedAt ? startedAt * 1000 : Date.now();
  if (state.timer) clearInterval(state.timer);
  state.timer = setInterval(() => {
    const left = remainingEta();
    const extra = left != null ? ` · ${t("remaining", { eta: formatEta(left) })}` : "";
    $("progress-time").textContent = `${fmtClock(Date.now() - state.startedAt)}${extra}`;
  }, 250);
}

function batchPrefix() {
  if (state.batch.length < 2) return "";
  return `${t("video_of", { n: state.batchIndex, total: state.batch.length })} · `;
}

function eventStatus(event) {
  if (!event) return "";
  if (event.status_key) return t(event.status_key, event.status_args);
  if (isI18nKey(event.status)) {
    return t(event.status, event.status_args);
  }
  return event.status || "";
}

function setProgress(event) {
  state.lastEvent = event;
  if (event.stage === "extract") {
    $("progress-step").textContent = `${batchPrefix()}${t("step_of", { n: 1 })}`;
    $("progress-title").textContent = t("photos_from_video");
  }
  if (event.stage === "reconstruct" || event.stage === "preview") {
    $("progress-step").textContent = `${batchPrefix()}${t("step_of", { n: 2 })}`;
    $("progress-title").textContent = t("model_3d");
  }
  const status = eventStatus(event);
  if (status) $("progress-status").textContent = status;
  if (typeof event.percent === "number") {
    $("bar").style.width = `${event.percent}%`;
    $("progress-percent").textContent = `${event.percent} %`;
  }
  if (event.eta_sec != null) setEtaSeconds(event.eta_sec);
}

function listen() {
  return new Promise((resolve, reject) => {
    if (state.events) state.events.close();
    state.events = new EventSource(`/api/projects/${state.projectId}/events`);
    state.events.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      setProgress(event);
      if (event.type === "done" || event.type === "cancelled") {
        state.events.close();
        state.events = null;
        resolve(event);
      }
      if (event.type === "error") {
        state.events.close();
        state.events = null;
        const err = new Error(eventStatus(event) || event.message);
        err.key = event.status_key || null;
        reject(err);
      }
    };
    state.events.onerror = () => {};
  });
}

async function finish(event) {
  if (state.events) {
    state.events.close();
    state.events = null;
  }
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  const job = await api(`/api/projects/${state.projectId}`);
  const variants = job.variants || [];
  const latest = variants[variants.length - 1];
  $("done-title").textContent = variants.length > 1 ? t("compare_models") : t("model_ready");
  $("done-meta").textContent = eventStatus(event) || t("done");
  if (latest) {
    state.quality = latest.quality || state.quality;
    state.photoCount = latest.photo_count || state.photoCount;
    $("again-current").textContent = t("last_model", {
      quality: qualityLabel(latest.quality),
      n: latest.photo_count,
    });
  }
  updatePhotoHelp();
  show("stage-done");
  state.viewJob = job;
  await renderCompare(job);
}

async function renderCompare(job) {
  const variants = job.variants || [];
  const root = $("compare");
  if (window.ObjectCaptureViewer) window.ObjectCaptureViewer.disposeAll();
  root.classList.toggle("is-many", variants.length > 1);
  root.innerHTML = variants
    .map(
      (v) => `
    <article class="variant" data-id="${v.id}">
      <div class="variant-head">
        <div>
          <strong>${qualityLabel(v.quality)}</strong>
          <span>${t("photos_count", { n: v.photo_count })} · ${fmtBytes(v.model_bytes)}</span>
        </div>
        <div class="variant-actions">
          <button type="button" class="btn" data-open="${v.id}">${t("preview")}</button>
          <a class="btn" href="/api/projects/${state.projectId}/models/${v.id}/download">USDZ</a>
          <button type="button" class="btn" data-delete-model="${v.id}">${t("delete")}</button>
        </div>
      </div>
      <div class="viewer-wrap">
        <div class="viewer-toolbar">
          <div class="viewer-tools">
            <button type="button" class="seg is-on" data-tex="1">${t("texture")}</button>
            <button type="button" class="seg" data-tex="0">${t("geometry")}</button>
            <label class="light-ctrl">${t("light")}
              <input type="range" min="0.2" max="2.4" step="0.05" value="1" data-light>
            </label>
          </div>
          <button type="button" class="seg fs-btn" data-fs>${t("fullscreen")}</button>
        </div>
        <div class="viewer" id="viewer-${v.id}"></div>
      </div>
    </article>`
    )
    .join("");

  for (const variant of variants) {
    const el = $(`viewer-${variant.id}`);
    if (!el || !variant.preview_ready || !window.ObjectCaptureViewer) continue;
    try {
      await window.ObjectCaptureViewer.show(
        el,
        `/api/projects/${state.projectId}/models/${variant.id}/preview/`
      );
    } catch {
      el.textContent = t("preview_failed");
    }
  }
}

async function pickOnMac() {
  $("pick-mac").disabled = true;
  setStatus(t("pick_dialog"));
  try {
    const data = await api("/api/projects/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picker_prompt: t("pick_prompt") }),
    });
    applyImported(data.projects || []);
  } catch (err) {
    setStatus(err.message);
  } finally {
    $("pick-mac").disabled = false;
  }
}

function uploadFile(file) {
  return createProject().then(
    (id) =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", `/api/projects/${id}/video`);
        xhr.setRequestHeader("X-Filename", file.name);
        xhr.setRequestHeader("Accept-Language", lang);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          setStatus(t("uploading", { name: file.name, pct: Math.round((e.loaded / e.total) * 100) }));
        };
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300) resolve(data.id || id);
            else reject(new Error(apiError(data, xhr.status) || t("upload_failed")));
          } catch {
            reject(new Error(t("upload_failed")));
          }
        };
        xhr.onerror = () => reject(new Error(t("upload_failed")));
        xhr.send(file);
      })
  );
}

async function handleFiles(files) {
  const videos = [...files].filter(isVideoFile);
  if (!videos.length) {
    show("stage-drop");
    setStatus(t("drop_videos"));
    return;
  }
  show("stage-drop");
  const projects = [];
  try {
    for (const [index, file] of videos.entries()) {
      setStatus(t("copying", { n: index + 1, total: videos.length, name: file.name }));
      const id = await uploadFile(file);
      setStatus(t("preparing_file", { name: file.name }));
      projects.push(await api(`/api/projects/${id}/analyze`, { method: "POST" }));
    }
    applyImported(projects);
  } catch (err) {
    setStatus(err.message);
  }
}

async function startOne(projectId) {
  state.projectId = projectId;
  const started = await api(`/api/projects/${projectId}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quality: state.quality,
      photo_count: state.photoCount,
    }),
  });
  $("progress-percent").textContent = "0 %";
  $("bar").style.width = "0%";
  resetEta();
  setEtaSeconds(started.estimate?.total_sec || estimateSeconds(state.quality, state.photoCount));
  startTimer();
  $("cancel-run").disabled = false;
  return listen();
}

async function afterStop(id) {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  const job = await api(`/api/projects/${id}`);
  if (job.variants?.length) {
    state.projectId = id;
    await finish({ status_key: "generation_stopped" });
    return;
  }
  await goHome();
}

async function resumeProgress(job) {
  state.projectId = job.id;
  state.batch = [];
  state.analysis = job.analysis;
  if (job.max_images) applyHardwareLimit(job.max_images);
  show("stage-progress");
  $("progress-status").textContent = t("continuing");
  $("cancel-run").disabled = false;
  resetEta();
  startTimer(job.started_at);
  try {
    const event = await listen();
    if (event.type === "cancelled") {
      await afterStop(job.id);
      return;
    }
    await finish(event);
  } catch (err) {
    fail(err);
  }
}

async function startProcess() {
  $("start").disabled = true;
  $("again").disabled = true;
  $("cancel-run").disabled = false;
  const queue = state.batch.length ? state.batch : [{ id: state.projectId, analysis: state.analysis }];
  setViewerFullscreen(null, false);
  show("stage-progress");
  $("progress-status").textContent = t("starting");
  try {
    let lastEvent = null;
    for (const [index, item] of queue.entries()) {
      state.batchIndex = index + 1;
      const name = item.analysis?.filename || item.name || "video";
      $("progress-step").textContent =
        queue.length > 1 ? t("video_of", { n: index + 1, total: queue.length }) : t("step_of", { n: 1 });
      $("progress-title").textContent = name;
      lastEvent = await startOne(item.id);
      if (lastEvent?.type === "cancelled") {
        await afterStop(item.id);
        return;
      }
    }
    if (queue.length > 1) {
      await goHome();
      return;
    }
    await finish(lastEvent);
  } catch (err) {
    fail(err);
  } finally {
    $("start").disabled = false;
    $("again").disabled = false;
  }
}

function onQualityClick(e) {
  const btn = e.target.closest("[data-q]");
  if (!btn) return;
  state.quality = btn.dataset.q;
  updatePhotoHelp();
}

function onPhotoInput(e) {
  state.photoCount = Number(e.target.value);
  updatePhotoHelp();
}

function onPillClick(e) {
  const btn = e.target.closest("[data-n]");
  if (!btn) return;
  state.photoCount = Number(btn.dataset.n);
  updatePhotoHelp();
}

$("qualities").addEventListener("click", onQualityClick);
$("again-qualities").addEventListener("click", onQualityClick);
$("photo-range").addEventListener("input", onPhotoInput);
$("again-range").addEventListener("input", onPhotoInput);
$("photo-pills").addEventListener("click", onPillClick);
$("again-pills").addEventListener("click", onPillClick);

$("pick-mac").addEventListener("click", pickOnMac);
$("start").addEventListener("click", startProcess);
$("again").addEventListener("click", startProcess);
$("cancel-run").addEventListener("click", async () => {
  if (!state.projectId) return;
  $("cancel-run").disabled = true;
  try {
    await api(`/api/projects/${state.projectId}/cancel`, { method: "POST" });
  } catch (err) {
    $("cancel-run").disabled = false;
    fail(err);
  }
});
$("reset-1").addEventListener("click", goHome);
$("reset-2").addEventListener("click", goHome);
$("reset-3").addEventListener("click", goHome);
$("cancel-new").addEventListener("click", goHome);
$("brand").addEventListener("click", () => goHome());
$("new-project").addEventListener("click", () => {
  setStatus("");
  show("stage-drop");
});
$("reveal-library").addEventListener("click", () => {
  api("/api/library/reveal", { method: "POST" }).catch(fail);
});
$("reveal").addEventListener("click", () => {
  api(`/api/projects/${state.projectId}/reveal`, { method: "POST" }).catch(fail);
});
$("delete-project").addEventListener("click", () => {
  if (state.projectId) removeProject(state.projectId);
});

$("project-list").addEventListener("click", (e) => {
  const del = e.target.closest("[data-delete-project]");
  if (del) {
    removeProject(del.dataset.deleteProject).catch(fail);
    return;
  }
  const card = e.target.closest(".project-card");
  if (card?.dataset.id) openProject(card.dataset.id).catch(fail);
});

async function openProject(id) {
  state.batch = [];
  state.batchIndex = 0;
  let job = await api(`/api/projects/${id}`);
  if (!job.analysis) {
    job = await api(`/api/projects/${id}/analyze`, { method: "POST" });
  }
  state.projectId = job.id;
  state.analysis = job.analysis;
  if (job.max_images) applyHardwareLimit(job.max_images);
  if (job.status === "processing") {
    await resumeProgress(job);
    return;
  }
  $("video-name").textContent = job.analysis?.filename || job.name || id;
  if (job.variants?.length) {
    const latest = job.variants[job.variants.length - 1];
    state.quality = latest.quality || state.quality;
    state.photoCount = latest.photo_count || state.photoCount;
    $("done-title").textContent = job.variants.length > 1 ? t("compare_models") : t("model_ready");
    $("done-meta").textContent = job.name || t("library");
    $("again-current").textContent = t("last_model", {
      quality: qualityLabel(latest.quality),
      n: latest.photo_count,
    });
    syncPhotoSlider();
    show("stage-done");
    state.viewJob = job;
    await renderCompare(job);
    return;
  }
  applyAnalysis(job);
}

async function removeProject(id) {
  if (!window.confirm(t("confirm_delete_project"))) return;
  await api(`/api/projects/${id}`, { method: "DELETE" });
  await goHome();
}

async function removeModel(id) {
  if (!window.confirm(t("confirm_delete_model"))) return;
  const job = await api(`/api/projects/${state.projectId}/models/${id}`, { method: "DELETE" });
  if (job.variants?.length) {
    const latest = job.variants[job.variants.length - 1];
    state.quality = latest.quality || state.quality;
    state.photoCount = latest.photo_count || state.photoCount;
    $("done-title").textContent = job.variants.length > 1 ? t("compare_models") : t("model_ready");
    $("again-current").textContent = t("last_model", {
      quality: qualityLabel(latest.quality),
      n: latest.photo_count,
    });
    updatePhotoHelp();
    await renderCompare(job);
    return;
  }
  applyAnalysis(job);
}

function setViewerFullscreen(wrap, on) {
  for (const el of document.querySelectorAll(".viewer-wrap")) {
    el.classList.remove("is-fs");
    const btn = el.querySelector("[data-fs]");
    if (btn) {
      btn.textContent = t("fullscreen");
      btn.classList.remove("is-on");
    }
  }
  document.body.classList.toggle("is-viewer-fs", Boolean(on && wrap));
  if (on && wrap) {
    wrap.classList.add("is-fs");
    const btn = wrap.querySelector("[data-fs]");
    if (btn) {
      btn.textContent = t("exit_fullscreen");
      btn.classList.add("is-on");
    }
  }
}

$("compare").addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) {
    api(`/api/projects/${state.projectId}/models/${open.dataset.open}/open`, { method: "POST" }).catch(fail);
    return;
  }
  const delModel = e.target.closest("[data-delete-model]");
  if (delModel) {
    removeModel(delModel.dataset.deleteModel).catch(fail);
    return;
  }
  const fs = e.target.closest("[data-fs]");
  if (fs) {
    const wrap = fs.closest(".viewer-wrap");
    setViewerFullscreen(wrap, !wrap?.classList.contains("is-fs"));
    return;
  }
  const tex = e.target.closest("[data-tex]");
  if (!tex) return;
  const card = tex.closest(".variant");
  const viewer = card?.querySelector(".viewer");
  if (!viewer || !window.ObjectCaptureViewer) return;
  const on = tex.dataset.tex === "1";
  window.ObjectCaptureViewer.setTextured(viewer, on);
  for (const btn of card.querySelectorAll("[data-tex]")) {
    btn.classList.toggle("is-on", btn.dataset.tex === tex.dataset.tex);
  }
});

$("compare").addEventListener("input", (e) => {
  if (!e.target.matches("[data-light]")) return;
  const viewer = e.target.closest(".variant")?.querySelector(".viewer");
  if (viewer && window.ObjectCaptureViewer) window.ObjectCaptureViewer.setLight(viewer, e.target.value);
});

function isVideoFile(file) {
  if (!file) return false;
  if (file.type.startsWith("video/")) return true;
  return /\.(mov|mp4|m4v|avi|mkv|webm)$/i.test(file.name);
}

function hasFiles(event) {
  return Boolean(event.dataTransfer?.types && [...event.dataTransfer.types].includes("Files"));
}

function isProcessing() {
  return !$("stage-progress").classList.contains("hidden");
}

let dragDepth = 0;

function setDragging(on) {
  document.body.classList.toggle("is-dragging", on);
  $("drop").classList.toggle("is-over", on);
}

window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth += 1;
  setDragging(true);
});

window.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});

window.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) setDragging(false);
});

window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  setDragging(false);
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  if (isProcessing()) {
    setStatus(t("wait_processing"));
    return;
  }
  handleFiles(files);
});

function applyLang() {
  applyStaticLang();
  const health = $("health");
  if (health && !health.classList.contains("hidden")) health.textContent = t("missing_ffmpeg");
  for (const id of ["photo-limit", "again-limit"]) {
    if ($(id)) $(id).innerHTML = hardwareLimitHtml();
  }
  if (state.analysis) {
    if (state.batch.length > 1) {
      $("video-name").textContent = t("n_videos", { n: state.batch.length });
      $("start").textContent = t("create_n_models", { n: state.batch.length });
    } else if ($("start") && !$("stage-settings").classList.contains("hidden")) {
      $("start").textContent = t("create_model");
    }
    updatePhotoHelp();
  }
  if (!$("stage-home").classList.contains("hidden")) {
    loadLibrary().catch(() => {});
  }
  if (!$("stage-progress").classList.contains("hidden") && state.lastEvent) {
    setProgress(state.lastEvent);
  }
  if (!$("stage-done").classList.contains("hidden") && state.viewJob) {
    const variants = state.viewJob.variants || [];
    $("done-title").textContent = variants.length > 1 ? t("compare_models") : t("model_ready");
    if (state.lastEvent) $("done-meta").textContent = eventStatus(state.lastEvent) || t("done");
    const latest = variants[variants.length - 1];
    if (latest) {
      $("again-current").textContent = t("last_model", {
        quality: qualityLabel(latest.quality),
        n: latest.photo_count,
      });
    }
    renderCompare(state.viewJob);
  }
  if (!$("stage-error").classList.contains("hidden") && state.lastErrorKey) {
    $("error-text").textContent = t(state.lastErrorKey);
  }
}

applyStaticLang();

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!document.body.classList.contains("is-viewer-fs")) return;
  e.preventDefault();
  setViewerFullscreen(null, false);
});

fetch("/api/health")
  .then((r) => r.json())
  .then((h) => {
    const el = $("health");
    if (!h.ffmpeg) {
      el.textContent = t("missing_ffmpeg");
      el.classList.add("bad");
      el.classList.remove("hidden");
    }
    if (h.max_images) applyHardwareLimit(h.max_images);
    if (h.quality_weight) {
      state.estimate = {
        base_reconstruct_sec: h.base_reconstruct_sec || state.estimate.base_reconstruct_sec,
        photo_ref: h.photo_ref || state.estimate.photo_ref,
        photo_exp: h.photo_exp || state.estimate.photo_exp,
        quality_weight: h.quality_weight,
        machine_factor: h.machine_factor || 1,
      };
    }
    if (state.analysis) syncPhotoSlider();
    loadLibrary()
      .then(async (projects) => {
        const running = (projects || []).find((p) => p.status === "processing");
        if (!running) return;
        const job = await api(`/api/projects/${running.id}`);
        await resumeProgress(job);
      })
      .catch(() => {});
  })
  .catch(() => {
    loadLibrary().catch(() => {});
  });
