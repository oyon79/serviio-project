let providers = [];

const grid = document.getElementById("providerGrid");
const searchInput = document.getElementById("searchInput");
const catFilter = document.getElementById("categoryFilter");
const areaFilter = document.getElementById("areaFilter");
const rateFilter = document.getElementById("ratingFilter");
const clearBtn = document.getElementById("clearBtn");
const initialParams = new URLSearchParams(window.location.search);

function getApiBaseUrl() {
  if (window.Serviio?.apiBaseUrl) return window.Serviio.apiBaseUrl;
  return window.location.origin;
}

function escapeHTML(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function providerUrl(id) {
  return `providerInfo1.html?id=${encodeURIComponent(id)}`;
}

function scheduleUrl(id) {
  return `schedule.html?provider_id=${encodeURIComponent(id)}`;
}

async function fetchProviders() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/providers`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to load providers.");
    }

    providers = (result.data || []).map((provider) => ({
      id: provider.id,
      name: `${provider.first_name || ""} ${provider.last_name || ""}`.trim(),
      cat: provider.service_type || "General Service",
      area: provider.location || "Unspecified",
      rate: Number.parseFloat(provider.average_rating) || 0,
      reviews: Number(provider.total_reviews) || 0,
      status: provider.is_available ? "Online" : "Offline",
      img: "",
      desc: provider.experience_summary || "No professional summary yet.",
    }));

    applyInitialFilters();
    updateFilters();
  } catch (error) {
    console.error("Error fetching providers:", error);
    grid.innerHTML =
      '<p style="text-align:center; padding: 40px; color: red;">Failed to load providers. Make sure your Node.js server is running.</p>';
  }
}

function render(data) {
  if (data.length === 0) {
    grid.innerHTML =
      '<p style="text-align:center; padding: 40px;">No providers found matching your criteria.</p>';
    return;
  }

  grid.innerHTML = data
    .map((provider) => {
      const status = String(provider.status || "Offline");
      const statusClass = status.toLowerCase() === "online" ? "online" : "offline";
      const rating = Number(provider.rate || 0).toFixed(1);
      const reviews = Number(provider.reviews || 0);

      return `
        <div class="card">
          ${
            provider.img
              ? `<img src="${escapeHTML(provider.img)}" class="p-img" alt="${escapeHTML(provider.name || "Provider")}">`
              : '<div class="p-img-placeholder" style="display:flex; justify-content:center; align-items:center;"><i class="fa-solid fa-user" style="font-size: 30px; color: #ccc;"></i></div>'
          }
          <div class="info-area">
            <button class="name-link" onclick="window.location.href='${providerUrl(provider.id)}'">${escapeHTML(provider.name || "Provider")}</button>
            <span class="cat-tag">${escapeHTML(provider.cat)}</span>
            <div class="loc"><i class="fa-solid fa-location-dot"></i> ${escapeHTML(provider.area)}</div>
          </div>
          <div class="desc-area">${escapeHTML(provider.desc)}</div>
          <div class="action-area">
            <div class="rating-info">
              <i class="fa-solid fa-star"></i> ${rating} (${reviews} Reviews)
            </div>
            <span class="status-dot ${statusClass}">&bull; ${escapeHTML(status)}</span>
            <div class="btns">
              <button class="book-btn" onclick="window.location.href='${scheduleUrl(provider.id)}'"><i class="fa-solid fa-calendar-check"></i> Booking</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateFilters() {
  const search = searchInput.value.toLowerCase();
  const category = catFilter.value;
  const area = areaFilter.value;
  const minRating = Number.parseFloat(rateFilter.value) || 0;

  const filtered = providers.filter((provider) => {
    return (
      (provider.name.toLowerCase().includes(search) ||
        provider.cat.toLowerCase().includes(search)) &&
      (category === "" || provider.cat === category) &&
      (area === "" || provider.area === area) &&
      provider.rate >= minRating
    );
  });
  render(filtered);
}

function applyInitialFilters() {
  const area = initialParams.get("area");
  const service = initialParams.get("service");

  if (area && areaFilter) {
    const areaOption = Array.from(areaFilter.options).find(
      (option) => option.value.toLowerCase() === area.toLowerCase(),
    );
    if (areaOption) areaFilter.value = areaOption.value;
    else searchInput.value = area;
  }

  if (service && catFilter) {
    const serviceOption = Array.from(catFilter.options).find(
      (option) => option.value.toLowerCase() === service.toLowerCase(),
    );
    if (serviceOption) catFilter.value = serviceOption.value;
    else searchInput.value = service;
  }
}

[catFilter, areaFilter, rateFilter].forEach((element) =>
  element.addEventListener("change", updateFilters),
);
searchInput.addEventListener("input", updateFilters);

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  catFilter.value = "";
  areaFilter.value = "";
  rateFilter.value = "";
  render(providers);
});

fetchProviders();
