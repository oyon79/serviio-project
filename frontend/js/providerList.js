// We start with an empty array. The database will fill this.
let providers = [];

const grid = document.getElementById("providerGrid");
const searchInput = document.getElementById("searchInput");
const catFilter = document.getElementById("categoryFilter");
const areaFilter = document.getElementById("areaFilter");
const rateFilter = document.getElementById("ratingFilter");
const clearBtn = document.getElementById("clearBtn");
const initialParams = new URLSearchParams(window.location.search);

function getApiBaseUrl() {
  const hostname = window.location.hostname;
  const port = window.location.port;
  if (window.location.protocol === "file:") {
    return "http://localhost:5000";
  }
  if (hostname === "localhost" && (!port || port === "" || port === "80")) {
    return "http://localhost:5000";
  }
  return window.location.origin;
}

// 1. Fetch Real Data from your Node.js Backend
async function fetchProviders() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/providers`);
    const result = await response.json();

    if (result.success) {
      // Map the database columns to the format our frontend expects
      providers = result.data.map((p) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        cat: p.service_type || "General Service",
        area: p.location || "Unspecified",
        rate: isNaN(parseFloat(p.average_rating))
          ? 0
          : parseFloat(p.average_rating),
        reviews: Number(p.total_reviews) || 0,
        status: p.is_available ? "Online" : "Offline",
        img: "", // We will handle image uploads later
        desc: p.experience_summary,
      }));

      applyInitialFilters();

      // Draw the cards on the screen
      updateFilters();
    }
  } catch (error) {
    console.error("Error fetching providers:", error);
    grid.innerHTML =
      '<p style="text-align:center; padding: 40px; color: red;">Failed to load providers. Make sure your Node.js server is running!</p>';
  }
}

// 2. Render the HTML Cards
function render(data) {
  if (data.length === 0) {
    grid.innerHTML =
      '<p style="text-align:center; padding: 40px;">No providers found matching your criteria.</p>';
    return;
  }

  grid.innerHTML = data
    .map(
      (p) => `
        <div class="card">
            ${p.img ? `<img src="${p.img}" class="p-img">` : `<div class="p-img-placeholder" style="display:flex; justify-content:center; align-items:center;"><i class="fa-solid fa-user" style="font-size: 30px; color: #ccc;"></i></div>`}
            <div class="info-area">
                <button class="name-link" onclick="window.location.href='providerInfo1.html?id=${p.id}'">${p.name}</button>
                <span class="cat-tag">${p.cat}</span>
                <div class="loc"><i class="fa-solid fa-location-dot"></i> ${p.area}</div>
            </div>
            <div class="desc-area">${p.desc}</div>
            <div class="action-area">
                <div class="rating-info">
                    <i class="fa-solid fa-star"></i> ${p.rate} (${p.reviews} Reviews)
                </div>
                <span class="status-dot ${p.status.toLowerCase()}">● ${p.status}</span>
                <div class="btns">
                  <button class="book-btn" onclick="window.location.href='schedule.html?provider_id=${p.id}'"><i class="fa-solid fa-calendar-check"></i> Booking</button>
                </div>
            </div>
        </div>
    `,
    )
    .join("");
}

// 3. Filtering Logic
function updateFilters() {
  const s = searchInput.value.toLowerCase();
  const c = catFilter.value;
  const a = areaFilter.value;
  const r = parseFloat(rateFilter.value) || 0;

  const filtered = providers.filter((p) => {
    return (
      (p.name.toLowerCase().includes(s) || p.cat.toLowerCase().includes(s)) &&
      (c === "" || p.cat === c) &&
      (a === "" || p.area === a) &&
      p.rate >= r
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

// 4. Attach Event Listeners
[catFilter, areaFilter, rateFilter].forEach((el) =>
  el.addEventListener("change", updateFilters),
);
searchInput.addEventListener("input", updateFilters);

clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  catFilter.value = "";
  areaFilter.value = "";
  rateFilter.value = "";
  render(providers);
});

// Kick off the script by fetching the data!
fetchProviders();
