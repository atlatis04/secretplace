import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabase.js'
import { resizeImage, getOptimizedFileName } from './src/imageResizer.js'

let map;
let markers = [];
let currentPlace = null;
let currentUser = null;
let userPhotoCount = 0; // Total photos uploaded by user
let userLocationMarker = null; // Marker for the user's current location
let userLocationCircle = null; // Circle showing the accuracy radius of the user's location
let searchMarker = null; // Temporary marker for a selected search result

// Initialize userSettings with default values (loaded from localStorage later)
let userSettings = { handedness: 'right', language: 'ko' };

// Date filter range
let currentFilterDateRange = { from: null, to: null };

// 초기 위치 - 언어에 따라 다름 (한글: 서울, 영어: LA)
const COORDS = {
    ko: [37.5665, 126.9780], // Seoul
    en: [34.0522, -118.2437] // Los Angeles
};

// Translation Dictionary
const translations = {
    ko: {
        // Photo Upload Messages
        'photo.perPinLimit': (limit) => `핀당 최대 ${limit}장까지 업로드 가능합니다.`,
        'photo.totalLimit': (limit, current) => `총 ${limit}장까지 업로드 가능합니다. (현재: ${current}장)`,
        'photo.imageOnly': '이미지 파일만 업로드 가능합니다 (JPG, PNG, GIF, WebP)',
        'photo.sizeLimit': (name) => `파일 크기는 5MB 이하여야 합니다 (${name})`,
        'photo.optimizing': '사진 최적화 중...',
        'photo.uploading': '사진 업로드 중...',
        'photo.uploadFailed': '사진 업로드 실패',
        'photo.processingFailed': '이미지 처리 실패',
        'photo.uploadComplete': '업로드 완료',

        // Save/Delete Messages
        'save.error': '저장 중 오류가 발생했습니다.',
        'save.success': '성공적으로 저장되었습니다.',
        'delete.confirm': '정말로 이 기록을 삭제할까요?',
        'delete.deleting': '삭제 중...',
        'delete.error': '삭제 중 오류가 발생했습니다.',
        'delete.success': '삭제되었습니다.',

        // Date Filter Messages
        'dateFilter.required': '시작일과 종료일을 설정해야만 기간 필터가 적용됩니다.',
        'dateFilter.applied': (from, to) => `기간 필터 적용: ${from} ~ ${to}`,
        'dateFilter.error': '기간 필터 적용 중 오류가 발생했습니다.',
        'dateFilter.cleared': '기간 필터가 초기화되었습니다.',
        'dateFilter.noStart': '시작일 없음',
        'dateFilter.noEnd': '종료일 없음',

        // Auth Messages
        'auth.logoutConfirm': '로그아웃 하시겠습니까?',
        'auth.loggedOut': '로그아웃 되었습니다.',
        'auth.settingsSaved': '설정이 저장되었습니다.',
        'auth.comingSoon': '현재 준비 중인 기능입니다.',
        'auth.signingUp': '가입 중...',
        'auth.loggingIn': '로그인 중...',
        'auth.signupSuccess': '가입 성공! 이메일을 확인해 주세요.',
        'auth.loginSuccess': '로그인 성공!',
        'auth.emailLogin': '이메일 로그인',

        // Password Change Messages
        'password.mismatch': '새 비밀번호가 일치하지 않습니다.',
        'password.tooShort': '비밀번호는 6자 이상이어야 합니다.',
        'password.currentIncorrect': '현재 비밀번호가 일치하지 않습니다.',
        'password.changeFailed': '비밀번호 변경 실패: ',
        'password.changeSuccess': '비밀번호가 성공적으로 변경되었습니다.',

        // Geolocation Messages
        'geo.notSupported': '브라우저가 위치 정보를 지원하지 않습니다.',
        'geo.finding': '현재 위치를 찾는 중...',
        'geo.moved': '현재 위치로 이동했습니다.',
        'geo.failed': '위치 정보를 가져오지 못했습니다.',

        // Modal Titles
        'modal.editPlace': '장소 정보 수정',
        'modal.newPlace': '새 장소 기록',

        // Other UI Text
        'address.none': '주소 정보 없음',
        'address.failed': '주소를 가져오지 못했습니다',

        // Social Login
        'social.loginWith': (provider) => `${provider} 로그인 중...`,

        // UI Text - Sidebar
        'ui.placeList': '장소 목록',
        'ui.searchPlaceholder': '장소명 또는 지역 검색...',

        // UI Text - Place Modal
        'ui.placeName': '장소명',
        'ui.location': '위치 (주소)',
        'ui.comment': '코멘트',
        'ui.visitDate': '방문 날짜',
        'ui.rating': '평점',
        'ui.pinColor': '핀 색상',
        'ui.addPhotos': '사진 첨부 (기기에서 선택/촬영)',
        'ui.addPhoto': '사진 추가',
        'ui.save': '저장하기',
        'ui.delete': '삭제하기',
        'ui.editDetails': '수정/상세',

        // UI Text - Placeholders
        'ui.enterPlaceName': '장소 이름을 입력하세요',
        'ui.autoFilled': '지도 클릭 시 자동으로 입력됩니다',
        'ui.leaveNote': '이 장소에 대한 기록을 남겨보세요',

        // UI Text - Auth Modal
        'ui.startMapNote': 'MapNote 시작하기',
        'ui.signUp': '회원가입',
        'ui.loginRequired': '지도를 이용하려면 로그인이 필요합니다.',
        'ui.email': '이메일',
        'ui.password': '비밀번호',
        'ui.login': '로그인',
        'ui.noAccount': '계정이 없으신가요? 회원가입',
        'ui.haveAccount': '이미 계정이 있으신가요? 로그인',
        'ui.orSignIn': '또는 소셜 로그인',
        'ui.naverSignup': '네이버로 시작하기 (준비 중)',
        'ui.kakaoSignup': '카카오로 시작하기 (준비 중)',

        // UI Text - User Info Panel
        'ui.uploadedImages': '업로드된 이미지',
        'ui.home': '홈으로',
        'ui.settings': '설정',
        'ui.changePassword': '비밀번호 변경',
        'ui.logout': '로그아웃',

        // UI Text - Date Filter Panel
        'ui.dateFilter': '기간 필터',
        'ui.startDate': '시작일',
        'ui.endDate': '종료일',
        'ui.apply': '적용',
        'ui.clear': '초기화',

        // UI Text - Settings Modal
        'ui.handedness': '손잡이',
        'ui.language': '언어',
        'ui.rightHanded': '오른손잡이',
        'ui.leftHanded': '왼손잡이',
        'ui.korean': '한국어',
        'ui.english': 'English',

        // UI Text - Password Change Modal
        'ui.currentPassword': '현재 비밀번호',
        'ui.newPassword': '새 비밀번호',
        'ui.confirmPassword': '새 비밀번호 확인',
        'ui.currentPasswordPlaceholder': '현재 사용 중인 비밀번호',
        'ui.newPasswordPlaceholder': '새로운 비밀번호 (6자 이상)',
        'ui.confirmPasswordPlaceholder': '새로운 비밀번호 확인',
        'ui.change': '변경하기',
        'ui.cancel': '취소',

        // UI Text - Tooltips
        'ui.loginLogout': '로그인/로그아웃',
        'ui.dateFilterTooltip': '기간 필터',
        'ui.viewList': '목록 보기',
        'ui.currentLocation': '현재 위치',
        'ui.deleteTooltip': '삭제',
        'ui.comingSoon': '현재 준비 중인 기능입니다.',
        'ui.myInfo': '내 정보',
    },
    en: {
        // Photo Upload Messages
        'photo.perPinLimit': (limit) => `Maximum ${limit} photos per pin.`,
        'photo.totalLimit': (limit, current) => `Maximum ${limit} photos total. (Current: ${current})`,
        'photo.imageOnly': 'Only image files allowed (JPG, PNG, GIF, WebP)',
        'photo.sizeLimit': (name) => `File size must be under 5MB (${name})`,
        'photo.optimizing': 'Optimizing photo...',
        'photo.uploading': 'Uploading photo...',
        'photo.uploadFailed': 'Photo upload failed',
        'photo.processingFailed': 'Image processing failed',
        'photo.uploadComplete': 'Upload complete',

        // Save/Delete Messages
        'save.error': 'An error occurred while saving.',
        'save.success': 'Successfully saved.',
        'delete.confirm': 'Are you sure you want to delete this record?',
        'delete.deleting': 'Deleting...',
        'delete.error': 'An error occurred while deleting.',
        'delete.success': 'Deleted.',

        // Date Filter Messages
        'dateFilter.required': 'Please set start and end dates to apply date filter.',
        'dateFilter.applied': (from, to) => `Date filter applied: ${from} ~ ${to}`,
        'dateFilter.error': 'An error occurred while applying date filter.',
        'dateFilter.cleared': 'Date filter cleared.',
        'dateFilter.noStart': 'No start date',
        'dateFilter.noEnd': 'No end date',

        // Auth Messages
        'auth.logoutConfirm': 'Do you want to log out?',
        'auth.loggedOut': 'Logged out.',
        'auth.settingsSaved': 'Settings saved.',
        'auth.comingSoon': 'This feature is coming soon.',
        'auth.signingUp': 'Signing up...',
        'auth.loggingIn': 'Logging in...',
        'auth.signupSuccess': 'Sign up successful! Please check your email.',
        'auth.loginSuccess': 'Login successful!',
        'auth.emailLogin': 'Email Login',

        // Password Change Messages
        'password.mismatch': 'New passwords do not match.',
        'password.tooShort': 'Password must be at least 6 characters.',
        'password.currentIncorrect': 'Current password is incorrect.',
        'password.changeFailed': 'Password change failed: ',
        'password.changeSuccess': 'Password changed successfully.',

        // Geolocation Messages
        'geo.notSupported': 'Browser does not support geolocation.',
        'geo.finding': 'Finding current location...',
        'geo.moved': 'Moved to current location.',
        'geo.failed': 'Failed to get location.',

        // Modal Titles
        'modal.editPlace': 'Edit Place',
        'modal.newPlace': 'New Place',

        // Other UI Text
        'address.none': 'No address information',
        'address.failed': 'Failed to get address',

        // Social Login
        'social.loginWith': (provider) => `Logging in with ${provider}...`,

        // UI Text - Sidebar
        'ui.placeList': 'Place List',
        'ui.searchPlaceholder': 'Search by place or location...',

        // UI Text - Place Modal
        'ui.placeName': 'Place Name',
        'ui.location': 'Location (Address)',
        'ui.comment': 'Comment',
        'ui.visitDate': 'Visit Date',
        'ui.rating': 'Rating',
        'ui.pinColor': 'Pin Color',
        'ui.addPhotos': 'Add Photos',
        'ui.addPhoto': 'Add Photo',
        'ui.save': 'Save',
        'ui.delete': 'Delete',
        'ui.editDetails': 'Edit/Details',

        // UI Text - Placeholders
        'ui.enterPlaceName': 'Enter place name',
        'ui.autoFilled': 'Auto-filled when clicking on map',
        'ui.leaveNote': 'Leave a note about this place',

        // UI Text - Auth Modal
        'ui.startMapNote': 'Start MapNote',
        'ui.signUp': 'Sign Up',
        'ui.loginRequired': 'Login required to use the map.',
        'ui.email': 'Email',
        'ui.password': 'Password',
        'ui.login': 'Login',
        'ui.noAccount': 'Don\'t have an account? Sign Up',
        'ui.haveAccount': 'Already have an account? Login',
        'ui.orSignIn': 'Or sign in with',
        'ui.naverSignup': 'Start with Naver (Coming Soon)',
        'ui.kakaoSignup': 'Start with Kakao (Coming Soon)',

        // UI Text - User Info Panel
        'ui.uploadedImages': 'Uploaded Images',
        'ui.home': 'Home',
        'ui.settings': 'Settings',
        'ui.changePassword': 'Change Password',
        'ui.logout': 'Logout',

        // UI Text - Date Filter Panel
        'ui.dateFilter': 'Date Filter',
        'ui.startDate': 'Start Date',
        'ui.endDate': 'End Date',
        'ui.apply': 'Apply',
        'ui.clear': 'Clear',

        // UI Text - Settings Modal
        'ui.handedness': 'Handedness',
        'ui.language': 'Language',
        'ui.rightHanded': 'Right-handed',
        'ui.leftHanded': 'Left-handed',
        'ui.korean': 'Korean',
        'ui.english': 'English',

        // UI Text - Password Change Modal
        'ui.currentPassword': 'Current Password',
        'ui.newPassword': 'New Password',
        'ui.confirmPassword': 'Confirm New Password',
        'ui.currentPasswordPlaceholder': 'Current password',
        'ui.newPasswordPlaceholder': 'New password (6+ characters)',
        'ui.confirmPasswordPlaceholder': 'Confirm new password',
        'ui.change': 'Change',
        'ui.cancel': 'Cancel',

        // UI Text - Tooltips
        'ui.loginLogout': 'Login/Logout',
        'ui.dateFilterTooltip': 'Date Filter',
        'ui.viewList': 'View List',
        'ui.currentLocation': 'Current Location',
        'ui.deleteTooltip': 'Delete',
        'ui.comingSoon': 'This feature is coming soon.',
        'ui.myInfo': 'My Info',
    }
};

// Translation Helper Function
function t(key, ...args) {
    const lang = userSettings.language || 'ko';
    const translation = translations[lang][key];

    if (typeof translation === 'function') {
        return translation(...args);
    }
    return translation || key;
}

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

// Map Search Elements
const mapSearchInput = document.getElementById('map-search-input');
const searchResults = document.getElementById('search-results');
const searchClearBtn = document.getElementById('search-clear-btn');

let lightboxImages = [];
let currentLightboxIndex = 0;

let uploadedPhotos = [];
let allPlaces = [];
let isSignUpMode = false;

// Initialize Map
function initMap() {
    // Use language-based coordinates
    const initialCoord = COORDS[userSettings.language] || COORDS.ko;
    map = L.map('map').setView(initialCoord, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 클릭 시 모달 열기
    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        // 폼 먼저 열기
        openModal(null, lat, lng, 'Loading location info...');

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
                updateUserLocation(position, false); // Add marker but don't flyTo (already setView)
            },
            (error) => {
                console.log('Geolocation error:', error.message);
                // Keep language-based default location if geolocation fails
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
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
        showToast('Error loading data.');
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

    // Group by category with country and city
    const grouped = {};
    placesToRender.forEach(p => {
        addMarkerToMap(p);

        // Extract country and city from address
        const addressParts = p.address?.split(',') || [];

        let country, city;

        if (addressParts.length >= 2) {
            // Address has comma - last part is country
            country = addressParts[addressParts.length - 1].trim();
            city = addressParts[0].trim().split(' ')[0];
        } else {
            // No comma in address - use default country message (in English, will be translated for display)
            country = 'No country info';
            city = p.address ? p.address.trim().split(' ')[0] : 'Other';
        }

        const categoryKey = `${country}, ${city}`;

        if (!grouped[categoryKey]) grouped[categoryKey] = [];
        grouped[categoryKey].push(p);
    });

    Object.keys(grouped).sort().forEach(cat => {
        const header = document.createElement('div');
        header.className = 'category-header';
        // Translate category label if language is Korean
        header.innerText = translateAddress(cat);
        placeList.appendChild(header);

        grouped[cat].forEach(place => addToList(place));
    });
}

// Add Marker
function addMarkerToMap(place) {
    const icon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class="marker-pin" style="background: ${place.color}"></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
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
            <p style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">${place.visit_date || 'No date specified'}</p>
            ${commentHtml}
            <div class="popup-actions">
                <button class="edit-popup-btn" onclick="window.editPlace('${place.id}')">${escapeHtml(t('ui.editDetails'))}</button>
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
        <button class="delete-item-btn" title="${t('ui.deleteTooltip')}" onclick="event.stopPropagation(); window.deletePlaceDirectly('${place.id}')">&times;</button>
        <h3>${escapeHtml(place.name)}</h3>
        <div class="meta">
            <div class="sidebar-stars">${starsHtml}</div>
            <div style="display: flex; align-items: center;">
                <span class="color-bullet" style="background-color: ${place.color}"></span>
                <span style="font-size: 12px; color: #94a3b8;">${place.visit_date || ''}</span>
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
        // Always fetch address in English for storage
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
        });
        const data = await response.json();

        // Format: "Country, City District" (e.g., South Korea, Seoul Jongno-gu)
        if (data.address) {
            const addr = data.address;
            const country = addr.country || 'No country info';
            const city = addr.city || addr.province || addr.state || '';
            const district = addr.borough || addr.suburb || addr.district || addr.city_district || '';

            let location = '';
            if (city && district) {
                location = `${city} ${district}`;
            } else {
                location = city || district || data.display_name?.split(', ')[0] || 'No location info';
            }

            return `${location}, ${country}`;
        }

        return 'No address information';
    } catch (err) {
        if (import.meta.env.DEV) {
            console.error('Geocoding error:', err);
        }
        return t('address.failed');
    }
}

// Translate address from English to Korean for display
function translateAddress(address) {
    if (!address) return address;

    const lang = userSettings.language || 'ko';
    if (lang === 'en') return address; // No translation needed for English

    // Translation map for common country and city names
    const translations = {
        // Countries
        'South Korea': '대한민국',
        'Korea': '대한민국',
        'Japan': '일본',
        'China': '중국',
        'United States': '미국',
        'United Kingdom': '영국',
        'France': '프랑스',
        'Germany': '독일',
        'Italy': '이탈리아',
        'Spain': '스페인',
        'Canada': '캐나다',
        'Australia': '호주',
        'Thailand': '태국',
        'Vietnam': '베트남',
        'Singapore': '싱가포르',
        'Malaysia': '말레이시아',
        'Indonesia': '인도네시아',
        'Philippines': '필리핀',
        'Taiwan': '대만',
        'Hong Kong': '홍콩',
        'No country info': '국가 정보 없음',
        'No location info': '지명 정보 없음',
        'No address information': '주소 정보 없음',
        'Other': '기타',

        // Korean cities (English to Korean)
        'Seoul': '서울',
        'Busan': '부산',
        'Incheon': '인천',
        'Daegu': '대구',
        'Daejeon': '대전',
        'Gwangju': '광주',
        'Ulsan': '울산',
        'Sejong': '세종',

        // Provinces
        'Gyeonggi-do': '경기도',
        'Gangwon-do': '강원도',
        'Chungcheongbuk-do': '충청북도',
        'Chungcheongnam-do': '충청남도',
        'Jeollabuk-do': '전라북도',
        'Jeollanam-do': '전라남도',
        'Gyeongsangbuk-do': '경상북도',
        'Gyeongsangnam-do': '경상남도',
        'Jeju-do': '제주도',

        // Gyeonggi-do cities
        'Suwon': '수원',
        'Seongnam': '성남',
        'Goyang': '고양',
        'Yongin': '용인',
        'Bucheon': '부천',
        'Ansan': '안산',
        'Anyang': '안양',
        'Namyangju': '남양주',
        'Hwaseong': '화성',
        'Pyeongtaek': '평택',
        'Uijeongbu': '의정부',
        'Siheung': '시흥',
        'Paju': '파주',
        'Gwangmyeong': '광명',
        'Gimpo': '김포',
        'Gunpo': '군포',
        'Hanam': '하남',
        'Osan': '오산',
        'Icheon': '이천',
        'Yangju': '양주',
        'Anseong': '안성',
        'Guri': '구리',
        'Pocheon': '포천',
        'Uiwang': '의왕',
        'Gwangju': '광주',
        'Yeoju': '여주',
        'Dongducheon': '동두천',
        'Gwacheon': '과천',

        // Gangwon-do cities
        'Chuncheon': '춘천',
        'Wonju': '원주',
        'Gangneung': '강릉',
        'Donghae': '동해',
        'Taebaek': '태백',
        'Sokcho': '속초',
        'Samcheok': '삼척',

        // Chungcheong region cities
        'Cheongju': '청주',
        'Chungju': '충주',
        'Jecheon': '제천',
        'Cheonan': '천안',
        'Gongju': '공주',
        'Boryeong': '보령',
        'Asan': '아산',
        'Seosan': '서산',
        'Nonsan': '논산',
        'Gyeryong': '계룡',
        'Dangjin': '당진',

        // Jeolla region cities
        'Jeonju': '전주',
        'Gunsan': '군산',
        'Iksan': '익산',
        'Jeongeup': '정읍',
        'Namwon': '남원',
        'Gimje': '김제',
        'Mokpo': '목포',
        'Yeosu': '여수',
        'Suncheon': '순천',
        'Naju': '나주',
        'Gwangyang': '광양',

        // Gyeongsang region cities
        'Pohang': '포항',
        'Gyeongju': '경주',
        'Gimcheon': '김천',
        'Andong': '안동',
        'Gumi': '구미',
        'Yeongju': '영주',
        'Yeongcheon': '영천',
        'Sangju': '상주',
        'Mungyeong': '문경',
        'Gyeongsan': '경산',
        'Changwon': '창원',
        'Jinju': '진주',
        'Tongyeong': '통영',
        'Sacheon': '사천',
        'Gimhae': '김해',
        'Miryang': '밀양',
        'Geoje': '거제',
        'Yangsan': '양산',

        // Jeju
        'Jeju': '제주',
        'Seogwipo': '서귀포',

        // Seoul districts (구)
        'Jongno-gu': '종로구',
        'Jung-gu': '중구',
        'Yongsan-gu': '용산구',
        'Seongdong-gu': '성동구',
        'Gwangjin-gu': '광진구',
        'Dongdaemun-gu': '동대문구',
        'Jungnang-gu': '중랑구',
        'Seongbuk-gu': '성북구',
        'Gangbuk-gu': '강북구',
        'Dobong-gu': '도봉구',
        'Nowon-gu': '노원구',
        'Eunpyeong-gu': '은평구',
        'Seodaemun-gu': '서대문구',
        'Mapo-gu': '마포구',
        'Yangcheon-gu': '양천구',
        'Gangseo-gu': '강서구',
        'Guro-gu': '구로구',
        'Geumcheon-gu': '금천구',
        'Yeongdeungpo-gu': '영등포구',
        'Dongjak-gu': '동작구',
        'Gwanak-gu': '관악구',
        'Seocho-gu': '서초구',
        'Gangnam-gu': '강남구',
        'Songpa-gu': '송파구',
        'Gangdong-gu': '강동구',

        // Common district suffixes
        '-gu': '구',
        '-si': '시',
        '-gun': '군',
        '-dong': '동',
        '-ro': '로',
        '-gil': '길',
    };

    let translatedAddress = address;

    // Replace each English term with Korean equivalent
    // Sort by length (longest first) to avoid partial replacements
    const sortedEntries = Object.entries(translations).sort((a, b) => b[0].length - a[0].length);

    for (const [english, korean] of sortedEntries) {
        translatedAddress = translatedAddress.replace(new RegExp(english, 'gi'), korean);
    }

    return translatedAddress;
}

// Modal Logic
function openModal(place = null, lat = null, lng = null, address = '') {
    currentPlace = place;
    modalOverlay.classList.remove('hidden');

    // 초기화
    uploadedPhotos = place ? [...(place.photo_urls || [])] : [];
    updatePhotoPreviews();

    if (place) {
        document.getElementById('modal-title').innerText = t('modal.editPlace');
        document.getElementById('place-id').value = place.id;
        document.getElementById('place-name').value = place.name;
        document.getElementById('place-address').value = translateAddress(place.address) || '';
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
        document.getElementById('modal-title').innerText = t('modal.newPlace');
        placeForm.reset();
        document.getElementById('place-id').value = '';
        document.getElementById('place-lat').value = lat;
        document.getElementById('place-lng').value = lng;
        document.getElementById('place-address').value = translateAddress(address);
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
        showToast(t('photo.perPinLimit', PER_PIN_LIMIT));
        return;
    }

    // Check total user limit
    if (userPhotoCount + files.length > TOTAL_USER_LIMIT) {
        showToast(t('photo.totalLimit', TOTAL_USER_LIMIT, userPhotoCount));
        return;
    }

    // Security: File validation
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of files) {
        // Validate file type
        if (!allowedTypes.includes(file.type)) {
            showToast(t('photo.imageOnly'));
            continue;
        }

        // Validate file size
        if (file.size > maxSize) {
            showToast(t('photo.sizeLimit', file.name));
            continue;
        }

        showToast(t('photo.optimizing'));

        try {
            // Resize and convert to WebP
            const optimizedBlob = await resizeImage(file);
            const optimizedFileName = getOptimizedFileName(file.name);

            showToast(t('photo.uploading'));

            const { data, error } = await supabase.storage
                .from('place-photos')
                .upload(optimizedFileName, optimizedBlob, {
                    contentType: 'image/webp'
                });

            if (error) {
                if (import.meta.env.DEV) {
                    console.error('Upload error:', error);
                }
                showToast(t('photo.uploadFailed'));
                continue;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('place-photos')
                .getPublicUrl(optimizedFileName);

            uploadedPhotos.push(publicUrl);
            userPhotoCount++; // Increment total photo count
        } catch (err) {
            console.error('Image processing error:', err);
            showToast(t('photo.processingFailed'));
            continue;
        }
    }

    updatePhotoPreviews();
    updateAuthUI(); // Update photo count display
    showToast(t('photo.uploadComplete'));
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
        showToast(t('save.error'));
        console.error(result.error);
    } else {
        showToast(t('save.success'));
        modalOverlay.classList.add('hidden');
        loadPlaces();
    }
};

// Delete Place
deleteBtn.onclick = async () => {
    const id = document.getElementById('place-id').value;
    if (!id) return;
    if (!confirm(t('delete.confirm'))) return;

    showToast(t('delete.deleting'));
    const { error } = await supabase.from('places').delete().eq('id', id);

    if (error) {
        console.error('Delete error:', error);
        showToast(t('delete.error'));
    } else {
        showToast(t('delete.success'));
        modalOverlay.classList.add('hidden');
        loadPlaces();
    }
};

// Delete Place Directly from list
window.deletePlaceDirectly = async (id) => {
    if (!confirm(t('delete.confirm'))) return;

    showToast(t('delete.deleting'));
    const { error } = await supabase.from('places').delete().eq('id', id);

    if (error) {
        console.error('Delete error:', error);
        showToast(t('delete.error'));
    } else {
        showToast(t('delete.success'));
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

        // Close other panels
        userInfoPanel.classList.add('hidden');
        sidebar.classList.add('hidden');

        dateFilterPanel.classList.toggle('hidden');
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
                showToast(t('dateFilter.required'));
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

            const fromStr = currentDateFrom || t('dateFilter.noStart');
            const toStr = currentDateTo || t('dateFilter.noEnd');
            showToast(t('dateFilter.applied', fromStr, toStr));
        } catch (error) {
            console.error('Error applying date filter:', error);
            showToast(t('dateFilter.error'));
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

        showToast(t('dateFilter.cleared'));
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
        authToggleBtn.title = `My Info (${currentUser.email})`;

        // Populate User Info Panel
        userInfoEmail.innerText = currentUser.email;
        userAvatarInitial.innerText = currentUser.email[0].toUpperCase();
        userInfoProvider.innerText = currentUser.app_metadata.provider === 'email' ? t('auth.emailLogin') : `${currentUser.app_metadata.provider} 로그인`;

        // Update photo count display
        const photoCountEl = document.getElementById('user-photo-count');
        if (photoCountEl) {
            photoCountEl.innerText = `${userPhotoCount} / 300`;
        }
    } else {
        authOverlay.classList.remove('hidden'); // Show login gate for guests
        authToggleBtn.innerHTML = '<span class="icon">👤</span>';
        authToggleBtn.title = 'Login';
        userInfoPanel.classList.add('hidden');
    }

}

authToggleBtn.onclick = (e) => {
    e.stopPropagation();

    // Close other panels
    dateFilterPanel.classList.add('hidden');
    sidebar.classList.add('hidden');

    if (!currentUser) {
        authOverlay.classList.remove('hidden');
    } else {
        userInfoPanel.classList.toggle('hidden');
    }
};

// Toggle panel off when clicking elsewhere
document.addEventListener('click', () => userInfoPanel.classList.add('hidden'));
userInfoPanel.onclick = (e) => e.stopPropagation();

logoutBtn.onclick = async () => {
    if (confirm(t('auth.logoutConfirm'))) {
        await supabase.auth.signOut();
        showToast(t('auth.loggedOut'));
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
        const languageChanged = userSettings.language !== newSettings.language;

        saveSettings(newSettings);
        applyHandedness(newSettings.handedness);
        userSettings = newSettings; // Update global userSettings
        settingsModal.classList.add('hidden');

        // Update UI language if language changed
        if (languageChanged) {
            updateUILanguage();
        }

        showToast(t('auth.settingsSaved'));
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
    authTitle.innerText = isSignUpMode ? t('ui.signUp') : t('ui.startMapNote');
    authSubmitBtn.innerText = isSignUpMode ? t('ui.signUp') : t('ui.login');
    authSwitchBtn.innerText = isSignUpMode ? t('ui.haveAccount') : t('ui.noAccount');
};

// Social Auth
const handleSocialLogin = async (provider) => {
    showToast(t('social.loginWith', provider));
    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin
        }
    });
    if (error) showToast(error.message);
};

authNaver.onclick = () => showToast(t('auth.comingSoon'));
authKakao.onclick = () => showToast(t('auth.comingSoon'));

authForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = authEmail.value;
    const password = authPassword.value;

    showToast(isSignUpMode ? t('auth.signingUp') : t('auth.loggingIn'));

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
            showToast(t('auth.signupSuccess'));
        } else {
            showToast(t('auth.loginSuccess'));
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
        setPasswordMsg(t('password.mismatch'));
        return;
    }

    // 2. Check password length
    if (newPassword.length < 6) {
        setPasswordMsg(t('password.tooShort'));
        return;
    }

    // 3. Verify current password (Final check)
    const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
    });

    if (verifyError) {
        setPasswordMsg(t('password.currentIncorrect'));
        currentPasswordStatus.className = 'status-indicator error';
        return;
    }

    // 4. Update password
    const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
    });

    if (updateError) {
        setPasswordMsg(t('password.changeFailed') + updateError.message);
    } else {
        showToast(t('password.changeSuccess'));
        closePasswordModal();
    }
};

// UI Events
listToggleBtn.onclick = () => {
    // Close other panels
    userInfoPanel.classList.add('hidden');
    dateFilterPanel.classList.add('hidden');

    sidebar.classList.toggle('hidden');
};
closeSidebar.onclick = () => sidebar.classList.add('hidden');
closeModal.onclick = () => modalOverlay.classList.add('hidden');
ratingInput.oninput = null; // Remove old listener

// Geolocation Button
geoBtn.onclick = () => {
    if (!navigator.geolocation) {
        showToast(t('geo.notSupported'));
        return;
    }

    showToast(t('geo.finding'));
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            map.flyTo([latitude, longitude], 16);
            showToast(t('geo.moved'));
        },
        (err) => {
            // Handle different error types
            if (err.code === err.PERMISSION_DENIED) {
                // Permission denied - show instruction message
                const message = userSettings.language === 'en'
                    ? 'Location access denied.\n\nTo enable:\n1. Click the lock icon (🔒) in the address bar\n2. Allow location permissions\n3. Click the location button again'
                    : '위치 접근이 거부되었습니다.\n\n허용 방법:\n1. 주소창의 자물쇠 아이콘(🔒)을 클릭\n2. 위치 권한을 허용으로 변경\n3. 위치 버튼을 다시 클릭';

                alert(message);
            } else if (err.code === err.POSITION_UNAVAILABLE) {
                showToast(userSettings.language === 'en' ? 'Location information unavailable' : '위치 정보를 사용할 수 없습니다');
            } else if (err.code === err.TIMEOUT) {
                showToast(userSettings.language === 'en' ? 'Location request timed out' : '위치 요청 시간 초과');
            } else {
                showToast(t('geo.failed'));
                console.error(err);
            }
        }
    );
};

function showToast(msg) {
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Update UI Language
function updateUILanguage() {
    const lang = userSettings.language || 'ko';

    // Sidebar
    const sidebarHeader = document.querySelector('#sidebar h2');
    if (sidebarHeader) sidebarHeader.innerText = t('ui.placeList');

    const placeFilterInput = document.getElementById('place-filter');
    if (placeFilterInput) placeFilterInput.placeholder = t('ui.searchPlaceholder');

    // Place Modal
    const modalTitle = document.getElementById('modal-title');
    // Modal title is set dynamically in openModal function

    const placeNameLabel = document.querySelector('label[for="place-name"]');
    if (placeNameLabel) placeNameLabel.innerText = t('ui.placeName');

    const placeAddressLabel = document.querySelector('label[for="place-address"]');
    if (placeAddressLabel) placeAddressLabel.innerText = t('ui.location');

    const placeCommentLabel = document.querySelector('label[for="place-comment"]');
    if (placeCommentLabel) placeCommentLabel.innerText = t('ui.comment');

    const visitDateLabel = document.querySelector('label[for="visit-date"]');
    if (visitDateLabel) visitDateLabel.innerText = t('ui.visitDate');

    const ratingLabels = document.querySelectorAll('.form-group label');
    ratingLabels.forEach(label => {
        if (label.innerText === 'Rating' || label.innerText === '평점') {
            label.innerText = t('ui.rating');
        }
    });

    const pinColorLabel = document.querySelector('label[for="pin-color"]');
    if (pinColorLabel) pinColorLabel.innerText = t('ui.pinColor');

    const addPhotosLabel = document.querySelector('.form-group label');
    const addPhotosLabels = Array.from(document.querySelectorAll('.form-group label'));
    const photosLabel = addPhotosLabels.find(l => l.innerText.includes('Add Photos') || l.innerText.includes('사진 첨부'));
    if (photosLabel) photosLabel.innerText = t('ui.addPhotos');

    // Placeholders
    const placeNameInput = document.getElementById('place-name');
    if (placeNameInput) placeNameInput.placeholder = t('ui.enterPlaceName');

    const placeAddressInput = document.getElementById('place-address');
    if (placeAddressInput) placeAddressInput.placeholder = t('ui.autoFilled');

    const placeCommentInput = document.getElementById('place-comment');
    if (placeCommentInput) placeCommentInput.placeholder = t('ui.leaveNote');

    // Buttons
    const photoAddBtn = document.getElementById('photo-add-btn');
    if (photoAddBtn) {
        const iconSpan = photoAddBtn.querySelector('.icon');
        photoAddBtn.innerHTML = '';
        if (iconSpan) photoAddBtn.appendChild(iconSpan);
        photoAddBtn.appendChild(document.createTextNode(' ' + t('ui.addPhoto')));
    }

    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.innerText = t('ui.save');

    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) deleteBtn.innerText = t('ui.delete');

    // Auth Modal
    const authTitle = document.getElementById('auth-title');
    if (authTitle && !isSignUpMode) authTitle.innerText = t('ui.startMapNote');
    if (authTitle && isSignUpMode) authTitle.innerText = t('ui.signUp');

    const authDescription = document.querySelector('#auth-overlay p');
    if (authDescription) authDescription.innerText = t('ui.loginRequired');

    const authEmailLabel = document.querySelector('label[for="auth-email"]');
    if (authEmailLabel) authEmailLabel.innerText = t('ui.email');

    const authPasswordLabel = document.querySelector('label[for="auth-password"]');
    if (authPasswordLabel) authPasswordLabel.innerText = t('ui.password');

    const authSubmitBtn = document.getElementById('auth-submit-btn');
    if (authSubmitBtn && !isSignUpMode) authSubmitBtn.innerText = t('ui.login');
    if (authSubmitBtn && isSignUpMode) authSubmitBtn.innerText = t('ui.signUp');

    const authSwitchBtn = document.getElementById('auth-switch-btn');
    if (authSwitchBtn && !isSignUpMode) authSwitchBtn.innerText = t('ui.noAccount');
    if (authSwitchBtn && isSignUpMode) authSwitchBtn.innerText = t('ui.haveAccount');

    const socialDivider = document.querySelector('.social-divider span');
    if (socialDivider) socialDivider.innerText = t('ui.orSignIn');

    const naverBtn = document.getElementById('auth-naver');
    if (naverBtn) {
        const iconSpan = naverBtn.querySelector('.icon');
        naverBtn.innerHTML = '';
        if (iconSpan) naverBtn.appendChild(iconSpan);
        naverBtn.appendChild(document.createTextNode(' ' + t('ui.naverSignup')));
        naverBtn.title = t('ui.comingSoon');
    }

    const kakaoBtn = document.getElementById('auth-kakao');
    if (kakaoBtn) {
        const iconSpan = kakaoBtn.querySelector('.icon');
        kakaoBtn.innerHTML = '';
        if (iconSpan) kakaoBtn.appendChild(iconSpan);
        kakaoBtn.appendChild(document.createTextNode(' ' + t('ui.kakaoSignup')));
        kakaoBtn.title = t('ui.comingSoon');
    }

    // User Info Panel
    const uploadedImagesSpan = document.querySelector('#user-info-panel span');
    if (uploadedImagesSpan && (uploadedImagesSpan.innerText === 'Uploaded Images' || uploadedImagesSpan.innerText === '업로드된 이미지')) {
        uploadedImagesSpan.innerText = t('ui.uploadedImages');
    }

    const homeBtn = document.querySelector('button[onclick="window.location.href=\'/\'"]');
    if (homeBtn) homeBtn.innerText = t('ui.home');

    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        const iconSpan = settingsBtn.querySelector('.icon') || document.createTextNode('⚙️');
        settingsBtn.innerHTML = '';
        if (typeof iconSpan === 'string') {
            settingsBtn.appendChild(document.createTextNode(iconSpan + '\n        '));
        } else {
            settingsBtn.appendChild(iconSpan);
            settingsBtn.appendChild(document.createTextNode('\n        '));
        }
        settingsBtn.appendChild(document.createTextNode(t('ui.settings')));
    }

    const changePasswordBtn = document.getElementById('change-password-btn');
    if (changePasswordBtn) changePasswordBtn.innerText = t('ui.changePassword');

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.innerText = t('ui.logout');

    // Date Filter Panel
    const dateFilterHeader = document.querySelector('#date-filter-panel h3');
    if (dateFilterHeader) dateFilterHeader.innerText = t('ui.dateFilter');

    const dateFromLabel = document.querySelector('label[for="date-from"]');
    if (dateFromLabel) dateFromLabel.innerText = t('ui.startDate');

    const dateToLabel = document.querySelector('label[for="date-to"]');
    if (dateToLabel) dateToLabel.innerText = t('ui.endDate');

    const applyDateFilterBtn = document.getElementById('apply-date-filter');
    if (applyDateFilterBtn) applyDateFilterBtn.innerText = t('ui.apply');

    const clearDateFilterBtn = document.getElementById('clear-date-filter');
    if (clearDateFilterBtn) clearDateFilterBtn.innerText = t('ui.clear');

    // Settings Modal
    const settingsHeader = document.querySelector('#settings-modal h2');
    if (settingsHeader) settingsHeader.innerText = t('ui.settings');

    const handednessLabel = document.querySelector('#settings-modal label');
    if (handednessLabel) handednessLabel.innerText = t('ui.handedness');

    const languageLabel = document.querySelectorAll('#settings-modal label')[1];
    if (languageLabel) languageLabel.innerText = t('ui.language');

    const handednessOptions = document.querySelectorAll('#handedness-select option');
    if (handednessOptions[0]) handednessOptions[0].innerText = t('ui.rightHanded');
    if (handednessOptions[1]) handednessOptions[1].innerText = t('ui.leftHanded');

    const languageOptions = document.querySelectorAll('#language-select option');
    if (languageOptions[0]) languageOptions[0].innerText = t('ui.korean');
    if (languageOptions[1]) languageOptions[1].innerText = t('ui.english');

    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) saveSettingsBtn.innerText = t('ui.save');

    // Password Change Modal
    const passwordChangeHeader = document.querySelector('#password-change-overlay h2');
    if (passwordChangeHeader) passwordChangeHeader.innerText = t('ui.changePassword');

    const currentPasswordLabel = document.querySelector('label[for="current-password"]');
    if (currentPasswordLabel) currentPasswordLabel.innerText = t('ui.currentPassword');

    const newPasswordLabel = document.querySelector('label[for="new-password"]');
    if (newPasswordLabel) newPasswordLabel.innerText = t('ui.newPassword');

    const confirmPasswordLabel = document.querySelector('label[for="confirm-password"]');
    if (confirmPasswordLabel) confirmPasswordLabel.innerText = t('ui.confirmPassword');

    const currentPasswordInput = document.getElementById('current-password');
    if (currentPasswordInput) currentPasswordInput.placeholder = t('ui.currentPasswordPlaceholder');

    const newPasswordInput = document.getElementById('new-password');
    if (newPasswordInput) newPasswordInput.placeholder = t('ui.newPasswordPlaceholder');

    const confirmPasswordInput = document.getElementById('confirm-password');
    if (confirmPasswordInput) confirmPasswordInput.placeholder = t('ui.confirmPasswordPlaceholder');

    const submitPasswordChange = document.getElementById('submit-password-change');
    if (submitPasswordChange) submitPasswordChange.innerText = t('ui.change');

    const cancelPasswordChange = document.getElementById('cancel-password-change');
    if (cancelPasswordChange) cancelPasswordChange.innerText = t('ui.cancel');

    // Tooltips
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    if (authToggleBtn) {
        if (currentUser) {
            authToggleBtn.title = `${t('ui.myInfo')} (${currentUser.email})`;
        } else {
            authToggleBtn.title = t('ui.login');
        }
    }

    const dateFilterBtn = document.getElementById('date-filter-btn');
    if (dateFilterBtn) dateFilterBtn.title = t('ui.dateFilterTooltip');

    const listToggleBtn = document.getElementById('list-toggle-btn');
    if (listToggleBtn) listToggleBtn.title = t('ui.viewList');

    const geoBtn = document.getElementById('geo-btn');
    if (geoBtn) geoBtn.title = t('ui.currentLocation');

    // Update date input fields language
    const dateFromInput = document.getElementById('date-from');
    if (dateFromInput) dateFromInput.setAttribute('lang', lang);

    const dateToInput = document.getElementById('date-to');
    if (dateToInput) dateToInput.setAttribute('lang', lang);

    const visitDateInput = document.getElementById('visit-date');
    if (visitDateInput) visitDateInput.setAttribute('lang', lang);

    // Re-render place list to update categories
    if (allPlaces && allPlaces.length > 0) {
        applyFilters();
    }
}

// Helper to update user location marker and accuracy circle
function updateUserLocation(position, shouldFly = true) {
    const { latitude, longitude, accuracy } = position.coords;
    const pos = [latitude, longitude];

    if (shouldFly) {
        map.flyTo(pos, 16);
    }

    // Update or create user location marker
    if (userLocationMarker) {
        userLocationMarker.setLatLng(pos);
    } else {
        const icon = L.divIcon({
            className: 'current-location-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        userLocationMarker = L.marker(pos, { icon, zIndexOffset: 1000 }).addTo(map);
    }

    // Update or create accuracy circle
    if (userLocationCircle) {
        userLocationCircle.setLatLng(pos);
        userLocationCircle.setRadius(accuracy);
    } else {
        userLocationCircle = L.circle(pos, {
            radius: accuracy,
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            weight: 1
        }).addTo(map);
    }
}

// Current Location functionality
if (geoBtn) {
    geoBtn.onclick = () => {
        if (!navigator.geolocation) {
            showToast(t('geo.notSupported'));
            return;
        }

        showToast(t('geo.finding'));

        navigator.geolocation.getCurrentPosition(
            (position) => {
                updateUserLocation(position);
                showToast(t('geo.moved'));
            },
            (error) => {
                console.log('Geolocation error:', error.message);
                showToast(t('geo.failed'));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    };
}

// Map Search Logic
let searchDebounceTimer;

async function searchPlaces(query) {
    if (!query || query.length < 2) {
        searchResults.classList.add('hidden');
        searchClearBtn.classList.add('hidden');
        return;
    }

    searchClearBtn.classList.remove('hidden');

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`, {
            headers: { 'Accept-Language': userSettings.language || 'ko' }
        });
        const data = await response.json();
        renderSearchResults(data);
    } catch (err) {
        console.error('Search error:', err);
    }
}

function renderSearchResults(results) {
    if (!results || results.length === 0) {
        searchResults.classList.add('hidden');
        return;
    }

    searchResults.innerHTML = '';
    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'search-result-item';

        // Split display name for better formatting
        const parts = result.display_name.split(',');
        const name = parts[0];
        const address = parts.slice(1).join(',').trim();
        const type = result.type || result.class || '';

        item.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span class="search-result-name">${escapeHtml(name)}</span>
                ${type ? `<span class="search-result-type">${escapeHtml(type)}</span>` : ''}
            </div>
            <span class="search-result-address">${escapeHtml(address)}</span>
        `;

        item.onclick = () => {
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            map.flyTo([lat, lon], 16);
            searchResults.classList.add('hidden');
            mapSearchInput.value = name;

            // Remove existing search marker
            if (searchMarker) {
                map.removeLayer(searchMarker);
            }

            // Category Icons mapping
            const categoryMap = {
                'cafe': { icon: '☕', class: 'cafe' },
                'bakery': { icon: '☕', class: 'cafe' },
                'coffee_shop': { icon: '☕', class: 'cafe' },
                'pub': { icon: '🍺', class: 'cafe' },
                'bar': { icon: '🍺', class: 'cafe' },
                'restaurant': { icon: '🍴', class: 'restaurant' },
                'fast_food': { icon: '🍔', class: 'restaurant' },
                'hotel': { icon: '🏨', class: 'hotel' },
                'guest_house': { icon: '🏨', class: 'hotel' },
                'motel': { icon: '🏨', class: 'hotel' },
                'park': { icon: '🌳', class: 'park' },
                'garden': { icon: '🌳', class: 'park' },
                'forest': { icon: '🌲', class: 'park' },
                'shop': { icon: '🛍️', class: 'shopping' },
                'mall': { icon: '🛍️', class: 'shopping' },
                'supermarket': { icon: '🛒', class: 'shopping' },
                'bus_stop': { icon: '🚌', class: 'transport' },
                'subway_entrance': { icon: '🚉', class: 'transport' },
                'railway_station': { icon: '🚉', class: 'transport' },
                'airport': { icon: '✈️', class: 'transport' }
            };

            const categoryInfo = categoryMap[type.toLowerCase().split(',')[0].trim()] || { icon: '📍', class: 'default' };

            // Create new search marker with category icon
            const icon = L.divIcon({
                className: `category-pin ${categoryInfo.class}`,
                html: `<div class="category-icon-inner">${categoryInfo.icon}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18], // Center for circle
                popupAnchor: [0, -18]
            });

            searchMarker = L.marker([lat, lon], { icon }).addTo(map);

            // Add popup to the search marker
            searchMarker.bindPopup(`
                <div class="popup-content">
                    <h3>${escapeHtml(name)}</h3>
                    <p style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">${escapeHtml(address)}</p>
                    <button class="edit-popup-btn" style="background: var(--primary);" onclick="window.addFromSearch('${escapeHtml(name)}', '${escapeHtml(address)}', ${lat}, ${lon})">저장하기</button>
                </div>
            `).openPopup();
        };
        searchResults.appendChild(item);
    });
    searchResults.classList.remove('hidden');
}

if (mapSearchInput) {
    mapSearchInput.oninput = (e) => {
        clearTimeout(searchDebounceTimer);
        const query = e.target.value;

        if (!query) {
            searchResults.classList.add('hidden');
            searchClearBtn.classList.add('hidden');
            return;
        }

        searchDebounceTimer = setTimeout(() => {
            searchPlaces(query);
        }, 500);
    };

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!mapSearchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });

    // Handle enter key to search immediately
    mapSearchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchDebounceTimer);
            searchPlaces(mapSearchInput.value);
        }
    };
}

if (searchClearBtn) {
    searchClearBtn.onclick = () => {
        mapSearchInput.value = '';
        searchResults.classList.add('hidden');
        searchClearBtn.classList.add('hidden');
        if (searchMarker) {
            map.removeLayer(searchMarker);
            searchMarker = null;
        }
        mapSearchInput.focus();
    };
}

// Global function to add from search
window.addFromSearch = (name, address, lat, lon) => {
    openModal(null, lat, lon, address);
    document.getElementById('place-name').value = name;
};

// Start
initMap();
updateUILanguage(); // Initialize UI with current language
