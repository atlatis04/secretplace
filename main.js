import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabase.js'

let map;
let markers = [];
let currentPlace = null;

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

let currentFilterColor = 'all';

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
let currentUser = null;
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
    applyFilters(); // Apply current search/color filters to the fetched data
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
        className: 'custom-div-icon',
        html: `<div class="marker-pin" style="background: ${place.color}"></div>`,
        iconSize: [30, 42],
        iconAnchor: [15, 42]
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

    marker.bindPopup(popupContent);
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

        showToast('사진 업로드 중...');

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { data, error } = await supabase.storage
            .from('place-photos')
            .upload(filePath, file);

        if (error) {
            if (import.meta.env.DEV) {
                console.error('Upload error:', error);
            }
            showToast('사진 업로드 실패');
            continue;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('place-photos')
            .getPublicUrl(filePath);

        uploadedPhotos.push(publicUrl);
    }

    updatePhotoPreviews();
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

// Filtering logic (Search + Color)
function applyFilters() {
    const searchVal = placeFilter.value.toLowerCase();
    const filtered = allPlaces.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchVal) ||
            (p.address && p.address.toLowerCase().includes(searchVal));
        const matchesColor = currentFilterColor === 'all' || p.color === currentFilterColor;
        return matchesSearch && matchesColor;
    });
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
