const providers = [
    { name: "Mohammad Karim", cat: "Electrician", area: "Dhaka", rate: 4.9, reviews: 110, status: "Online", img: "", desc: "Skilled electrician with 10 years of experience. I handle all kinds of electrical work for homes and offices." },
    { name: "Rahima Khatun", cat: "Cleaner", area: "Dhaka", rate: 4.7, reviews: 95, status: "Online", img: "", desc: "Professional cleaner. I provide complete cleaning services for homes, offices, and shops." },
    { name: "Najmul Hossain Nur", cat: "Technician", area: "Uttora", rate: 4.8, reviews: 67, status: "Online", img: "", desc: "Expert in air conditioner installation, repair, and servicing." },
    { name: "Abul Hasan", cat: "Plumber", area: "Chattogram", rate: 4.5, reviews: 54, status: "Offline", img: "", desc: "Expert in all types of plumbing work, including pipelines, water tanks, and bathrooms." },
    { name: "Fatema Begum", cat: "Carpenter", area: "Sylhet", rate: 4.6, reviews: 78, status: "Online", img: "h", desc: "Skilled in furniture making and repair. I handle all kinds of woodwork." },
    { name: "Nasir Uddin", cat: "Painter", area: "Rajshahi", rate: 4.5, reviews: 92, status: "Offline", img: "", desc: "Experienced in interior and exterior painting of houses and buildings." },
    { name: "Jahangir Alam", cat: "Mechanic", area: "Barishal", rate: 4.4, reviews: 103, status: "Online", img: "", desc: "I solve all kinds of mechanical problems for cars and motorcycles." },
    { name: "Najmul Hossain Nur", cat: "Gardener", area: "Dhaka", rate: 4.7, reviews: 45, status: "Offline", img: "", desc: "Experienced in gardening and landscaping. I take care of plants." },
    { name: "Sultana Razia", cat: "Cleaner", area: "Uttora", rate: 4.3, reviews: 32, status: "Online", desc: "Dedicated house cleaning and organizing specialist with flexible hours." },
    { name: "Kamal Ahmed", cat: "Electrician", area: "Chattogram", rate: 4.8, reviews: 88, status: "Online", desc: "Industrial electrical expert. Specialized in high-voltage repairs." },
    { name: "Arif Hossain", cat: "Plumber", area: "Dhaka", rate: 4.2, reviews: 29, status: "Online", desc: "Plumbing maintenance and urgent leak fixes for residential buildings." },
    { name: "Mehedi Hasan", cat: "Technician", area: "Sylhet", rate: 4.9, reviews: 120, status: "Online", desc: "Hardware technician for computers and small electronics." },
    { name: "Rokeya Sakhawat", cat: "Painter", area: "Dhaka", rate: 4.1, reviews: 15, status: "Offline", desc: "Wall decor and aesthetic painting professional." },
    { name: "Zakir Khan", cat: "Mechanic", area: "Uttora", rate: 4.7, reviews: 66, status: "Online", desc: "Engine tuning and brake system expert for Japanese cars." },
    { name: "Babul Mia", cat: "Carpenter", area: "Barishal", rate: 4.5, reviews: 41, status: "Offline", desc: "Custom kitchen cabinet maker and wood polisher." }
];

const grid = document.getElementById('providerGrid');
const searchInput = document.getElementById('searchInput');
const catFilter = document.getElementById('categoryFilter');
const areaFilter = document.getElementById('areaFilter');
const rateFilter = document.getElementById('ratingFilter');
const clearBtn = document.getElementById('clearBtn');

function render(data) {
    grid.innerHTML = data.map(p => `
        <div class="card">
            ${p.img ? `<img src="${p.img}" class="p-img">` : `<div class="p-img-placeholder"></div>`}
            <div class="info-area">
                <button class="name-link" onclick="window.location.href='providerInfo1.html'" onclick="console.log('Clicked ${p.name}')">${p.name}</button>
                <span class="cat-tag">${p.cat}</span>
                <div class="loc"><i class="fa-solid fa-location-dot"></i> ${p.area}</div>
            </div>
            <div class="desc-area">${p.desc}</div>
            <div class="action-area">
                <div class="rating-info">
                    <i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star-half-stroke"></i>
                    ${p.rate} (${p.reviews} Review)
                </div>
                <span class="status-dot ${p.status.toLowerCase()}">● ${p.status}</span>
                <div class="btns">
                    <button class="msg-btn" ><i class="fa-solid fa-message"></i> Message</button>
                    <button class="call-btn"><i class="fa-solid fa-phone"></i> Call</button>
                    <button class="book-btn" onclick="window.location.href='schedule.html'"><i class="fa-solid fa-calendar-check"></i> Booking</button>
                </div>
            </div>
        </div>
    `).join('');
}

function updateFilters() {
    const s = searchInput.value.toLowerCase();
    const c = catFilter.value;
    const a = areaFilter.value;
    const r = parseFloat(rateFilter.value) || 0;

    const filtered = providers.filter(p => {
        return (p.name.toLowerCase().includes(s) || p.cat.toLowerCase().includes(s)) &&
               (c === "" || p.cat === c) &&
               (a === "" || p.area === a) &&
               (p.rate >= r);
    });
    render(filtered);
}

[searchInput, catFilter, areaFilter, rateFilter].forEach(el => el.oninput = updateFilters);

clearBtn.onclick = () => {
    searchInput.value = "";
    catFilter.value = "";
    areaFilter.value = "";
    rateFilter.value = "";
    render(providers);
};

render(providers);