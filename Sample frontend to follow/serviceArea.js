const areasData = [
    { id: 1, areaName: "Uttara", description: "In Uttara i will service Properly", providerCount: 20, rating: "4.5 Rate", availability: "Regular Time", isEmergency: false, services: ["Electrician", "Plumber", "Wood Worker"] },
    { id: 2, areaName: "Mirpur", description: "In Mirpur Affordable service", providerCount: 15, rating: "4.3 Rate", availability: "Regular Time", isEmergency: true, services: ["Electrician", "Plumber", "Normal Service"] },
    { id: 3, areaName: "Old Dhaka", description: "Affordable service and good service", providerCount: 22, rating: "4.4 Rate", availability: "Regular Time", isEmergency: true, services: ["Electrician", "Plumber", "Normal Service"] },
    { id: 4, areaName: "Notun Bazar", description: "Affordable service", providerCount: 22, rating: "4.4 Rate", availability: "Regular Time", isEmergency: true, services: ["Electrician", "Plumber", "Wood Worker", "Normal Service"] },
    { id: 5, areaName: "Gulshan", description: "Premium home service in Gulshan", providerCount: 35, rating: "4.8 Rate", availability: "24/7 Support", isEmergency: false, services: ["AC Repair", "Electrician", "Plumber"] },
    { id: 6, areaName: "Banani", description: "Quick response teams available", providerCount: 18, rating: "4.6 Rate", availability: "24/7 Support", isEmergency: true, services: ["Electrician", "AC Repair", "Wood Worker"] },
    { id: 7, areaName: "Dhanmondi", description: "Trusted local providers", providerCount: 28, rating: "4.5 Rate", availability: "Regular Time", isEmergency: false, services: ["Plumber", "Normal Service", "Wood Worker"] },
    { id: 8, areaName: "Badda", description: "Reliable and fast services", providerCount: 12, rating: "4.2 Rate", availability: "Weekend Only", isEmergency: false, services: ["Electrician", "Normal Service"] },
    { id: 9, areaName: "Uttara", description: "Expert household repair team", providerCount: 25, rating: "4.7 Rate", availability: "24/7 Support", isEmergency: true, services: ["AC Repair", "Plumber", "Electrician"] },
    { id: 10, areaName: "Mirpur", description: "Dedicated to complete satisfaction", providerCount: 10, rating: "4.1 Rate", availability: "Weekend Only", isEmergency: false, services: ["Wood Worker", "Normal Service"] },
    { id: 11, areaName: "Motijheel", description: "Commercial & residential experts", providerCount: 30, rating: "4.5 Rate", availability: "Regular Time", isEmergency: true, services: ["Electrician", "AC Repair"] },
    { id: 12, areaName: "Bashundhara", description: "High quality apartment servicing", providerCount: 40, rating: "4.9 Rate", availability: "24/7 Support", isEmergency: false, services: ["Plumber", "Wood Worker", "Normal Service"] },
    { id: 13, areaName: "Khilgaon", description: "Local area verified workers", providerCount: 14, rating: "4.3 Rate", availability: "Regular Time", isEmergency: false, services: ["Normal Service", "Plumber"] },
    { id: 14, areaName: "Mohammadpur", description: "All in one home maintenance", providerCount: 26, rating: "4.6 Rate", availability: "24/7 Support", isEmergency: true, services: ["Electrician", "Plumber", "AC Repair"] },
    { id: 15, areaName: "Farmgate", description: "Centrally located quick dispatch", providerCount: 19, rating: "4.4 Rate", availability: "Regular Time", isEmergency: false, services: ["Electrician", "Wood Worker"] },
    { id: 16, areaName: "Old Dhaka", description: "Specialists in older building repair", providerCount: 16, rating: "4.2 Rate", availability: "Weekend Only", isEmergency: true, services: ["Plumber", "Wood Worker"] },
    { id: 17, areaName: "Notun Bazar", description: "Top rated technical service", providerCount: 21, rating: "4.7 Rate", availability: "24/7 Support", isEmergency: false, services: ["AC Repair", "Electrician", "Plumber"] },
    { id: 18, areaName: "Gulshan", description: "Elite home care professionals", providerCount: 45, rating: "5.0 Rate", availability: "Regular Time", isEmergency: false, services: ["Wood Worker", "Normal Service", "AC Repair"] },
    { id: 19, areaName: "Dhanmondi", description: "Experienced repair technicians", providerCount: 31, rating: "4.5 Rate", availability: "Weekend Only", isEmergency: true, services: ["Plumber", "Electrician"] },
    { id: 20, areaName: "Banani", description: "Verified background checked staff", providerCount: 24, rating: "4.6 Rate", availability: "Regular Time", isEmergency: false, services: ["Normal Service", "Wood Worker", "Plumber"] }
];

const areaGrid = document.getElementById('areaGrid');
const noResults = document.getElementById('noResults');
const searchInput = document.getElementById('searchInput');
const areaFilter = document.getElementById('areaFilter');
const serviceFilter = document.getElementById('serviceFilter');
const availabilityFilter = document.getElementById('availabilityFilter');
const clearBtn = document.getElementById('clearFiltersBtn');
const searchBtn = document.getElementById('searchBtn');


const serviceIcons = {
    "Electrician": "fa-bolt",
    "Plumber": "fa-faucet-drip",
    "Wood Worker": "fa-hammer",
    "Normal Service": "fa-screwdriver-wrench",
    "AC Repair": "fa-snowflake"
};


function renderCards(data) {
    areaGrid.innerHTML = ''; 

    if (data.length === 0) {
        noResults.style.display = 'block';
        return;
    }
    
    noResults.style.display = 'none';

    data.forEach(item => {
        
        const emgHTML = item.isEmergency ? `<span class="emg-badge"><i class="fa-solid fa-bell"></i> Emg</span>` : '';
        
       
        const servicesHTML = item.services.map(srv => {
            const iconClass = serviceIcons[srv] || "fa-check";
            return `<span class="service-pill"><i class="fa-solid ${iconClass}"></i> ${srv}</span>`;
        }).join('');

        const cardHTML = `
            <div class="area-card">
                <div class="card-header">
                    <h3><i class="fa-solid fa-location-dot"></i> ${item.areaName}</h3>
                    ${emgHTML}
                </div>
                <div class="card-body">
                    <p class="desc">${item.description}</p>
                    
                    <div class="stats-row">
                        <div class="stat-box">
                            <i class="fa-solid fa-users"></i>
                            <span>${item.providerCount}<br>Provider</span>
                        </div>
                        <div class="stat-box">
                            <i class="fa-solid fa-star"></i>
                            <span>${item.rating}</span>
                        </div>
                        <div class="stat-box">
                            <i class="fa-solid fa-calendar-days"></i>
                            <span>${item.availability.replace(' ', '<br>')}</span>
                        </div>
                    </div>

                    <div class="services-section">
                        <h4><i class="fa-solid fa-gears"></i> Services:</h4>
                        <div class="services-list">
                            ${servicesHTML}
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="btn-book" onclick="window.location.href='schedule.html'"><i class="fa-solid fa-calendar-check"></i> Book Now</button>
                    <button class="btn-see" onclick="window.location.href='providerList.html'"><i class="fa-solid fa-user-tie"></i> See Provider</button>
                </div>
            </div>
        `;
        areaGrid.innerHTML += cardHTML;
    });
}

function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const areaVal = areaFilter.value;
    const serviceVal = serviceFilter.value;
    const availVal = availabilityFilter.value;

    const filteredData = areasData.filter(item => {
        const matchesSearch = item.areaName.toLowerCase().includes(searchTerm) || 
                              item.description.toLowerCase().includes(searchTerm);
        
        const matchesArea = areaVal === 'all' || item.areaName === areaVal;
        const matchesService = serviceVal === 'all' || item.services.includes(serviceVal);
        const matchesAvail = availVal === 'all' || item.availability === availVal;

        return matchesSearch && matchesArea && matchesService && matchesAvail;
    });

    renderCards(filteredData);
}

searchInput.addEventListener('input', applyFilters);
searchBtn.addEventListener('click', applyFilters); // Also run on search button click
areaFilter.addEventListener('change', applyFilters);
serviceFilter.addEventListener('change', applyFilters);
availabilityFilter.addEventListener('change', applyFilters);

clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    areaFilter.value = 'all';
    serviceFilter.value = 'all';
    availabilityFilter.value = 'all';
    applyFilters();
});

renderCards(areasData);