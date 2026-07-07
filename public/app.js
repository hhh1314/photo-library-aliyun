const state = {
  captchaId: "",
  photos: [],
  filter: "all",
  category: "all",
  search: "",
  sort: "newest",
  selectedId: null,
  weatherCoords: null
};

const categoryLabels = {
  nature: "自然",
  city: "城市",
  people: "人物",
  science: "科研",
  other: "其他"
};

const el = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  captcha: document.querySelector("#captcha"),
  captchaImage: document.querySelector("#captchaImage"),
  refreshCaptcha: document.querySelector("#refreshCaptcha"),
  loginMessage: document.querySelector("#loginMessage"),
  logoutButton: document.querySelector("#logoutButton"),
  searchForm: document.querySelector("#searchForm"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilter: document.querySelector("#categoryFilter"),
  uploadForm: document.querySelector("#uploadForm"),
  fileInput: document.querySelector("#fileInput"),
  titleInput: document.querySelector("#titleInput"),
  categoryInput: document.querySelector("#categoryInput"),
  tagsInput: document.querySelector("#tagsInput"),
  uploadMessage: document.querySelector("#uploadMessage"),
  sortSelect: document.querySelector("#sortSelect"),
  gallery: document.querySelector("#gallery"),
  galleryTitle: document.querySelector("#galleryTitle"),
  galleryMeta: document.querySelector("#galleryMeta"),
  emptyState: document.querySelector("#emptyState"),
  viewer: document.querySelector("#viewer"),
  closeViewer: document.querySelector("#closeViewer"),
  viewerImage: document.querySelector("#viewerImage"),
  viewerTitle: document.querySelector("#viewerTitle"),
  viewerTags: document.querySelector("#viewerTags"),
  viewerDate: document.querySelector("#viewerDate"),
  favoriteButton: document.querySelector("#favoriteButton"),
  downloadButton: document.querySelector("#downloadButton"),
  weatherOrb: document.querySelector("#weatherOrb"),
  weatherTemp: document.querySelector("#weatherTemp"),
  weatherSummary: document.querySelector("#weatherSummary"),
  weatherPlace: document.querySelector("#weatherPlace"),
  weatherFeels: document.querySelector("#weatherFeels"),
  weatherHumidity: document.querySelector("#weatherHumidity"),
  weatherWind: document.querySelector("#weatherWind"),
  refreshWeather: document.querySelector("#refreshWeather")
};

const weatherDescriptions = {
  0: ["晴朗", "sun"],
  1: ["大部晴朗", "sun"],
  2: ["局部多云", "cloud"],
  3: ["阴天", "cloud"],
  45: ["有雾", "cloud"],
  48: ["雾凇", "cloud"],
  51: ["小毛毛雨", "rain"],
  53: ["毛毛雨", "rain"],
  55: ["较强毛毛雨", "rain"],
  61: ["小雨", "rain"],
  63: ["中雨", "rain"],
  65: ["大雨", "rain"],
  71: ["小雪", "cloud"],
  73: ["中雪", "cloud"],
  75: ["大雪", "cloud"],
  80: ["阵雨", "rain"],
  81: ["较强阵雨", "rain"],
  82: ["强阵雨", "rain"],
  95: ["雷雨", "rain"]
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: options.body instanceof FormData
      ? options.headers
      : { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

async function refreshCaptcha() {
  const data = await api("/api/captcha");
  state.captchaId = data.id;
  el.captchaImage.src = data.image;
  el.captcha.value = "";
}

async function login(event) {
  event.preventDefault();
  el.loginMessage.textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: el.username.value.trim(),
        password: el.password.value,
        captcha: el.captcha.value.trim(),
        captchaId: state.captchaId
      })
    });
    await showApp();
  } catch (error) {
    el.loginMessage.textContent = error.message;
    await refreshCaptcha();
  }
}

async function logout() {
  await api("/api/logout", { method: "POST", body: "{}" }).catch(() => {});
  el.appShell.classList.add("hidden");
  el.loginScreen.classList.remove("hidden");
  await refreshCaptcha();
}

async function showApp() {
  el.loginScreen.classList.add("hidden");
  el.appShell.classList.remove("hidden");
  loadWeather();
  await loadPhotos();
}

async function loadPhotos() {
  state.photos = await api("/api/photos");
  renderGallery();
}

function filteredPhotos() {
  let photos = [...state.photos];
  const query = state.search.toLowerCase().trim();

  if (state.filter === "favorites") {
    photos = photos.filter(photo => photo.favorite);
  } else if (state.filter === "recent") {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    photos = photos.filter(photo => new Date(photo.createdAt).getTime() >= weekAgo);
  }

  if (state.category !== "all") {
    photos = photos.filter(photo => photo.category === state.category);
  }

  if (query) {
    photos = photos.filter(photo => {
      const text = [photo.title, photo.category, ...(photo.tags || [])].join(" ").toLowerCase();
      return text.includes(query);
    });
  }

  photos.sort((a, b) => {
    if (state.sort === "favorite") return Number(b.favorite) - Number(a.favorite);
    if (state.sort === "title") return a.title.localeCompare(b.title, "zh-CN");
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return photos;
}

function renderGallery() {
  const photos = filteredPhotos();
  el.gallery.innerHTML = "";
  el.emptyState.classList.toggle("hidden", photos.length > 0);
  el.galleryTitle.textContent = state.filter === "favorites"
    ? "收藏照片"
    : state.filter === "recent"
      ? "最近上传"
      : "全部照片";
  el.galleryMeta.textContent = `${photos.length} 张照片来自服务器。`;

  const fragment = document.createDocumentFragment();
  photos.forEach(photo => fragment.appendChild(createCard(photo)));
  el.gallery.appendChild(fragment);
}

function createCard(photo) {
  const card = document.createElement("article");
  card.className = "photo-card";

  const image = document.createElement("img");
  image.src = photo.src;
  image.alt = photo.title;
  image.loading = "lazy";

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const favorite = document.createElement("button");
  favorite.className = `icon-button ${photo.favorite ? "favorite-on" : ""}`;
  favorite.type = "button";
  favorite.textContent = "♥";
  favorite.title = photo.favorite ? "取消收藏" : "收藏";
  favorite.addEventListener("click", event => {
    event.stopPropagation();
    toggleFavorite(photo.id);
  });

  const open = document.createElement("button");
  open.className = "icon-button";
  open.type = "button";
  open.textContent = "↗";
  open.title = "查看";
  open.addEventListener("click", event => {
    event.stopPropagation();
    openViewer(photo.id);
  });

  actions.append(favorite, open);

  const overlay = document.createElement("div");
  overlay.className = "photo-overlay";
  overlay.innerHTML = `
    <h3>${escapeHtml(photo.title)}</h3>
    <p>${escapeHtml(categoryLabels[photo.category] || "其他")} · ${formatDate(photo.createdAt)}</p>
  `;

  card.append(image, actions, overlay);
  card.addEventListener("click", () => openViewer(photo.id));
  return card;
}

async function uploadPhoto(event) {
  event.preventDefault();
  const file = el.fileInput.files[0];
  if (!file) return;

  el.uploadMessage.textContent = "正在上传...";
  try {
    const data = new FormData();
    data.append("photo", file);
    data.append("title", el.titleInput.value);
    data.append("category", el.categoryInput.value);
    data.append("tags", el.tagsInput.value);

    await api("/api/photos", {
      method: "POST",
      body: data
    });
    el.uploadForm.reset();
    el.categoryInput.value = "other";
    el.uploadMessage.textContent = "上传成功";
    await loadPhotos();
  } catch (error) {
    el.uploadMessage.textContent = error.message;
  }
}

async function toggleFavorite(id) {
  const photo = await api(`/api/photos/${encodeURIComponent(id)}`, { method: "PATCH", body: "{}" });
  state.photos = state.photos.map(item => item.id === id ? photo : item);
  renderGallery();
  if (state.selectedId === id) fillViewer(photo);
}

function openViewer(id) {
  const photo = state.photos.find(item => item.id === id);
  if (!photo) return;
  state.selectedId = id;
  fillViewer(photo);
  el.viewer.showModal();
}

function fillViewer(photo) {
  el.viewerImage.src = photo.src;
  el.viewerImage.alt = photo.title;
  el.viewerTitle.textContent = photo.title;
  el.viewerTags.textContent = (photo.tags || []).map(tag => `#${tag}`).join(" ");
  el.viewerDate.textContent = `${categoryLabels[photo.category] || "其他"} · ${formatDate(photo.createdAt)} · ${formatBytes(photo.size)}`;
  el.favoriteButton.textContent = photo.favorite ? "取消收藏" : "收藏";
  el.downloadButton.href = photo.src;
  el.downloadButton.download = photo.title;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "未知大小";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("浏览器不支持定位"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: "当前位置"
      }),
      reject,
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 15 * 60 * 1000
      }
    );
  });
}

async function loadWeather(force = false) {
  if (!el.weatherTemp) return;
  el.weatherTemp.textContent = "读取中";
  el.weatherSummary.textContent = "正在获取当地天气。";

  let coords = state.weatherCoords;
  let usedFallback = false;
  if (!coords || force) {
    try {
      coords = await getBrowserPosition();
    } catch {
      usedFallback = true;
      coords = {
        latitude: 31.2304,
        longitude: 121.4737,
        label: "上海"
      };
    }
    state.weatherCoords = coords;
  }

  try {
    const params = new URLSearchParams({
      latitude: coords.latitude,
      longitude: coords.longitude,
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
      timezone: "auto"
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) throw new Error("天气接口不可用");
    const data = await response.json();
    renderWeather(data.current, coords.label, usedFallback);
  } catch {
    el.weatherTemp.textContent = "--";
    el.weatherSummary.textContent = "天气暂时读取失败，稍后再刷新。";
    el.weatherPlace.textContent = coords.label;
  }
}

function renderWeather(current, place, usedFallback) {
  const code = Number(current.weather_code);
  const [description, mood] = weatherDescriptions[code] || ["天气变化中", "cloud"];
  const temp = Math.round(current.temperature_2m);
  const feels = Math.round(current.apparent_temperature);

  el.weatherOrb.classList.remove("rain", "cloud");
  if (mood !== "sun") el.weatherOrb.classList.add(mood);
  el.weatherTemp.textContent = `${temp}°C`;
  el.weatherSummary.textContent = usedFallback
    ? `${description}。未获得定位权限，当前显示上海天气。`
    : `${description}。天气数据来自 Open-Meteo。`;
  el.weatherPlace.textContent = place;
  el.weatherFeels.textContent = `${feels}°C`;
  el.weatherHumidity.textContent = `${current.relative_humidity_2m}%`;
  el.weatherWind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bindEvents() {
  el.loginForm.addEventListener("submit", login);
  el.refreshCaptcha.addEventListener("click", refreshCaptcha);
  el.logoutButton.addEventListener("click", logout);
  el.uploadForm.addEventListener("submit", uploadPhoto);

  el.searchForm.addEventListener("submit", event => event.preventDefault());
  el.searchInput.addEventListener("input", () => {
    state.search = el.searchInput.value;
    renderGallery();
  });
  el.categoryFilter.addEventListener("change", () => {
    state.category = el.categoryFilter.value;
    renderGallery();
  });
  el.sortSelect.addEventListener("change", () => {
    state.sort = el.sortSelect.value;
    renderGallery();
  });

  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(item => item.classList.remove("active"));
      tab.classList.add("active");
      state.filter = tab.dataset.filter;
      renderGallery();
    });
  });

  el.closeViewer.addEventListener("click", () => el.viewer.close());
  el.favoriteButton.addEventListener("click", () => {
    if (state.selectedId) toggleFavorite(state.selectedId);
  });
  el.refreshWeather.addEventListener("click", () => loadWeather(true));
}

async function init() {
  bindEvents();
  const me = await api("/api/me");
  if (me.authenticated) {
    await showApp();
  } else {
    await refreshCaptcha();
  }
}

init().catch(async error => {
  el.loginMessage.textContent = error.message;
  await refreshCaptcha().catch(() => {});
});
