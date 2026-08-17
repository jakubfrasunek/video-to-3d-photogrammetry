// Add a language: copy a block, fill the same keys, and set $.name / $.locale / $.order / $.flag.
const I18N = {
  cs: {
    $: {
      name: "Čeština",
      locale: "cs-CZ",
      order: 2,
      flag: '<svg viewBox="0 0 60 40" aria-hidden="true"><rect width="60" height="40" fill="#fff"/><rect y="20" width="60" height="20" fill="#D7141A"/><path d="M0 0 L30 20 L0 40 Z" fill="#11457E"/></svg>',
    },
    library: "Knihovna",
    models: "Modely",
    open_folder: "Otevřít složku",
    new_model: "Nový model",
    library_empty: "Zatím tu nic není. Vytvoř nový model z videa.",
    pick_videos: "Vyber videa",
    drop_title: "Videa do knihovny",
    drop_sub: "Vyber jedno nebo víc videí, nebo je sem přetáhni. MOV, MP4, M4V.",
    pick_videos_btn: "Vybrat videa",
    video: "Video",
    quality_title: "Kvalita modelu",
    quality_sub: "Od rychlého náhledu po maximální detail",
    photos_title: "Počet fotek",
    photos_help: "Rovnoměrný výběr z celého videa",
    create_model: "Vytvořit 3D model",
    create_n_models: "Vytvořit {n} modelů",
    n_videos: "{n} videí",
    preparing: "Připravuji",
    starting: "Začínám",
    continuing: "Pokračuji",
    stop: "Zastavit",
    done: "Hotovo",
    compare_models: "Porovnání modelů",
    model_ready: "Model je připravený",
    better_quality: "Potřebujete lepší kvalitu?",
    generate_another: "Vygenerovat další model",
    show_in_finder: "Zobrazit ve Finderu",
    delete_project: "Smazat projekt",
    failed_label: "Nepodařilo se dokončit",
    failed_title: "Zpracování selhalo",
    back_to_library: "Zpět do knihovny",
    drop_overlay: "Pusť videa sem",
    drop_overlay_sub: "Jedno nebo víc souborů · MOV, MP4, M4V",
    q_preview: "rychlý náhled",
    q_small: "web a mobil",
    q_medium: "doporučeno",
    q_full: "vysoký detail",
    q_profi: "maximální kvalita",
    model_one: "1 model",
    model_few: "{n} modely",
    model_many: "{n} modelů",
    in_progress: "Probíhá",
    watch: "Sledovat",
    open: "Otevřít",
    delete: "Smazat",
    missing_ffmpeg: "Chybí ffmpeg",
    eta_under_minute: "méně než minuta",
    eta_about_1min: "asi 1 min",
    eta_about_min: "asi {n} min",
    remaining: "zbývá {eta}",
    step_of: "Krok {n} ze 2",
    video_of: "Video {n} z {total}",
    photos_from_video: "Fotky z videa",
    model_3d: "3D model",
    last_model: "Poslední model: {quality} · {n} fotek",
    photos_count: "{n} fotek",
    texture: "Textura",
    geometry: "Geometrie",
    light: "Světlo",
    fullscreen: "Celá obrazovka",
    exit_fullscreen: "Zmenšit",
    preview: "Preview",
    preview_failed: "Náhled se nepodařilo načíst.",
    pick_prompt: "Vyber jedno nebo více videí",
    pick_dialog: "Otevři dialog výběru. Můžeš označit víc videí. Když ho nevidíš, podívej se za okno prohlížeče.",
    uploading: "Nahrávám {name}… {pct}%",
    copying: "Kopíruji {n} z {total}: {name}",
    preparing_file: "Připravuji {name}…",
    upload_failed: "Nahrání selhalo.",
    drop_videos: "Přetáhni video soubory, například MOV nebo MP4.",
    wait_processing: "Počkej, až doběhne aktuální zpracování.",
    photos_help_batch: "Stejné nastavení pro {n} videí. U kratších se počet fotek sníží.",
    photos_help_single: "Rovnoměrně z {frames} snímků · každý {every}. · interval {interval} s",
    hw_loading_title: "Zjišťuji limit tohoto Macu…",
    hw_loading_body: "Apple Object Capture ho čte z hardwaru. Není to strop programu.",
    hw_limit_title: "Maximum tohoto Macu: {n} fotek",
    hw_limit_body: "To je strop Apple Object Capture na tomhle hardwaru, ne limit programu.",
    hw_limit_extra: " Video má {frames} snímků, ale tenhle Mac jich do jednoho běhu víc než {n} nevezme.",
    no_videos_prepared: "Nepodařilo se připravit žádné video.",
    confirm_delete_project: "Smazat celý projekt včetně zkopírovaného videa a modelů?",
    confirm_delete_model: "Smazat tenhle 3D model? Video a ostatní modely zůstanou.",
    generation_stopped: "Generování zastaveno.",
    support_text: "Pokud ti to pomohlo, můžeš projekt podpořit.",
    extracting_frames: "Vytahuji fotky z videa",
    estimate_total: "Odhad celkem {duration}",
    starting_object_capture: "Spouštím Object Capture",
    preparing_object_capture: "Připravuji Object Capture. První spuštění může trvat déle.",
    preparing_preview: "Připravuji náhled v prohlížeči",
    done_in: "Hotovo za {elapsed}",
    cancelled: "Generování zastaveno.",
    photos_loaded: "Fotky jsou načtené",
    downsampling: "Upravuji velikost dat",
    skip_bad_frame: "Přeskakuji nepoužitelný snímek",
    skip_frame: "Přeskakuji snímek",
    saving_model: "Ukládám model",
    finishing_export: "Dokončuji export",
    stitching_incomplete: "Doplňuji chybějící části modelu",
    preprocessing: "Připravuji snímky",
    imagealignment: "Slaďuji fotky",
    pointcloudgeneration: "Počítám mračna bodů",
    meshgeneration: "Skládám síť",
    texturemapping: "Mapuji texturu",
    optimization: "Doladňuji model",
    no_video_track: "Ve videu není video stopa.",
    duration_unreadable: "Nepodařilo se přečíst stopáž videa.",
    extract_failed: "Nepodařilo se vytáhnout snímky z videa.",
    no_frames: "Z videa se nepodařilo vytáhnout žádné fotky.",
    reconstruct_failed: "Object Capture skončil s chybou.",
    usdz_missing: "Rekonstrukce doběhla, ale USDZ soubor nevznikl.",
    file_pick_cancelled: "Výběr souboru byl zrušen.",
    no_video_selected: "Nebylo vybrané žádné video.",
    server_restarted: "Zpracování se přerušilo, protože se server restartoval.",
    project_busy: "Projekt právě běží, nejdřív ho nech doběhnout.",
    model_missing: "Model neexistuje.",
    pick_analyze_first: "Nejdřív vyber a zanalyzuj video.",
    project_missing: "Projekt neexistuje.",
    forbidden_path: "Nepovolená cesta.",
    poster_missing: "Náhled videa není k dispozici.",
    model_not_ready: "Model ještě není hotový.",
    preview_not_ready: "Náhled ještě není připravený.",
    preview_file_missing: "Soubor náhledu neexistuje.",
    not_found: "Nenalezeno.",
    video_not_selected: "Video ještě není vybrané.",
    missing_content_length: "Chybí Content-Length.",
    nothing_running: "Teď se nic negeneruje.",
    already_processing: "Tenhle model se právě zpracovává.",
    wait_current: "Nejdřív nech doběhnout aktuální generování.",
    invalid_json: "Neplatný JSON.",
    unknown_quality: "Neznámá kvalita.",
    invalid_photo_count: "Neplatný počet fotek.",
    analyze_first: "Nejdřív zanalyzuj video.",
    path_missing: "Soubor nebo složka ještě neexistuje.",
    file_missing: "Soubor neexistuje.",
  },
  en: {
    $: {
      name: "English",
      locale: "en-GB",
      order: 1,
      flag: '<svg viewBox="0 0 60 40" aria-hidden="true"><rect width="60" height="40" fill="#012169"/><path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" stroke-width="4"/><path d="M30 0 V40 M0 20 H60" stroke="#fff" stroke-width="14"/><path d="M30 0 V40 M0 20 H60" stroke="#C8102E" stroke-width="8"/></svg>',
    },
    library: "Library",
    models: "Models",
    open_folder: "Open folder",
    new_model: "New model",
    library_empty: "Nothing here yet. Create a new model from a video.",
    pick_videos: "Choose videos",
    drop_title: "Videos into the library",
    drop_sub: "Pick one or more videos, or drop them here. MOV, MP4, M4V.",
    pick_videos_btn: "Choose videos",
    video: "Video",
    quality_title: "Model quality",
    quality_sub: "From a quick preview to maximum detail",
    photos_title: "Photo count",
    photos_help: "Evenly sampled from the whole video",
    create_model: "Create 3D model",
    create_n_models: "Create {n} models",
    n_videos: "{n} videos",
    preparing: "Preparing",
    starting: "Starting",
    continuing: "Resuming",
    stop: "Stop",
    done: "Done",
    compare_models: "Compare models",
    model_ready: "Model is ready",
    better_quality: "Need better quality?",
    generate_another: "Generate another model",
    show_in_finder: "Show in Finder",
    delete_project: "Delete project",
    failed_label: "Could not finish",
    failed_title: "Processing failed",
    back_to_library: "Back to library",
    drop_overlay: "Drop videos here",
    drop_overlay_sub: "One or more files · MOV, MP4, M4V",
    q_preview: "quick preview",
    q_small: "web and mobile",
    q_medium: "recommended",
    q_full: "high detail",
    q_profi: "maximum quality",
    model_one: "1 model",
    model_few: "{n} models",
    model_many: "{n} models",
    in_progress: "In progress",
    watch: "Watch",
    open: "Open",
    delete: "Delete",
    missing_ffmpeg: "ffmpeg is missing",
    eta_under_minute: "less than a minute",
    eta_about_1min: "about 1 min",
    eta_about_min: "about {n} min",
    remaining: "{eta} left",
    step_of: "Step {n} of 2",
    video_of: "Video {n} of {total}",
    photos_from_video: "Photos from video",
    model_3d: "3D model",
    last_model: "Last model: {quality} · {n} photos",
    photos_count: "{n} photos",
    texture: "Texture",
    geometry: "Geometry",
    light: "Light",
    fullscreen: "Full screen",
    exit_fullscreen: "Exit full screen",
    preview: "Preview",
    preview_failed: "Could not load the preview.",
    pick_prompt: "Choose one or more videos",
    pick_dialog: "The file picker is open. You can select multiple videos. If you do not see it, look behind the browser window.",
    uploading: "Uploading {name}… {pct}%",
    copying: "Copying {n} of {total}: {name}",
    preparing_file: "Preparing {name}…",
    upload_failed: "Upload failed.",
    drop_videos: "Drop video files, for example MOV or MP4.",
    wait_processing: "Wait until the current job finishes.",
    photos_help_batch: "The same settings for {n} videos. Shorter videos will use fewer photos.",
    photos_help_single: "Evenly from {frames} frames · every {every}th · interval {interval} s",
    hw_loading_title: "Reading this Mac’s limit…",
    hw_loading_body: "Apple Object Capture reports it from the hardware. It is not an app cap.",
    hw_limit_title: "This Mac’s maximum: {n} photos",
    hw_limit_body: "That is the Apple Object Capture ceiling on this hardware, not an app limit.",
    hw_limit_extra: " The video has {frames} frames, but this Mac will not take more than {n} in one run.",
    no_videos_prepared: "Could not prepare any video.",
    confirm_delete_project: "Delete the whole project, including the copied video and models?",
    confirm_delete_model: "Delete this 3D model? The video and other models will stay.",
    generation_stopped: "Generation stopped.",
    support_text: "If this helped you, you can support the project.",
    extracting_frames: "Extracting photos from the video",
    estimate_total: "Estimated total {duration}",
    starting_object_capture: "Starting Object Capture",
    preparing_object_capture: "Preparing Object Capture. The first run can take longer.",
    preparing_preview: "Preparing the in-browser preview",
    done_in: "Done in {elapsed}",
    cancelled: "Generation stopped.",
    photos_loaded: "Photos loaded",
    downsampling: "Adjusting data size",
    skip_bad_frame: "Skipping an unusable frame",
    skip_frame: "Skipping a frame",
    saving_model: "Saving the model",
    finishing_export: "Finishing export",
    stitching_incomplete: "Filling missing parts of the model",
    preprocessing: "Preparing frames",
    imagealignment: "Aligning photos",
    pointcloudgeneration: "Building point clouds",
    meshgeneration: "Building the mesh",
    texturemapping: "Mapping texture",
    optimization: "Refining the model",
    no_video_track: "This file has no video track.",
    duration_unreadable: "Could not read the video duration.",
    extract_failed: "Could not extract frames from the video.",
    no_frames: "No photos could be extracted from the video.",
    reconstruct_failed: "Object Capture failed.",
    usdz_missing: "Reconstruction finished, but no USDZ file was created.",
    file_pick_cancelled: "File selection was cancelled.",
    no_video_selected: "No video was selected.",
    server_restarted: "Processing was interrupted because the server restarted.",
    project_busy: "This project is still running. Let it finish first.",
    model_missing: "The model does not exist.",
    pick_analyze_first: "Choose and analyze a video first.",
    project_missing: "The project does not exist.",
    forbidden_path: "That path is not allowed.",
    poster_missing: "The video poster is not available.",
    model_not_ready: "The model is not ready yet.",
    preview_not_ready: "The preview is not ready yet.",
    preview_file_missing: "The preview file does not exist.",
    not_found: "Not found.",
    video_not_selected: "No video has been selected yet.",
    missing_content_length: "Content-Length is missing.",
    nothing_running: "Nothing is generating right now.",
    already_processing: "This model is already being processed.",
    wait_current: "Let the current generation finish first.",
    invalid_json: "Invalid JSON.",
    unknown_quality: "Unknown quality.",
    invalid_photo_count: "Invalid photo count.",
    analyze_first: "Analyze the video first.",
    path_missing: "The file or folder does not exist yet.",
    file_missing: "The file does not exist.",
  },
};

const LANG_KEY = "v23d-lang";

function langCodes() {
  return Object.keys(I18N).sort((a, b) => (I18N[a].$?.order || 99) - (I18N[b].$?.order || 99) || a.localeCompare(b));
}

function fallbackLang() {
  return I18N.en ? "en" : langCodes()[0];
}

function langMeta(code) {
  return (I18N[code] && I18N[code].$) || {};
}

function isI18nKey(key) {
  if (!key || typeof key !== "string") return false;
  for (const code of Object.keys(I18N)) {
    if (typeof I18N[code][key] === "string") return true;
  }
  return false;
}

function detectLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved && I18N[saved]) return saved;
  const nav = (navigator.language || "").toLowerCase();
  for (const code of langCodes()) {
    if (nav === code || nav.startsWith(`${code}-`)) return code;
  }
  return fallbackLang();
}

let lang = detectLang();

function t(key, vars) {
  const table = I18N[lang] || I18N[fallbackLang()] || {};
  const fallback = I18N[fallbackLang()] || {};
  let text = table[key] || fallback[key] || key;
  if (typeof text !== "string") text = fallback[key] || key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

function renderLangButtons() {
  const root = document.querySelector(".langs");
  if (!root) return;
  root.innerHTML = langCodes()
    .map((code) => {
      const meta = langMeta(code);
      const name = meta.name || code;
      return `<button type="button" class="lang${code === lang ? " is-on" : ""}" data-lang="${code}" aria-label="${name}" title="${name}">${meta.flag || code}</button>`;
    })
    .join("");
}

function applyStaticLang() {
  document.documentElement.lang = lang;
  renderLangButtons();
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
}

function setLang(next) {
  if (!I18N[next]) return;
  lang = next;
  localStorage.setItem(LANG_KEY, next);
  if (typeof applyLang === "function") applyLang();
  else applyStaticLang();
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".lang");
  if (btn?.dataset.lang) setLang(btn.dataset.lang);
});
