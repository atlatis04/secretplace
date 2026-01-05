import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabase.js'
import { resizeImage, getOptimizedFileName } from './src/imageResizer.js'

let map;
let markers = [];
let currentPlace = null;
let currentUser = null;
let userPhotoCount = 0; // Total photos uploaded by user

// Initialize userSettings with default values (loaded from localStorage later)
let userSettings = { handedness: 'right', language: 'ko' };

// Date filter range
let currentFilterDateRange = { from: null, to: null };

// 초기 위치 (서울)
const DEFAULT_COORD = [37.5665, 126.9780];

// Security: HTML Escape function to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// DOM Elements
const modalOverlay = document.getElementById('modal-overlay');
const placeForm = document.getElementById('place-form');
const sidebar = document.getElementById('sidebar');
const listToggleBtn = document.getElementById('list-toggle-btn');
const closeSidebar = document.getElementById('close-sidebar');
const closeModal = document.getElementById('close-modal');
const placeList = document.getElementById('place-list');
const deleteBtn = document.getElementById('delete-btn');
const toast = document.getElementById('toast');

// Sidebar Filter Elements
const colorFilterGroup = document.getElementById('color-filter-group');
const dateFilterBtn = document.getElementById('date-filter-btn');
const dateFilterPanel = document.getElementById('date-filter-panel');
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const applyDateFilterBtn = document.getElementById('apply-date-filter');
const clearDateFilterBtn = document.getElementById('clear-date-filter');

let currentFilterColor = 'all';
let currentDateFrom = null;
let currentDateTo = null;

// New Elements
const starRating = document.getElementById('star-rating');
const stars = starRating.querySelectorAll('.star');
const ratingInput = document.getElementById('rating');
const photoInput = document.getElementById('photo-input');
const photoAddBtn = document.getElementById('photo-add-btn');
const photoPreviewList = document.getElementById('photo-preview-list');
const placeAddressInput = document.getElementById('place-address');
const placeCommentInput = document.getElementById('place-comment');
const placeFilter = document.getElementById('place-filter');

// Auth Elements
const authOverlay = document.getElementById('auth-overlay');
const authToggleBtn = document.getElementById('auth-toggle-btn');
const closeAuth = document.getElementById('close-auth');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authTitle = document.getElementById('auth-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchBtn = document.getElementById('auth-switch-btn');
const authNaver = document.getElementById('auth-naver');
const authKakao = document.getElementById('auth-kakao');

// New User Info Elements
const userInfoPanel = document.getElementById('user-info-panel');
const userInfoEmail = document.getElementById('user-info-email');
const userInfoProvider = document.getElementById('user-info-provider');
const userAvatarInitial = document.getElementById('user-avatar-initial');
const logoutBtn = document.getElementById('logout-btn');
const geoBtn = document.getElementById('geo-btn');

// Password Change Elements
const changePasswordBtn = document.getElementById('change-password-btn');
const passwordChangeOverlay = document.getElementById('password-change-overlay');
const closePasswordChange = document.getElementById('close-password-change');
const cancelPasswordChange = document.getElementById('cancel-password-change');
const passwordChangeForm = document.getElementById('password-change-form');
const currentPasswordInput = document.getElementById('current-password');

const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const passwordChangeMsg = document.getElementById('password-change-msg');
const currentPasswordStatus = document.getElementById('current-password-status');

// Lightbox Elements
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const closeLightbox = document.getElementById('close-lightbox');
const prevLightbox = document.getElementById('prev-lightbox');
const nextLightbox = document.getElementById('next-lightbox');

let lightboxImages = [];
let currentLightboxIndex = 0;

let uploadedPhotos = [];
let allPlaces = [];
let isSignUpMode = false;

// Initialize Map
function initMap() {
    map = L.map('map').setView(DEFAULT_COORD, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 클릭 시 모달 열기
    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        // 폼 먼저 열기
        openModal(null, lat, lng, '위치 정보를 불러오는 중...');

        // 비동기로 주소 찾기
        reverseGeocode(lat, lng).then(address => {
            // 모달이 아직 열려있고 입력값이 기본값인 경우에만 업데이트
            const addrInput = document.getElementById('place-address');
            if (!modalOverlay.classList.contains('hidden') && addrInput) {
                addrInput.value = address;
            }
        });
    });

    // Get user's current location and center map
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 13);
            },
            (error) => {
                console.log('Geolocation error:', error.message);
                // Keep default location (Seoul) if geolocation fails
            }
        );
    }

    // Auth State Check
    supabase.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateAuthUI();

        loadPlaces();
    });
}

// Load Places from Supabase
async function loadPlaces() {
    let query = supabase.from('places').select('*');

    if (currentUser) {
        query = query.eq('user_id', currentUser.id);
    } else {
        // 비로그인 시 공공 데이터만 보거나 비워둠
        query = query.eq('is_public', true).limit(20);
    }

    const { data: places, error } = await query;

    if (error) {
        if (import.meta.env.DEV) {
            console.error('Error loading places:', error);
        }
        showToast('데이터를 불러오는 중 오류가 발생했습니다.');
        return;
    }

    allPlaces = places || [];

    // Calculate total photo count from all places
    if (currentUser) {
        userPhotoCount = allPlaces.reduce((total, place) => {
            return total + (place.photo_urls?.length || 0);
        }, 0);
    }

    applyFilters(); // Apply current search/color filters to the fetched data
    updateAuthUI(); // Update UI with photo count
}

// Render list with categories and filter
function renderFilteredList(placesToRender) {
    placeList.innerHTML = '';

    // 기존 마커 제거 및 재생성
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Group by category (e.g., "Seoul", "Busan" or specific city/district)
    const grouped = {};
    placesToRender.forEach(p => {
        addMarkerToMap(p);
        const cat = p.address?.split(' ')[0] || '기타'; // First word of address as category
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });

    Object.keys(grouped).sort().forEach(cat => {
        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerText = cat;
        placeList.appendChild(header);

        grouped[cat].forEach(place => addToList(place));
    });
}

// Add Marker
function addMarkerToMap(place) {
    const icon = L.divIcon({
        className: 'custom-pin-icon',
        html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); transform: translate(-50%, -50%); cursor: pointer;">
                <path fill="${place.color}" d="M12 0C7.58 0 4 3.58 4 8c0 5.25 7 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
               </svg>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    const marker = L.marker([place.latitude, place.longitude], { icon }).addTo(map);

    const photosHtml = (place.photo_urls && place.photo_urls.length > 0)
        ? `<div class="popup-gallery">
            ${place.photo_urls.map((url, idx) => `<img src="${url}" onclick='window.showLightbox(${JSON.stringify(place.photo_urls)}, ${idx})'>`).join('')}
           </div>`
        : '';

    const commentHtml = place.comment
        ? `<p class="popup-comment">${escapeHtml(place.comment)}</p>`
        : '';

    const popupContent = `
        <div class="popup-content">
            <h3><span style="color: ${place.color}">●</span> ${escapeHtml(place.name)}</h3>
            ${photosHtml}
            <div class="popup-rating">${'★'.repeat(place.rating)}${'☆'.repeat(5 - place.rating)}</div>
            <p style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">${place.visit_date || '날짜 미지정'}</p>
            ${commentHtml}
            <div class="popup-actions">
                <button class="edit-popup-btn" onclick="window.editPlace('${place.id}')">수정/상세</button>
            </div>
        </div>
    `;

    marker.bindPopup(popupContent, {
        offset: userSettings.handedness === 'left' ? [20, -20] : [-20, -20], // Dynamic offset based on handedness
        autoPan: true,
        autoPanPadding: userSettings.handedness === 'left' ? [80, 20] : [20, 80] // Extra padding on the side with controls
    });
    marker.placeId = place.id;
    markers.push(marker);
}

// Add to Sidebar List
function addToList(place) {
    const item = document.createElement('div');
    item.className = 'place-item';

    // Generate stars HTML (consistent with modal)
    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
        starsHtml += `<span style="color: ${i <= place.rating ? '#f59e0b' : '#475569'}">★</span>`;
    }

    item.innerHTML = `
        <button class="delete-item-btn" title="삭제" onclick="event.stopPropagation(); window.deletePlaceDirectly('${place.id}')">&times;</button>
        <h3>${escapeHtml(place.name)}</h3>
        <div class="meta">
            <div class="sidebar-stars">${starsHtml}</div>
            <div style="display: flex; align-items: center;">
                <span class="color-bullet" style="background-color: ${place.color}"></span>
                <span>${place.visit_date || ''}</span>
            </div>
        </div>
    `;
    item.onclick = () => {
        map.flyTo([place.latitude, place.longitude], 16);
        const marker = markers.find(m => m.placeId === place.id);
        if (marker) marker.openPopup();
        if (window.innerWidth < 768) sidebar.classList.add('hidden');
    };

    placeList.appendChild(item);
}

// Reverse Geocoding using Nominatim
async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'ko' }
        });
        const data = await response.json();

        // Simplified address logic: "City District" (e.g., 서울특별시 종로구)
        if (data.address) {
            const addr = data.address;
            const city = addr.city || addr.province || addr.state || '';
            const district = addr.borough || addr.suburb || addr.district || addr.city_district || '';

            if (city && district) return `${city} ${district}`;
            return city || district || data.display_name?.split(', ').slice(0, 1).join(' ') || '주소 정보 없음';
        }

        return data.display_name?.split(', ').slice(0, 2).join(' ') || '주소 정보 없음';
    } catch (err) {
        if (import.meta.env.DEV) {
            console.error('Geocoding error:', err);
        }
        return '주소를 가져오지 못했습니다';
    }
}

// Modal Logic
function openModal(place = null, lat = null, lng = null, address = '') {
    currentPlace = place;
    modalOverlay.classList.remove('hidden');

    // 초기화
    uploadedPhotos = place ? [...(place.photo_urls || [])] : [];
    updatePhotoPreviews();

    if (place) {
        document.getElementById('modal-title').innerText = '장소 정보 수정';
        document.getElementById('place-id').value = place.id;
        document.getElementById('place-name').value = place.name;
        document.getElementById('place-address').value = place.address || '';
        document.getElementById('place-comment').value = place.comment || '';
        document.getElementById('visit-date').value = place.visit_date || '';
        updateStars(place.rating);

        // Fix: Populate lat/lng for existing places to prevent location change during edit
        document.getElementById('place-lat').value = place.latitude;
        document.getElementById('place-lng').value = place.longitude;

        const radios = document.getElementsByName('color');
        radios.forEach(r => {
            if (r.value === place.color) r.checked = true;
        });

        deleteBtn.classList.remove('hidden');
    } else {
        document.getElementById('modal-title').innerText = '새 장소 기록';
        placeForm.reset();
        document.getElementById('place-id').value = '';
        document.getElementById('place-lat').value = lat;
        document.getElementById('place-lng').value = lng;
        document.getElementById('place-address').value = address;
        document.getElementById('place-comment').value = '';

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('visit-date').value = today;

        updateStars(5);
        deleteBtn.classList.add('hidden');
    }
}

// Star Rating Interaction
stars.forEach(star => {
    star.onclick = () => {
        const val = parseInt(star.getAttribute('data-value'));
        updateStars(val);
    };
});

function updateStars(val) {
    ratingInput.value = val;
    stars.forEach(star => {
        const starVal = parseInt(star.getAttribute('data-value'));
        star.classList.toggle('active', starVal <= val);
    });
}

// Photo Upload Logic
photoAddBtn.onclick = () => photoInput.click();

photoInput.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Check upload limits
    const currentPinPhotos = uploadedPhotos.length;
    const PER_PIN_LIMIT = 3;
    const TOTAL_USER_LIMIT = 300;

    // Check per-pin limit
    if (currentPinPhotos + files.length > PER_PIN_LIMIT) {
        showToast(`핀당 최대 ${PER_PIN_LIMIT}장까지 업로드 가능합니다.`);
        return;
    }

    // Check total user limit
    if (userPhotoCount + files.length > TOTAL_USER_LIMIT) {
        showToast(`총 ${TOTAL_USER_LIMIT}장까지 업로드 가능합니다. (현재: ${userPhotoCount}장)`);
        return;
    }

    // Security: File validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of files) {
        // Validate file type
        if (!allowedTypes.includes(file.type)) {
            showToast('이미지 파일만 업로드 가능합니다 (JPG, PNG, GIF, WebP)');
            continue;
        }

        // Validate file size
        if (file.size > maxSize) {
            showToast(`파일 크기는 5MB 이하여야 합니다 (${file.name})`);
            continue;
        }

        showToast('사진 최적화 중...');

        try {
            // Resize and convert to WebP
            const optimizedBlob = await resizeImage(file);
            const optimizedFileName = getOptimizedFileName(file.name);

            showToast('사진 업로드 중...');

            const { data, error } = await supabase.storage
                .from('place-photos')
                .upload(optimizedFileName, optimizedBlob, {
                    contentType: 'image/webp'
                });

            if (error) {
                if (import.meta.env.DEV) {
                    console.error('Upload error:', error);
                }
                showToast('사진 업로드 실패');
                continue;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('place-photos')
                .getPublicUrl(optimizedFileName);

            uploadedPhotos.push(publicUrl);
            userPhotoCount++; // Increment total photo count
        } catch (err) {
            console.error('Image processing error:', err);
            showToast('이미지 처리 실패');
            continue;
        }
    }

    updatePhotoPreviews();
    updateAuthUI(); // Update photo count display
    showToast('업로드 완료');
};

function updatePhotoPreviews() {
    photoPreviewList.innerHTML = '';
    uploadedPhotos.forEach((url, index) => {
        const item = document.createElement('div');
        item.className = 'preview-item';
        item.innerHTML = `
            <img src="${url}" alt="PREVIEW" onclick='window.showLightbox(${JSON.stringify(uploadedPhotos)}, ${index})'>
            <button type="button" class="remove-photo" onclick="window.removePhoto(${index})">&times;</button>
        `;
        photoPreviewList.appendChild(item);
    });
}

window.removePhoto = (index) => {
    uploadedPhotos.splice(index, 1);
    updatePhotoPreviews();
};

// Save Place
placeForm.onsubmit = async (e) => {
    e.preventDefault();

    const id = document.getElementById('place-id').value;
    const name = document.getElementById('place-name').value;
    const address = document.getElementById('place-address').value;
    const comment = document.getElementById('place-comment').value;
    const lat = parseFloat(document.getElementById('place-lat').value);
    const lng = parseFloat(document.getElementById('place-lng').value);
    const date = document.getElementById('visit-date').value;
    const rating = parseInt(document.getElementById('rating').value);
    const color = document.querySelector('input[name="color"]:checked').value;

    const placeData = {
        name,
        address,
        comment,
        latitude: lat || (currentPlace ? currentPlace.latitude : 0),
        longitude: lng || (currentPlace ? currentPlace.longitude : 0),
        visit_date: date || null,
        rating,
        color,
        photo_urls: uploadedPhotos,
        is_public: true,
        user_id: currentUser?.id || null
    };

    let result;
    if (id) {
        result = await supabase.from('places').update(placeData).eq('id', id);
    } else {
        result = await supabase.from('places').insert([placeData]);
    }

    if (result.error) {
        showToast('저장 중 오류가 발생했습니다.');
        console.error(result.error);
    } else {
        showToast('성공적으로 저장되었습니다.');
        modalOverlay.classList.add('hidden');
        loadPlaces();
    }
};

// Delete Place
deleteBtn.onclick = async () => {
    const id = document.getElementById('place-id').value;
    if (!id) return;
    if (!confirm('정말로 이 기록을 삭제할까요?')) return;

    showToast('삭제 중...');
    const { error } = await supabase.from('places').delete().eq('id', id);

    if (error) {
        console.error('Delete error:', error);
        showToast('삭제 중 오류가 발생했습니다.');
    } else {
        showToast('삭제되었습니다.');
        modalOverlay.classList.add('hidden');
        loadPlaces();
    }
};

// Delete Place Directly from list
window.deletePlaceDirectly = async (id) => {
    if (!confirm('정말로 이 기록을 삭제할까요?')) return;

    showToast('삭제 중...');
    const { error } = await supabase.from('places').delete().eq('id', id);

    if (error) {
        console.error('Delete error:', error);
        showToast('삭제 중 오류가 발생했습니다.');
    } else {
        showToast('삭제되었습니다.');
        loadPlaces();
    }
};

// Global function for Leaflet popup
window.editPlace = async (id) => {
    const { data, error } = await supabase.from('places').select('*').eq('id', id).single();
    if (data) openModal(data);
};

// Lightbox Globals
window.showLightbox = (images, index) => {
    lightboxImages = images;
    currentLightboxIndex = index;
    updateLightboxImage();
    lightbox.classList.remove('hidden');
};

function updateLightboxImage() {
    lightboxImg.src = lightboxImages[currentLightboxIndex];
    // Show/hide nav buttons based on image count
    const hasMultiple = lightboxImages.length > 1;
    prevLightbox.style.display = hasMultiple ? 'flex' : 'none';
    nextLightbox.style.display = hasMultiple ? 'flex' : 'none';
}

prevLightbox.onclick = (e) => {
    e.stopPropagation();
    currentLightboxIndex = (currentLightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    updateLightboxImage();
};

nextLightbox.onclick = (e) => {
    e.stopPropagation();
    currentLightboxIndex = (currentLightboxIndex + 1) % lightboxImages.length;
    updateLightboxImage();
};

closeLightbox.onclick = () => lightbox.classList.add('hidden');
lightbox.onclick = (e) => {
    if (e.target === lightbox) lightbox.classList.add('hidden');
};

// Filtering logic (Search + Color + Date Range)
function applyFilters() {
    console.log('applyFilters called, allPlaces:', allPlaces.length);
    const searchVal = placeFilter.value.toLowerCase();
    const filtered = allPlaces.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchVal) ||
            (p.address && p.address.toLowerCase().includes(searchVal));
        const matchesColor = currentFilterColor === 'all' || p.color === currentFilterColor;

        // Date range filtering - only apply if date filter is set
        let matchesDate = true;
        if (currentFilterDateRange.from || currentFilterDateRange.to) {
            const visitDate = p.visit_date ? new Date(p.visit_date) : null;
            if (visitDate) {
                if (currentFilterDateRange.from) {
                    const fromDate = new Date(currentFilterDateRange.from);
                    if (visitDate < fromDate) matchesDate = false;
                }
                if (currentFilterDateRange.to) {
                    const toDate = new Date(currentFilterDateRange.to);
                    if (visitDate > toDate) matchesDate = false;
                }
            } else {
                // If place has no visit_date, exclude it when date filter is active
                matchesDate = false;
            }
        }
        // If no date filter is set, matchesDate remains true for all places

        return matchesSearch && matchesColor && matchesDate;
    });
    console.log('Filtered places:', filtered.length);
    renderFilteredList(filtered);
}

placeFilter.oninput = applyFilters;

colorFilterGroup.onclick = (e) => {
    const dot = e.target.closest('.color-filter-dot');
    if (!dot) return;

    colorFilterGroup.querySelectorAll('.color-filter-dot').forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    currentFilterColor = dot.dataset.color;
    applyFilters();
};

// Date filter event listeners
if (dateFilterBtn) {
    dateFilterBtn.onclick = (e) => {
        e.stopPropagation();
        dateFilterPanel.classList.toggle('hidden');
        // Close user info panel if open
        userInfoPanel.classList.add('hidden');
    };
}

if (applyDateFilterBtn) {
    applyDateFilterBtn.onclick = () => {
        try {
            console.log('Apply date filter clicked');
            currentDateFrom = dateFromInput.value;
            currentDateTo = dateToInput.value;
            console.log('Date range:', currentDateFrom, 'to', currentDateTo);

            // Check if at least one date is set
            if (!currentDateFrom && !currentDateTo) {
                showToast('시작일과 종료일을 설정해야만 기간 필터가 적용됩니다.');
                dateFilterPanel.classList.add('hidden');
                return;
            }

            // Sync with currentFilterDateRange
            currentFilterDateRange.from = currentDateFrom;
            currentFilterDateRange.to = currentDateTo;

            applyFilters();
            dateFilterPanel.classList.add('hidden');

            // Update filter button background color to blue
            const dateFilterBtn = document.getElementById('date-filter-btn');
            if (dateFilterBtn) {
                dateFilterBtn.style.background = 'rgba(59, 130, 246, 0.8)'; // Blue background
            }

            const fromStr = currentDateFrom || '시작일 없음';
            const toStr = currentDateTo || '종료일 없음';
            showToast(`기간 필터 적용: ${fromStr} ~ ${toStr}`);
        } catch (error) {
            console.error('Error applying date filter:', error);
            showToast('기간 필터 적용 중 오류가 발생했습니다.');
        }
    };
} else {
    console.error('Apply date filter button not found');
}

if (clearDateFilterBtn) {
    clearDateFilterBtn.onclick = () => {
        dateFromInput.value = '';
        dateToInput.value = '';
        currentDateFrom = null;
        currentDateTo = null;

        // Sync with currentFilterDateRange
        currentFilterDateRange.from = null;
        currentFilterDateRange.to = null;

        applyFilters();
        dateFilterPanel.classList.add('hidden');

        // Reset filter button background color
        const dateFilterBtn = document.getElementById('date-filter-btn');
        if (dateFilterBtn) {
            dateFilterBtn.style.background = 'white'; // Reset to white
        }

        showToast('기간 필터가 초기화되었습니다.');
    };
}

// Close date filter panel when clicking elsewhere
document.addEventListener('click', (e) => {
    if (!dateFilterPanel.contains(e.target) && e.target !== dateFilterBtn) {
        dateFilterPanel.classList.add('hidden');
    }
});
dateFilterPanel.onclick = (e) => e.stopPropagation();


// Auth Logic
function updateAuthUI() {
    if (currentUser) {
        authOverlay.classList.add('hidden'); // Force logged in users past the gate
        authToggleBtn.innerHTML = '<span class="icon">👤</span>';
        authToggleBtn.title = `내 정보 (${currentUser.email})`;

        // Populate User Info Panel
        userInfoEmail.innerText = currentUser.email;
        userAvatarInitial.innerText = currentUser.email[0].toUpperCase();
        userInfoProvider.innerText = currentUser.app_metadata.provider === 'email' ? '이메일 로그인' : `${currentUser.app_metadata.provider} 로그인`;

        // Update photo count display
        const photoCountEl = document.getElementById('user-photo-count');
        if (photoCountEl) {
            photoCountEl.innerText = `${userPhotoCount} / 300`;
        }
    } else {
        authOverlay.classList.remove('hidden'); // Show login gate for guests
        authToggleBtn.innerHTML = '<span class="icon">👤</span>';
        authToggleBtn.title = '로그인';
        userInfoPanel.classList.add('hidden');
    }

}

authToggleBtn.onclick = (e) => {
    e.stopPropagation();
    if (currentUser) {
        userInfoPanel.classList.toggle('hidden');
    } else {
        authOverlay.classList.remove('hidden');
    }
};

// Toggle panel off when clicking elsewhere
document.addEventListener('click', () => userInfoPanel.classList.add('hidden'));
userInfoPanel.onclick = (e) => e.stopPropagation();

logoutBtn.onclick = async () => {
    if (confirm('로그아웃 하시겠습니까?')) {
        await supabase.auth.signOut();
        showToast('로그아웃 되었습니다.');
        userInfoPanel.classList.add('hidden');
    }
};

// Settings Modal with Handedness Implementation
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const handednessSelect = document.getElementById('handedness-select');
const languageSelect = document.getElementById('language-select');

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem('userSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        return settings;
    }
    return { handedness: 'right', language: 'ko' };
}

// Save settings to localStorage
function saveSettings(settings) {
    localStorage.setItem('userSettings', JSON.stringify(settings));
}

// Apply handedness setting
function applyHandedness(handedness) {
    const controls = document.querySelector('.map-controls-repositioned');
    const geoBtn = document.getElementById('geo-btn');

    if (handedness === 'right') {
        // Right-handed: buttons on right side, aligned with zoom buttons height
        controls.style.left = 'auto';
        controls.style.right = '10px';
        controls.style.top = '10px'; // Align with zoom buttons (approx height)

        // Geo button on right (bottom)
        geoBtn.style.left = 'auto';
        geoBtn.style.right = '20px';

        // Panels on right side
        const userInfoPanel = document.getElementById('user-info-panel');
        const dateFilterPanel = document.getElementById('date-filter-panel');
        const sidebar = document.getElementById('sidebar');

        if (userInfoPanel) {
            userInfoPanel.style.left = 'auto';
            userInfoPanel.style.right = '55px';
            userInfoPanel.style.top = '10px'; // Align with button height
        }
        if (dateFilterPanel) {
            dateFilterPanel.style.left = 'auto';
            dateFilterPanel.style.right = '55px';
            dateFilterPanel.style.top = '50px'; // Below user info panel
        }
        if (sidebar) {
            sidebar.style.left = 'auto';
            sidebar.style.right = '60px';
        }
    } else {
        // Left-handed: buttons on left side, below zoom buttons
        controls.style.left = '10px';
        controls.style.right = 'auto';
        controls.style.top = '80px'; // Below zoom buttons

        // Geo button on left (bottom)
        geoBtn.style.right = 'auto';
        geoBtn.style.left = '20px';

        // Panels on left side
        const userInfoPanel = document.getElementById('user-info-panel');
        const dateFilterPanel = document.getElementById('date-filter-panel');
        const sidebar = document.getElementById('sidebar');

        if (userInfoPanel) {
            userInfoPanel.style.left = '55px';
            userInfoPanel.style.right = 'auto';
            userInfoPanel.style.top = '80px'; // Below zoom buttons
        }
        if (dateFilterPanel) {
            dateFilterPanel.style.left = '55px';
            dateFilterPanel.style.right = 'auto';
            dateFilterPanel.style.top = '120px'; // Below user info panel
        }
        if (sidebar) {
            sidebar.style.left = '60px';
            sidebar.style.right = 'auto';
        }
    }

    // Update popup offsets for existing markers if any
    updateMarkerPopupOffsets(handedness);
}

function updateMarkerPopupOffsets(handedness) {
    // This helper updates options for future opens
    if (typeof markers !== 'undefined') {
        markers.forEach(marker => {
            if (marker.getPopup()) {
                marker.getPopup().options.offset = handedness === 'left' ? [20, -20] : [-20, -20];
                marker.getPopup().options.autoPanPadding = handedness === 'left' ? [80, 20] : [20, 80];
            }
        });
    }
}

// Initialize settings on page load
const savedSettings = loadSettings();
userSettings = savedSettings; // Update global variable
applyHandedness(userSettings.handedness);

if (settingsBtn) {
    settingsBtn.onclick = () => {
        // Load current settings into selects
        const settings = loadSettings();
        handednessSelect.value = settings.handedness;
        languageSelect.value = settings.language;
        settingsModal.classList.remove('hidden');
        userInfoPanel.classList.add('hidden');
    };
}

if (closeSettings) {
    closeSettings.onclick = () => {
        settingsModal.classList.add('hidden');
    };
}

if (saveSettingsBtn) {
    saveSettingsBtn.onclick = () => {
        const newSettings = {
            handedness: handednessSelect.value,
            language: languageSelect.value
        };
        saveSettings(newSettings);
        applyHandedness(newSettings.handedness);
        settingsModal.classList.add('hidden');
        showToast('설정이 저장되었습니다.');
    };
}

// Close settings modal when clicking outside
settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
    }
});

authSwitchBtn.onclick = () => {
    isSignUpMode = !isSignUpMode;
    authTitle.innerText = isSignUpMode ? '회원가입' : 'Place Map 시작하기';
    authSubmitBtn.innerText = isSignUpMode ? '가입하기' : '로그인';
    authSwitchBtn.innerText = isSignUpMode ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입';
};

// Social Auth
const handleSocialLogin = async (provider) => {
    showToast(`${provider} 로그인 중...`);
    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin
        }
    });
    if (error) showToast(error.message);
};

authNaver.onclick = () => showToast('현재 준비 중인 기능입니다.');
authKakao.onclick = () => showToast('현재 준비 중인 기능입니다.');

authForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;

    showToast(isSignUpMode ? '가입 중...' : '로그인 중...');

    let result;
    if (isSignUpMode) {
        result = await supabase.auth.signUp({ email, password });
    } else {
        result = await supabase.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
        showToast(result.error.message);
    } else {
        if (isSignUpMode) {
            showToast('가입 성공! 이메일을 확인해 주세요.');
        } else {
            showToast('로그인 성공!');
            authOverlay.classList.add('hidden');
        }
        authForm.reset();
    }
};

// Password Change Logic
// Password Change Logic
function setPasswordMsg(msg, type = 'error') {
    passwordChangeMsg.className = `message-container ${type}`;
    passwordChangeMsg.textContent = msg;
    passwordChangeMsg.classList.remove('hidden');
}

function clearPasswordMsg() {
    passwordChangeMsg.classList.add('hidden');
    passwordChangeMsg.textContent = '';
}

changePasswordBtn.onclick = () => {
    passwordChangeForm.reset();
    clearPasswordMsg();
    currentPasswordStatus.className = 'status-indicator';
    passwordChangeOverlay.classList.remove('hidden');
};

const closePasswordModal = () => passwordChangeOverlay.classList.add('hidden');
closePasswordChange.onclick = closePasswordModal;
cancelPasswordChange.onclick = closePasswordModal;

// Real-time Current Password Verification
currentPasswordInput.onblur = async () => {
    const currentPassword = currentPasswordInput.value;
    if (!currentPassword) return;

    currentPasswordStatus.className = 'status-indicator'; // Reset

    const { error } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
    });

    if (error) {
        currentPasswordStatus.classList.add('error');
    } else {
        currentPasswordStatus.classList.add('success');
    }
};

passwordChangeForm.onsubmit = async (e) => {
    e.preventDefault();
    clearPasswordMsg();

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // 1. Check if new passwords match
    if (newPassword !== confirmPassword) {
        setPasswordMsg('새 비밀번호가 일치하지 않습니다.');
        return;
    }

    // 2. Check password length
    if (newPassword.length < 6) {
        setPasswordMsg('비밀번호는 6자 이상이어야 합니다.');
        return;
    }

    // 3. Verify current password (Final check)
    const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
    });

    if (verifyError) {
        setPasswordMsg('현재 비밀번호가 일치하지 않습니다.');
        currentPasswordStatus.className = 'status-indicator error';
        return;
    }

    // 4. Update password
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (updateError) {
        setPasswordMsg('비밀번호 변경 실패: ' + updateError.message);
    } else {
        showToast('비밀번호가 성공적으로 변경되었습니다.');
        closePasswordModal();
    }
};

// UI Events
listToggleBtn.onclick = () => sidebar.classList.toggle('hidden');
closeSidebar.onclick = () => sidebar.classList.add('hidden');
closeModal.onclick = () => modalOverlay.classList.add('hidden');
ratingInput.oninput = null; // Remove old listener

// Geolocation Button
geoBtn.onclick = () => {
    if (!navigator.geolocation) {
        showToast('브라우저가 위치 정보를 지원하지 않습니다.');
        return;
    }

    showToast('현재 위치를 찾는 중...');
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            map.flyTo([latitude, longitude], 16);
            showToast('현재 위치로 이동했습니다.');
        },
        (err) => {
            showToast('위치 정보를 가져오지 못했습니다.');
            console.error(err);
        }
    );
};

function showToast(msg) {
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Start
initMap();
