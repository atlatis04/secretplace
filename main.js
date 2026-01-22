import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { supabase } from './supabase.js'
import { resizeImage, getOptimizedFileName } from './src/imageResizer.js'
import * as htmlToImage from 'html-to-image';
import { getUserProfile, updateNickname } from './profile-manager.js'

let map;
let markers = [];
let currentPlace = null;
let currentUser = null;
let userPhotoCount = 0; // Total photos uploaded by user
let isSharedMode = false; // Flag to prevent loadPlaces from overwriting shared content
let sharedUserId = null; // ID of user whose places are being shared
let sharedUserNickname = null; // Nickname of user sharing places
let importedPlaceIds = new Set(); // Track which shared places have been imported

// Initialize userSettings with default values (loaded from localStorage later)
let userSettings = { handedness: 'right', language: 'ko', mapStyle: 'default', colorLabels: {} };

// Default color labels
const DEFAULT_COLOR_LABELS = {
    ko: {
        '#ef4444': '빨강',
        '#3b82f6': '파랑',
        '#10b981': '초록',
        '#f59e0b': '주황',
        '#8b5cf6': '보라'
    },
    en: {
        '#ef4444': 'Red',
        '#3b82f6': 'Blue',
        '#10b981': 'Green',
        '#f59e0b': 'Orange',
        '#8b5cf6': 'Purple'
    }
};

// Date filter range
let currentFilterDateRange = { from: null, to: null };

// Pin Settings Management
let pinSettings = {};

function getColorLabel(color) {
    const lang = userSettings.language || 'ko';
    return pinSettings[color] || DEFAULT_COLOR_LABELS[lang][color] || color;
}
window.getColorLabel = getColorLabel;

async function loadPinSettings() {
    if (!currentUser) {
        updateColorPickerLabels();
        return;
    }
    try {
        const { data, error } = await supabase
            .from('user_pin_settings')
            .select('*')
            .eq('user_id', currentUser.id);

        if (error) throw error;

        pinSettings = {};
        data.forEach(item => {
            pinSettings[item.color] = item.label;
        });

        updateColorPickerLabels();
        applyFilters();
    } catch (error) {
        console.error('Error loading pin settings:', error);
    }
}

async function savePinSettings() {
    if (!currentUser) {
        showToast('Please login to save settings', true);
        return;
    }

    const inputs = document.querySelectorAll('.pin-label-input');
    const updates = [];

    inputs.forEach(input => {
        const color = input.getAttribute('data-color');
        const label = input.value.trim();
        if (label) {
            updates.push({
                user_id: currentUser.id,
                color: color,
                label: label,
                updated_at: new Date().toISOString()
            });
        }
    });

    try {
        const { error } = await supabase
            .from('user_pin_settings')
            .upsert(updates, { onConflict: 'user_id,color' });

        if (error) throw error;

        updates.forEach(u => pinSettings[u.color] = u.label);

        showToast(t('save.success'));
        document.getElementById('pin-settings-modal').classList.add('hidden');

        updateColorPickerLabels();
        applyFilters();
    } catch (error) {
        console.error('Error saving pin settings:', error);
        showToast(t('save.error'), true);
    }
}

function updatePinSettingsUI() {
    const list = document.getElementById('pin-labels-list');
    if (!list) return;

    list.innerHTML = '';
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    // Always use English defaults for pin settings
    const defaultLang = 'en';

    colors.forEach(color => {
        const item = document.createElement('div');
        item.className = 'pin-label-item';

        const defaultLabel = DEFAULT_COLOR_LABELS[defaultLang][color] || '';
        const currentLabel = pinSettings[color] || defaultLabel;

        item.innerHTML = `
            <div class="pin-label-color" style="background: ${color}"></div>
            <div class="pin-label-input-wrapper">
                <input type="text" class="pin-label-input" data-color="${color}" value="${currentLabel}" maxlength="20" placeholder="${defaultLabel}">
            </div>
        `;
        list.appendChild(item);
    });
}

function attachPinSettingsEvents() {
    const pinSettingsBtn = document.getElementById('pin-settings-btn');
    const pinSettingsModal = document.getElementById('pin-settings-modal');
    const savePinSettingsBtn = document.getElementById('save-pin-settings');

    if (pinSettingsBtn) {
        pinSettingsBtn.addEventListener('click', () => {
            if (!currentUser) {
                showToast('Please login to use pin settings', true);
                return;
            }
            updatePinSettingsUI();
            pinSettingsModal.classList.remove('hidden');
        });
    }

    if (savePinSettingsBtn) {
        savePinSettingsBtn.addEventListener('click', savePinSettings);
    }

    document.querySelectorAll('#pin-settings-modal .close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            pinSettingsModal.classList.add('hidden');
        });
    });
}

function updateColorPickerLabels() {
    const labels = document.querySelectorAll('#color-picker label');
    labels.forEach(label => {
        const input = document.getElementById(label.getAttribute('for'));
        if (input) {
            const color = input.value;
            const labelText = getColorLabel(color);
            // label.className = 'color-btn';
            // label.innerHTML = `<span class="color-label-in-btn">${labelText}</span>`;
        }
    });
}



// 초기 위치 (서울)
const DEFAULT_COORD = [37.5665, 126.9780];

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
        'ui.startMapNote': 'Maplog 시작하기',
        'ui.signUp': '회원가입',
        'ui.loginRequired': '지도를 이용하려면 로그인이 필요합니다.',
        'ui.email': '이메일',
        'ui.password': '비밀번호',
        'ui.login': '로그인',
        'ui.noAccount': '계정이 없으신가요? 회원가입',
        'ui.haveAccount': '이미 계정이 있으신가요? 로그인',
        'ui.orSignIn': '또는 소셜 로그인',
        'ui.googleSignup': '구글로 시작하기',
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
        'ui.lastMonth': '저번달',
        'ui.thisMonth': '이번달',
        'ui.lastWeek': '최근 1주',
        'ui.pinSettings': '핀 설정',
        'ui.pinLabel': '핀 라벨',
        'ui.save': '저장',

        // UI Text - Settings Modal
        'ui.handedness': '손잡이',
        'ui.language': '언어',
        'ui.rightHanded': '오른손잡이',
        'ui.leftHanded': '왼손잡이',
        'ui.korean': '한국어',
        'ui.mapStyle': '지도 스타일',
        'ui.mapStyleDefault': '기본',
        'ui.mapStyleDark': '다크',
        'ui.mapStyleLight': '라이트',
        'ui.mapStyleSatellite': '위성',
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
        'ui.shareImage': '이미지로 저장',
        'ui.shareLink': '링크 공유',
        'ui.noPlacesToShare': '공유할 장소가 없습니다.',
        'ui.imageSaved': '이미지가 저장되었습니다.',
        'ui.linkCopied': '공유 링크가 클립보드에 복사되었습니다.',
        'ui.myPlaceList': '나의 장소 목록',
        'ui.viewingSharedList': '공개된 공유 리스트를 보고 있습니다.',
        'ui.goToMyMap': '내 지도로 돌아가기',
        'ui.public': '공개',
        'auth.nicknameUpdated': '닉네임이 성공적으로 변경되었습니다.',
        'auth.nicknameUpdateFailed': '닉네임 변경 실패',
        'ui.changeNickname': '닉네임 변경',
        'ui.newNickname': '새 닉네임',
        'ui.nicknamePlaceholder': '새 닉네임을 입력하세요',
        'ui.nicknameHelp': '영문, 숫자, 공백, 하이픈, 언더바만 가능 (최대 30자)',
        'ui.update': '수정하기',
        'ui.nickname': '닉네임',
        'auth.errorNicknameTaken': '이미 사용 중인 닉네임입니다.',
        'auth.errorNicknameEmpty': '닉네임을 입력해 주세요.',
        'auth.errorNicknameTooLong': '닉네임은 30자 이내여야 합니다.',
        'auth.errorNicknameInvalid': '영문, 숫자, 공백, 하이픈, 언더바만 가능합니다.',
        'auth.provider.email': '이메일 로그인',
        'auth.provider.google': '구글 로그인',
        'auth.provider.kakao': '카카오 로그인',
        'auth.provider.naver': '네이버 로그인',

        // Import Feature
        'import.addToMyMap': '내 지도에 추가',
        'import.alreadyAdded': '이미 추가됨',
        'import.importing': '가져오는 중...',
        'import.success': '장소가 내 지도에 추가되었습니다',
        'import.error': '장소 추가에 실패했습니다',
        'import.duplicate': '이미 비슷한 장소가 있습니다',
        'import.viewingShared': (nickname) => `${nickname}님이 공유한 장소`,
        'import.copyPhotos': '사진도 함께 복사',
        'import.photosWillCopy': '사진도 함께 복사됩니다',
        'import.photosWontCopy': '사진은 복사되지 않습니다',
        'import.storageLimit': '사진 저장 용량이 부족합니다',
        'import.confirmTitle': '장소 가져오기',
        'import.confirmMessage': '이 장소를 내 지도에 추가하시겠습니까?',
        'import.loginRequired': '장소를 추가하려면 로그인이 필요합니다',

        // Share Link Feature
        'share.title': '장소 공유',
        'share.expiration': '링크 만료 시간',
        'share.24hours': '24시간',
        'share.7days': '7일',
        'share.30days': '30일',
        'share.never': '영구',
        'share.generateLink': '링크 생성',
        'share.activeLinks': '활성 공유 링크',
        'share.noLinks': '활성 링크가 없습니다',
        'share.expires': '만료',
        'share.accessed': '접속',
        'share.times': '회',
        'share.deleteLink': '삭제',
        'share.linkExpired': '공유 링크가 만료되었습니다',
        'share.linkInvalid': '유효하지 않은 공유 링크입니다',
        'share.linkDeleted': '공유 링크가 삭제되었습니다',
        'share.linkGenerated': '공유 링크가 생성되었습니다',
        'share.deleteConfirm': '이 공유 링크를 삭제하시겠습니까?',
        'share.placesCount': '공유 장소',
        'share.allPlaces': '전체 장소',
        'share.deleteConfirm': '이 공유 링크를 삭제하시겠습니까?',
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
        'ui.startMapNote': 'Start Maplog',
        'ui.signUp': 'Sign Up',
        'ui.loginRequired': 'Login required to use the map.',
        'ui.email': 'Email',
        'ui.password': 'Password',
        'ui.login': 'Login',
        'ui.noAccount': 'Don\'t have an account? Sign Up',
        'ui.haveAccount': 'Already have an account? Login',
        'ui.orSignIn': 'Or sign in with',
        'ui.googleSignup': 'Start with Google',
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
        'ui.lastMonth': 'Last Month',
        'ui.thisMonth': 'This Month',
        'ui.lastWeek': 'Last Week',

        // UI Text - Settings Modal
        'ui.handedness': 'Handedness',
        'ui.language': 'Language',
        'ui.rightHanded': 'Right-handed',
        'ui.leftHanded': 'Left-handed',
        'ui.korean': 'Korean',
        'ui.mapStyle': 'Map Style',
        'ui.mapStyleDefault': 'Default',
        'ui.mapStyleDark': 'Dark',
        'ui.mapStyleLight': 'Light',
        'ui.mapStyleSatellite': 'Satellite',
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
        'ui.shareImage': 'Save as Image',
        'ui.shareLink': 'Share Link',
        'ui.noPlacesToShare': 'No places to share.',
        'ui.imageSaved': 'Image saved.',
        'ui.linkCopied': 'Share link copied to clipboard.',
        'ui.myPlaceList': 'My Place List',
        'ui.viewingSharedList': 'Viewing shared public list.',
        'ui.goToMyMap': 'Go to My Map',
        'ui.public': 'Public',
        'auth.nicknameUpdated': 'Nickname updated successfully.',
        'auth.nicknameUpdateFailed': 'Failed to update nickname',
        'ui.changeNickname': 'Change Nickname',
        'ui.newNickname': 'New Nickname',
        'ui.nicknamePlaceholder': 'Enter new nickname',
        'ui.nicknameHelp': 'Letters, numbers, spaces, hyphens, and underscores only (max 30 characters)',
        'ui.update': 'Update',
        'ui.nickname': 'Nickname',
        'auth.errorNicknameTaken': 'This nickname is already taken.',
        'auth.errorNicknameEmpty': 'Nickname cannot be empty.',
        'auth.errorNicknameTooLong': 'Nickname must be 30 characters or less.',
        'auth.errorNicknameInvalid': 'Nickname can only contain letters, numbers, spaces, hyphens, and underscores.',
        'auth.provider.email': 'Email Login',
        'auth.provider.google': 'Google Login',
        'auth.provider.kakao': 'Kakao Login',
        'auth.provider.naver': 'Naver Login',

        // Import Feature
        'import.addToMyMap': 'Add to My Map',
        'import.alreadyAdded': 'Already Added',
        'import.importing': 'Importing...',
        'import.success': 'Place added to your map',
        'import.error': 'Failed to add place',
        'import.duplicate': 'Similar place already exists',
        'import.viewingShared': (nickname) => `Shared by ${nickname}`,
        'import.copyPhotos': 'Copy photos too',
        'import.photosWillCopy': 'Photos will be copied',
        'import.photosWontCopy': 'Photos will not be copied',
        'import.storageLimit': 'Photo storage limit exceeded',
        'import.confirmTitle': 'Import Place',
        'import.confirmMessage': 'Add this place to your map?',
        'import.loginRequired': 'Login required to add places',

        // Share Link Feature
        'share.title': 'Share Places',
        'share.expiration': 'Link Expiration',
        'share.24hours': '24 Hours',
        'share.7days': '7 Days',
        'share.30days': '30 Days',
        'share.never': 'Never',
        'share.generateLink': 'Generate Link',
        'share.activeLinks': 'Active Share Links',
        'share.noLinks': 'No active links',
        'share.expires': 'Expires',
        'share.accessed': 'Accessed',
        'share.times': 'times',
        'share.deleteLink': 'Delete',
        'share.linkExpired': 'Share link has expired',
        'share.linkInvalid': 'Invalid share link',
        'share.linkDeleted': 'Share link deleted',
        'share.linkGenerated': 'Share link generated',
        'share.deleteConfirm': 'Are you sure you want to delete this share link?',
        'share.placesCount': 'Shared places',
        'share.allPlaces': 'All places',
        'share.deleteConfirm': 'Delete this share link?',
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
const boardBtn = document.getElementById('board-btn');

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

const mapSearchInput = document.getElementById('map-search-input');
const searchResults = document.getElementById('search-results');
const searchClearBtn = document.getElementById('search-clear-btn');

let lightboxImages = [];
let currentLightboxIndex = 0;

let uploadedPhotos = [];
let allPlaces = [];
let currentFilteredPlaces = []; // Global store for filtered places
let isSignUpMode = false;
let searchMarker = null; // Temporary marker for a selected search result

// Initialize Map
// Map tile layer configurations
const MAP_STYLES = {
    default: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors'
    },
    dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap © CARTO'
    },
    light: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap © CARTO'
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '© Esri'
    }
};

let currentTileLayer = null;

function initMap() {
    map = L.map('map').setView(DEFAULT_COORD, 13);

    // Apply saved map style
    applyMapStyle(userSettings.mapStyle || 'default');

    // 클릭 시 모달 열기
    map.on('click', (e) => {
        // UI 영역(상단 바, 좌우측 바) 클릭 시 무시
        const point = map.mouseEventToContainerPoint(e.originalEvent);
        const width = map.getSize().x;

        const TOP_BAND = 80; // 검색바 영역 높이
        const SIDE_BAND = 60; // 좌우측 버튼 영역 너비

        if (point.y < TOP_BAND || point.x < SIDE_BAND || point.x > (width - SIDE_BAND)) {
            return;
        }

        const { lat, lng } = e.latlng;

        // Guest logic: Registration requires login
        if (!currentUser) {
            authOverlay.classList.remove('hidden');
            showToast(t('ui.loginRequired') || '로그인이 필요합니다.');
            return;
        }

        // 폼 먼저 열기
        openModal(null, lat, lng, 'Loading location info...');

        // 비동기로 주소 찾기
        reverseGeocode(lat, lng).then(address => {
            // 모달이 아직 열려있고 입력값이 기본값인 경우에만 업데이트
            const addrInput = document.getElementById('place-address');
            const originalAddrInput = document.getElementById('place-address-original');
            if (!modalOverlay.classList.contains('hidden')) {
                if (addrInput) addrInput.value = address;
                if (originalAddrInput) originalAddrInput.value = address;
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
        const wasGuest = !currentUser;
        currentUser = session?.user || null;
        updateAuthUI();

        // Handle redirection if flag is set (e.g., from 'Go to My Map' banner)
        if (event === 'SIGNED_IN' && wasGuest && sessionStorage.getItem('redirect_to_my_map') === 'true') {
            sessionStorage.removeItem('redirect_to_my_map');
            window.location.href = window.location.pathname;
            return;
        }

        loadPlaces();
        loadPinSettings();
    });

    // UI 요소 클릭 시 지도 클릭 이벤트 전파 방지 (장소 등록 중복 방지)
    const uiContainers = [
        document.querySelector('.search-container'),
        document.querySelector('.map-controls-repositioned'),
        document.getElementById('user-info-panel'),
        document.getElementById('date-filter-panel'),
        document.getElementById('sidebar')
    ];

    uiContainers.forEach(container => {
        if (container) {
            L.DomEvent.disableClickPropagation(container);
        }
    });

    // Board button event listener with auth check
    if (boardBtn) {
        boardBtn.addEventListener('click', () => {
            if (!currentUser) {
                authOverlay.classList.remove('hidden');
                showToast(t('ui.loginRequired') || '로그인이 필요합니다.');
                return;
            }
            window.location.href = './board.html';
        });
    }
}

// Load Places from Supabase
async function loadPlaces() {
    if (isSharedMode) return; // Don't load default places if we are viewing a shared link

    let query = supabase.from('places').select('*');

    if (currentUser) {
        query = query.eq('user_id', currentUser.id);
        const { data: places, error } = await query;

        if (error) {
            if (import.meta.env.DEV) {
                console.error('Error loading places:', error);
            }
            showToast('Error loading data.');
            return;
        }
        allPlaces = places || [];
    } else {
        // Not logged in and not in shared mode: show empty map
        allPlaces = [];
    }

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
        className: 'custom-pin-icon',
        html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.4)); transform: translate(-50%, -50%); cursor: pointer;">
                <path fill="${place.color}" d="M12 0C7.58 0 4 3.58 4 8c0 5.25 7 13 8 13s8-7.75 8-13c0-4.42-3.58-8-8-8zm0 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
               </svg>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    const marker = L.marker([place.latitude, place.longitude], { icon });
    if (map) {
        marker.addTo(map);
    } else {
        console.warn('Map not ready for marker:', place.name);
    }

    const photosHtml = (place.photo_urls && place.photo_urls.length > 0)
        ? `<div class="popup-gallery">
            ${place.photo_urls.map((url, idx) => `<img src="${url}" onclick='window.showLightbox(${JSON.stringify(place.photo_urls)}, ${idx})'>`).join('')}
           </div>`
        : '';

    const commentHtml = place.comment
        ? `<p class="popup-comment">${escapeHtml(place.comment)}</p>`
        : '';

    // Show edit button only if: not in shared mode AND (no user logged in OR user owns this place)
    const canEdit = !isSharedMode && (!currentUser || place.user_id === currentUser.id);

    // Show import button in shared mode
    const isAlreadyImported = importedPlaceIds.has(place.id);
    const importButtonHtml = isSharedMode
        ? `<div class="popup-actions">
            <button class="import-popup-btn ${isAlreadyImported ? 'disabled' : ''}" 
                    onclick="window.showImportModal('${place.id}')" 
                    ${isAlreadyImported ? 'disabled' : ''}>
                ${isAlreadyImported ? escapeHtml(t('import.alreadyAdded')) : escapeHtml(t('import.addToMyMap'))}
            </button>
           </div>`
        : '';

    const popupContent = `
        <div class="popup-content">
            <h3><span style="color: ${place.color}">●</span> ${escapeHtml(place.name)}</h3>
            ${photosHtml}
            <div class="popup-rating">${'★'.repeat(place.rating)}${'☆'.repeat(5 - place.rating)}</div>
            <p style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">${place.visit_date || 'No date specified'}</p>
            ${commentHtml}
            ${canEdit ? `<div class="popup-actions">
                <button class="edit-popup-btn" onclick="window.editPlace('${place.id}')">${escapeHtml(t('ui.editDetails'))}</button>
            </div>` : ''}
            ${importButtonHtml}
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

    const isAlreadyImported = importedPlaceIds.has(place.id);
    const importButtonHtml = isSharedMode
        ? `<button class="import-list-btn ${isAlreadyImported ? 'disabled' : ''}" 
                   onclick="event.stopPropagation(); window.showImportModal('${place.id}')"
                   ${isAlreadyImported ? 'disabled' : ''}
                   style="margin-top: 8px; padding: 6px 12px; border-radius: 6px; border: none; background: ${isAlreadyImported ? '#475569' : 'var(--primary)'}; color: white; font-size: 12px; cursor: ${isAlreadyImported ? 'not-allowed' : 'pointer'}; width: 100%;">
               ${isAlreadyImported ? escapeHtml(t('import.alreadyAdded')) : escapeHtml(t('import.addToMyMap'))}
           </button>`
        : '';

    item.innerHTML = `
        ${isSharedMode ? '' : `<button class="delete-item-btn" title="${t('ui.deleteTooltip')}" onclick="event.stopPropagation(); window.deletePlaceDirectly('${place.id}')">&times;</button>`}
        <h3>${escapeHtml(place.name)}</h3>
        <div class="meta">
            <div class="sidebar-stars">${starsHtml}</div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <label class="visibility-toggle" style="${isSharedMode ? 'cursor: default; opacity: 0.7;' : ''}" onclick="event.stopPropagation();">
                    <input type="checkbox" ${place.is_public ? 'checked' : ''} ${isSharedMode ? 'disabled' : ''} onchange="window.togglePlaceVisibility('${place.id}', this.checked)">
                    <span class="visibility-label">${t('ui.public')}</span>
                </label>
                <div style="display: flex; align-items: center;">
                    <span class="color-bullet" style="background-color: ${place.color}; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%;"></span>
                    <span style="font-size: 12px; color: #94a3b8; margin-left: 4px;">${place.visit_date || ''}</span>
                </div>
            </div>
        </div>
        ${importButtonHtml}
    `;
    item.onclick = () => {
        map.flyTo([place.latitude, place.longitude], 16);
        const marker = markers.find(m => m.placeId === place.id);
        if (marker) marker.openPopup();
        if (window.innerWidth < 768) sidebar.classList.add('hidden');
    };

    placeList.appendChild(item);
}

// Toggle Place Visibility
window.togglePlaceVisibility = async (placeId, isPublic) => {
    try {
        const { error } = await supabase
            .from('places')
            .update({ is_public: isPublic })
            .eq('id', placeId);

        if (error) throw error;

        // Update local state
        const placeIdx = allPlaces.findIndex(p => p.id === placeId);
        if (placeIdx !== -1) {
            allPlaces[placeIdx].is_public = isPublic;
        }

        showToast(t('save.success'));
    } catch (err) {
        console.error('Error toggling visibility:', err);
        showToast(t('save.error'));
        // Revert checkbox state if needed (sidebar re-rendering usually handles this, but for better UX...)
        loadPlaces();
    }
};

// Apply Map Style
function applyMapStyle(styleName) {
    const style = MAP_STYLES[styleName] || MAP_STYLES.default;

    // Remove existing tile layer
    if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
    }

    // Add new tile layer
    currentTileLayer = L.tileLayer(style.url, {
        attribution: style.attribution,
        crossOrigin: 'anonymous'
    }).addTo(map);
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
        // Store original English address in hidden field
        document.getElementById('place-address-original').value = place.address || '';
        // Display English address in visible field
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
        document.getElementById('modal-title').innerText = t('modal.newPlace');
        placeForm.reset();
        document.getElementById('place-id').value = '';
        document.getElementById('place-lat').value = lat;
        document.getElementById('place-lng').value = lng;
        // Store original English address in hidden field
        document.getElementById('place-address-original').value = address;
        // Display English address in visible field
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
    const PER_PIN_LIMIT = 10;
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
    // Use the original English address from hidden field for storage
    const address = document.getElementById('place-address-original').value;
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
    // Guest logic: Delete requires login
    if (!currentUser) {
        authOverlay.classList.remove('hidden');
        showToast(t('ui.loginRequired') || '로그인이 필요합니다.');
        return;
    }

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
    // Guest logic: View Details/Edit requires login (as per user request "editing requires login")
    // Note: If we want guests to view details but not edit, we'd need a separate view-only modal mode.
    // For now, following strict "Require login only when saving or editing"
    if (!currentUser) {
        authOverlay.classList.remove('hidden');
        showToast(t('ui.loginRequired') || '로그인이 필요합니다.');
        return;
    }

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
    currentFilteredPlaces = filtered; // Update global store
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

// Quick Date Filter button logic
document.querySelectorAll('.quick-date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const year = btn.dataset.year;
        if (year && dateFromInput && dateToInput) {
            dateFromInput.value = `${year}-01-01`;
            dateToInput.value = `${year}-12-31`;

            // Programmatically click apply button
            if (applyDateFilterBtn) {
                applyDateFilterBtn.click();
            }
        }
    });
});


// Auth Logic
function updateAuthUI() {
    if (currentUser) {
        authOverlay.classList.add('hidden'); // Force logged in users past the gate
        authToggleBtn.innerHTML = '<span class="icon">👤</span>';
        authToggleBtn.title = `My Info (${currentUser.email})`;

        // Populate User Info Panel
        userInfoEmail.innerText = currentUser.email;
        userAvatarInitial.innerText = currentUser.email[0].toUpperCase();

        const provider = currentUser.app_metadata.provider || 'email';
        userInfoProvider.innerText = t(`auth.provider.${provider}`);

        // Update photo count display
        const photoCountEl = document.getElementById('user-photo-count');
        if (photoCountEl) {
            photoCountEl.innerText = `${userPhotoCount} / 300`;
        }

        // Fetch and display nickname
        getUserProfile(currentUser.id).then(profile => {
            if (profile) {
                const nicknameEl = document.getElementById('user-info-nickname');
                if (nicknameEl) nicknameEl.innerText = profile.nickname;
            }
        });
    } else {
        // Guest mode: Don't show auth-overlay automatically anymore
        authToggleBtn.innerHTML = '<span class="icon">👤</span>';
        authToggleBtn.title = 'Login';
        userInfoPanel.classList.add('hidden');
    }
}

// Nickname Event Listeners
function initNicknameListeners() {
    const editBtn = document.getElementById('edit-nickname-inline-btn');
    const modal = document.getElementById('nickname-change-modal');
    const closeBtn = document.getElementById('close-nickname-change');
    const cancelBtn = document.getElementById('cancel-nickname-change');
    const form = document.getElementById('nickname-change-form');
    const newNicknameInput = document.getElementById('new-nickname');

    if (editBtn) {
        editBtn.onclick = () => {
            modal.classList.remove('hidden');
            const currentNickname = document.getElementById('user-info-nickname').innerText;
            newNicknameInput.value = currentNickname;
        };
    }

    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
    if (cancelBtn) cancelBtn.onclick = () => modal.classList.add('hidden');

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const newNickname = newNicknameInput.value.trim();
            const errorMsgEl = document.getElementById('nickname-error-msg');

            if (errorMsgEl) errorMsgEl.classList.add('hidden');
            if (!currentUser) return;

            const result = await updateNickname(currentUser.id, newNickname);
            if (result.success) {
                showToast(t('auth.nicknameUpdated'));
                const nicknameEl = document.getElementById('user-info-nickname');
                if (nicknameEl) nicknameEl.innerText = newNickname;
                modal.classList.add('hidden');
                if (errorMsgEl) errorMsgEl.classList.add('hidden');
            } else {
                let errorText = result.error || t('auth.nicknameUpdateFailed');

                // Map backend errors to localized strings
                if (errorText === 'This nickname is already taken') {
                    errorText = t('auth.errorNicknameTaken');
                } else if (errorText === 'Nickname cannot be empty') {
                    errorText = t('auth.errorNicknameEmpty');
                } else if (errorText === 'Nickname must be 30 characters or less') {
                    errorText = t('auth.errorNicknameTooLong');
                } else if (errorText === 'Nickname can only contain letters, numbers, spaces, hyphens, and underscores') {
                    errorText = t('auth.errorNicknameInvalid');
                }

                if (errorMsgEl) {
                    errorMsgEl.innerText = errorText;
                    errorMsgEl.classList.remove('hidden');
                }
                showToast(errorText, true);
            }
        };
    }
}

// Call during init
document.addEventListener('DOMContentLoaded', () => {
    initNicknameListeners();
});


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

        // Redirect to clean URL without shared link parameters
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.location.href = cleanUrl;
    }
};

// Settings Modal with Handedness Implementation
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const handednessSelect = document.getElementById('handedness-select');
const languageSelect = document.getElementById('language-select');
const mapStyleSelect = document.getElementById('map-style-select');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem('userSettings');
    if (saved) {
        const settings = JSON.parse(saved);
        return settings;
    }
    return { handedness: 'right', language: 'ko', mapStyle: 'default' };
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
// applyMapStyle call removed from here because map is not yet initialized. 
// It is correctly called inside initMap().

if (settingsBtn) {
    settingsBtn.onclick = () => {
        // Load current settings into selects
        const settings = loadSettings();
        handednessSelect.value = settings.handedness;
        languageSelect.value = settings.language;
        mapStyleSelect.value = settings.mapStyle || 'default'; // Ensure default if not set
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
            language: languageSelect.value,
            mapStyle: mapStyleSelect.value
        };
        const languageChanged = userSettings.language !== newSettings.language;
        const mapStyleChanged = userSettings.mapStyle !== newSettings.mapStyle;

        saveSettings(newSettings);
        applyHandedness(newSettings.handedness);
        if (mapStyleChanged) {
            applyMapStyle(newSettings.mapStyle);
        }
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
if (closeAuth) closeAuth.onclick = () => authOverlay.classList.add('hidden');
closeModal.onclick = () => modalOverlay.classList.add('hidden');
ratingInput.oninput = null; // Remove old listener

// Geolocation Button
let currentLocationMarker = null; // Store current location marker

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

            // Remove existing current location marker if any
            if (currentLocationMarker) {
                map.removeLayer(currentLocationMarker);
            }

            // Create a custom icon for current location
            const currentLocationIcon = L.divIcon({
                className: 'current-location-marker',
                html: `
                    <div class="current-location-pin">
                        <div class="current-location-pulse"></div>
                        <div class="current-location-dot"></div>
                    </div>
                `,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            // Add marker at current location
            currentLocationMarker = L.marker([latitude, longitude], {
                icon: currentLocationIcon
            }).addTo(map);

            // Add popup
            currentLocationMarker.bindPopup(`
                <div class="popup-content">
                    <h3>📍 현재 위치</h3>
                    <p style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
                        위도: ${latitude.toFixed(6)}<br>
                        경도: ${longitude.toFixed(6)}
                    </p>
                </div>
            `);

            showToast(t('geo.moved'));
        },
        (err) => {
            showToast(t('geo.failed'));
            console.error(err);
        },
        {
            enableHighAccuracy: false, // 빠른 위치 탐지 (정확도 낮음)
            timeout: 5000, // 5초 타임아웃
            maximumAge: 30000 // 30초 이내 캐시된 위치 사용
        }
    );
};

function showToast(msg, isError = false) {
    if (isError) {
        toast.classList.add('error');
    } else {
        toast.classList.remove('error');
    }
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
        toast.classList.remove('error');
    }, 3500);
}

// Update UI Language
function updateUILanguage() {
    const lang = userSettings.language || 'ko';


    const sidebarHeader = document.querySelector('#sidebar h2');
    if (sidebarHeader) sidebarHeader.innerText = t('ui.placeList');

    updateColorPickerLabels();    // Place Modal
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

    // Pin Settings Modal
    const pinSettingsTitle = document.getElementById('pin-settings-title');
    if (pinSettingsTitle) pinSettingsTitle.innerText = t('ui.pinSettings');
    const pinSettingsSaveBtn = document.getElementById('save-pin-settings');
    if (pinSettingsSaveBtn) pinSettingsSaveBtn.innerText = t('ui.save');

    // Update map control titles
    const pinSettingsControl = document.getElementById('pin-settings-btn');
    if (pinSettingsControl) pinSettingsControl.title = t('ui.pinSettings');

    updateColorPickerLabels();
    updateColorPickerLabels();

    const dateFromLabel = document.querySelector('label[for="date-from"]');
    if (dateFromLabel) dateFromLabel.innerText = t('ui.startDate');

    const dateToLabel = document.querySelector('label[for="date-to"]');
    if (dateToLabel) dateToLabel.innerText = t('ui.endDate');

    const applyDateFilterBtn = document.getElementById('apply-date-filter');
    if (applyDateFilterBtn) applyDateFilterBtn.innerText = t('ui.apply');

    const clearDateFilterBtn = document.getElementById('clear-date-filter');
    if (clearDateFilterBtn) clearDateFilterBtn.innerText = t('ui.clear');

    // Quick Date Filter Buttons
    const quickDateBtns = document.querySelectorAll('.quick-date-btn');
    quickDateBtns.forEach(btn => {
        const range = btn.getAttribute('data-range');
        if (range === 'last-month') btn.innerText = t('ui.lastMonth');
        else if (range === 'this-month') btn.innerText = t('ui.thisMonth');
        else if (range === 'last-week') btn.innerText = t('ui.lastWeek');
    });

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

    const mapStyleLabel = document.querySelectorAll('#settings-modal label')[2];
    if (mapStyleLabel) mapStyleLabel.innerText = t('ui.mapStyle');

    const mapStyleOptions = document.querySelectorAll('#map-style-select option');
    if (mapStyleOptions[0]) mapStyleOptions[0].innerText = t('ui.mapStyleDefault');
    if (mapStyleOptions[1]) mapStyleOptions[1].innerText = t('ui.mapStyleDark');
    if (mapStyleOptions[2]) mapStyleOptions[2].innerText = t('ui.mapStyleLight');
    if (mapStyleOptions[3]) mapStyleOptions[3].innerText = t('ui.mapStyleSatellite');

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

    // Nickname Modal
    const nicknameModalHeader = document.querySelector('#nickname-change-modal h2');
    if (nicknameModalHeader) nicknameModalHeader.innerText = t('ui.changeNickname');

    const nicknameLabel = document.querySelector('label[for="new-nickname"]');
    if (nicknameLabel) nicknameLabel.innerText = t('ui.newNickname');

    const nicknameInput = document.getElementById('new-nickname');
    if (nicknameInput) nicknameInput.placeholder = t('ui.nicknamePlaceholder');

    const nicknameHelp = document.getElementById('new-nickname-help');
    if (nicknameHelp) {
        nicknameHelp.innerText = t('ui.nicknameHelp');
    }

    const nicknameSubmitBtn = document.getElementById('submit-nickname-change');
    if (nicknameSubmitBtn) nicknameSubmitBtn.innerText = t('ui.update');

    const nicknameCancelBtn = document.getElementById('cancel-nickname-change');
    if (nicknameCancelBtn) nicknameCancelBtn.innerText = t('ui.cancel');

    // Inline nickname label in user info panel
    const inlineNicknameLabel = document.getElementById('user-info-nickname-label');
    if (inlineNicknameLabel) inlineNicknameLabel.innerText = t('ui.nickname');

    const uploadedImagesLabel = document.getElementById('uploaded-images-label');
    if (uploadedImagesLabel) uploadedImagesLabel.innerText = t('ui.uploadedImages');

    const goToMyMapBtn = document.getElementById('go-to-my-map-btn');
    if (goToMyMapBtn) goToMyMapBtn.innerText = t('ui.goToMyMap');

    // Update login provider info
    if (currentUser) {
        const provider = currentUser.app_metadata.provider || 'email';
        const userInfoProvider = document.getElementById('user-info-provider');
        if (userInfoProvider) userInfoProvider.innerText = t(`auth.provider.${provider}`);
    }

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
        console.log('🔍 Fetching search results for:', query);
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Search Response Error:', response.status, errorText);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Search results data:', data);
        const results = data.results || [];

        if (results.length > 0) {
            renderSearchResults(results);
        } else {
            searchResults.innerHTML = '<div class="search-result-item" style="color: #94a3b8; text-align: center; padding: 16px;">검색 결과가 없습니다</div>';
            searchResults.classList.remove('hidden');
        }
    } catch (err) {
        console.error('❌ Search Error:', err);
        searchResults.innerHTML = '<div class="search-result-item" style="color: #ef4444; text-align: center; padding: 16px;">검색 중 오류가 발생했습니다</div>';
        searchResults.classList.remove('hidden');
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

        const name = result.display_name;
        const address = result.address || '';
        const type = result.type || '';

        // Translate address for display if user language is Korean
        const displayAddress = translateAddress(address);

        item.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <span class="search-result-name">${escapeHtml(name)}</span>
                ${type ? `<span class="search-result-type">${escapeHtml(type)}</span>` : ''}
            </div>
            <span class="search-result-address">${escapeHtml(displayAddress)}</span>
        `;

        item.onclick = () => {
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);

            // Hide search results first
            searchResults.classList.add('hidden');
            mapSearchInput.value = name;

            // Remove existing search marker
            if (searchMarker) {
                map.removeLayer(searchMarker);
            }

            // Fly to location with smooth animation
            map.flyTo([lat, lon], 16, {
                duration: 1.0,
                easeLinearity: 0.25
            });

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

            const categoryInfo = categoryMap[type.toLowerCase()] || { icon: '📍', class: 'default' };

            // Create new search marker with category icon
            const icon = L.divIcon({
                className: `category-pin ${categoryInfo.class}`,
                html: `<div class="category-icon-inner">${categoryInfo.icon}</div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
                popupAnchor: [0, -18]
            });

            searchMarker = L.marker([lat, lon], { icon }).addTo(map);

            // Add popup to the search marker
            // Display translated address in popup but pass original English address to addFromSearch
            const displayAddressInPopup = translateAddress(address);
            searchMarker.bindPopup(`
                <div class="popup-content">
                    <h3>${escapeHtml(name)}</h3>
                    <p style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">${escapeHtml(displayAddressInPopup)}</p>
                    <button class="edit-popup-btn" style="background: var(--primary);" onclick="window.addFromSearch('${escapeHtml(name)}', '${escapeHtml(address)}', ${lat}, ${lon})">저장하기</button>
                </div>
            `);

            // Open popup after map animation completes (better for mobile)
            map.once('moveend', () => {
                setTimeout(() => {
                    searchMarker.openPopup();
                }, 100);
            });
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

    // Share Buttons Event Listeners
    const shareImageBtn = document.getElementById('share-image-btn');
    const shareLinkBtn = document.getElementById('share-link-btn');

    if (shareImageBtn) {
        shareImageBtn.onclick = (e) => {
            e.stopPropagation();
            generateShareImage();
        };
    }

    if (shareLinkBtn) {
        shareLinkBtn.onclick = (e) => {
            e.stopPropagation();
            copyShareLink();
        };
    }

    // Check for share key in URL
    const urlParams = new URLSearchParams(window.location.search);
    const shareKey = urlParams.get('s');
    if (shareKey) {
        isSharedMode = true; // Set flag early
        loadSharedContent(shareKey);
    }
}


// Share as Link Logic (Secure Snapshot)
async function copyShareLink() {
    if (!currentUser) {
        showToast(t('ui.loginRequired') || '로그인이 필요합니다.');
        return;
    }

    // Use currently filtered places (what user sees on screen)
    const placesToShare = currentFilteredPlaces.length > 0 ? currentFilteredPlaces : allPlaces;

    // Only share public places from the filtered list
    const publicPlaces = placesToShare.filter(p => p.is_public);
    if (publicPlaces.length === 0) {
        showToast(t('ui.noPlacesToShare') || '공유할 공개 장소가 없습니다.');
        return;
    }

    try {
        // Create a unique share key (random string)
        const shareKey = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

        // Save to shared_links table with place_ids
        const { error } = await supabase.from('shared_links').insert([{
            share_key: shareKey,
            user_id: currentUser.id,
            place_ids: publicPlaces.map(p => p.id),
            created_at: new Date()
        }]);

        if (error) throw error;

        const shareUrl = `${window.location.origin}${window.location.pathname}?s=${shareKey}`;
        await navigator.clipboard.writeText(shareUrl);
        showToast(t('ui.linkCopied') || '공유 링크가 클립보드에 복사되었습니다.');
    } catch (err) {
        console.error('Link sharing failed:', err);
        showToast(`Link sharing failed: ${err.message || 'Unknown error'} `);
    }
}

// Load Content from Share Link
async function loadSharedContent(shareKey) {
    try {
        // Fetch shared link info
        const { data: sharedInfo, error: shareError } = await supabase
            .from('shared_links')
            .select('place_ids')
            .eq('share_key', shareKey)
            .single();

        if (shareError || !sharedInfo) {
            showToast('Invalid or expired share link.');
            return;
        }

        if (!sharedInfo.place_ids || sharedInfo.place_ids.length === 0) {
            showToast('공유된 장소가 없습니다.');
            return;
        }

        // Fetch places by IDs - ONLY public places
        const { data: places, error: placesError } = await supabase
            .from('places')
            .select('*')
            .in('id', sharedInfo.place_ids)
            .eq('is_public', true);

        if (placesError) throw placesError;

        allPlaces = places || [];
        currentFilteredPlaces = allPlaces;

        // Toggle sidebar and show results
        sidebar.classList.remove('hidden');
        renderFilteredList(allPlaces);

        // Zoom to fit all markers
        if (allPlaces.length > 0) {
            const bounds = L.latLngBounds(allPlaces.map(p => [p.latitude, p.longitude]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }

        showToast(t('ui.viewingSharedList') || '공개된 공유 리스트를 보고 있습니다.');
    } catch (err) {
        console.error('Loading shared content failed:', err);
        showToast('Failed to load shared content.');
    }
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
window.addFromSearch = async (name, address, lat, lon) => {
    // Guest logic: Registration requires login
    if (!currentUser) {
        authOverlay.classList.remove('hidden');
        showToast(t('ui.loginRequired') || '로그인이 필요합니다.');
        return;
    }

    // Open modal first with a loading message
    openModal(null, lat, lon, 'Loading location info...');
    document.getElementById('place-name').value = name;

    // Fetch address from Nominatim to ensure consistency with map click behavior
    const nominatimAddress = await reverseGeocode(lat, lon);

    // Update both display and hidden address fields with Nominatim address
    const addrInput = document.getElementById('place-address');
    const originalAddrInput = document.getElementById('place-address-original');
    if (addrInput) addrInput.value = nominatimAddress;
    if (originalAddrInput) originalAddrInput.value = nominatimAddress;
};


// --- Cyberpunk Dashboard Share Image Logic ---
async function generateShareImage() {
    const template = document.getElementById('share-card-template');
    if (!template) return;

    // Use currentFilteredPlaces if available, otherwise fallback to allPlaces
    const targetPlaces = currentFilteredPlaces.length > 0 ? currentFilteredPlaces : allPlaces;
    if (targetPlaces.length === 0) {
        showToast(t('ui.noPlacesToShare') || '공유할 장소가 없습니다.');
        return;
    }

    const topPlaces = targetPlaces.slice(0, 8);

    // Calculate statistics
    const uniqueCountries = new Set(topPlaces.map(p => {
        const parts = p.address?.split(',') || [];
        return parts.length > 0 ? parts[parts.length - 1].trim() : '';
    }).filter(c => c)).size;

    const avgRating = (topPlaces.reduce((sum, p) => sum + (p.rating || 0), 0) / topPlaces.length).toFixed(1);

    // Update stat cards
    document.querySelector('#stat-places .stat-number').textContent = topPlaces.length;
    document.querySelector('#stat-countries .stat-number').textContent = uniqueCountries;
    document.querySelector('#stat-rating .stat-number').textContent = `${avgRating}★`;

    // Calculate progress (example: 80% of 10 places goal)
    const goalPlaces = 10;
    const progressPercent = Math.min(100, Math.round((topPlaces.length / goalPlaces) * 100));
    document.querySelector('.progress-text').textContent = `${progressPercent}%`;

    // Update progress circle
    const progressCircle = document.getElementById('progress-circle');
    const circumference = 2 * Math.PI * 50;
    const offset = circumference - (progressPercent / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;

    // Add top 4 photos
    const photosGrid = document.getElementById('top-photos');
    photosGrid.innerHTML = '';
    topPlaces.slice(0, 4).forEach(place => {
        if (place.photo_urls && place.photo_urls.length > 0) {
            const img = document.createElement('img');
            img.src = place.photo_urls[0];
            img.crossOrigin = 'anonymous';
            photosGrid.appendChild(img);
        }
    });

    // Calculate most visited type (simplified)
    document.querySelector('.mv-value').textContent = 'Cafes';

    // Create month timeline
    const monthTimeline = document.getElementById('month-timeline');
    monthTimeline.innerHTML = '';
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

    // Count visits per month
    const monthCounts = new Array(12).fill(0);
    topPlaces.forEach(place => {
        if (place.visit_date) {
            const month = new Date(place.visit_date).getMonth();
            monthCounts[month]++;
        }
    });

    const maxCount = Math.max(...monthCounts, 1);
    months.forEach((month, i) => {
        const bar = document.createElement('div');
        bar.className = 'month-bar';
        const height = (monthCounts[i] / maxCount) * 100;
        bar.style.height = `${Math.max(height, 5)}%`;
        bar.setAttribute('data-month', month);
        monthTimeline.appendChild(bar);
    });

    // Capture map with iOS Safari optimizations
    const mapElement = document.getElementById('map');
    const controls = document.querySelectorAll('.leaflet-control-container, .search-container, .map-controls-repositioned, .sidebar');

    controls.forEach(c => c.style.visibility = 'hidden');

    let mapDataUrl = '';
    try {
        // Wait longer for tiles to fully load (especially important for iOS)
        await new Promise(resolve => setTimeout(resolve, 1500));

        mapDataUrl = await htmlToImage.toPng(mapElement, {
            quality: 0.95,
            pixelRatio: 1,
            cacheBust: true,
            skipFonts: true,
            // iOS-specific optimizations
            width: mapElement.offsetWidth,
            height: mapElement.offsetHeight,
            style: {
                transform: 'none',
                webkitTransform: 'none'
            }
        });
    } catch (err) {
        console.error('Map capture failed:', err);

        // Fallback: Try alternative method for iOS
        try {
            console.log('Trying alternative map capture method...');
            const leafletPane = mapElement.querySelector('.leaflet-map-pane');
            if (leafletPane) {
                await new Promise(resolve => setTimeout(resolve, 500));
                mapDataUrl = await htmlToImage.toPng(mapElement, {
                    quality: 0.9,
                    pixelRatio: 1,
                    cacheBust: true,
                    skipFonts: true,
                    backgroundColor: '#1a1a2e'
                });
            }
        } catch (fallbackErr) {
            console.error('Alternative map capture also failed:', fallbackErr);
            showToast('지도 캡처 실패. 잠시 후 다시 시도해주세요.');
        }
    } finally {
        controls.forEach(c => c.style.visibility = 'visible');
    }

    // Insert map into template
    const mapContainer = document.getElementById('cyberpunk-map-container');
    mapContainer.innerHTML = '';
    if (mapDataUrl) {
        const mapImg = document.createElement('img');
        mapImg.src = mapDataUrl;
        mapImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover; filter: brightness(0.7) saturate(1.2);';
        mapContainer.appendChild(mapImg);
    }

    // Setup template visibility
    const oldScrollX = window.scrollX;
    const oldScrollY = window.scrollY;
    window.scrollTo(0, 0);

    template.style.cssText = `
        display: flex !important;
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 1080px !important;
        height: 1080px !important;
        z-index: 999999 !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;

    // Wait for everything to render
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Capture the cyberpunk dashboard
    try {
        console.log('Generating cyberpunk dashboard image...');
        const finalDataUrl = await htmlToImage.toPng(template, {
            pixelRatio: 2,
            width: 1080,
            height: 1080,
            cacheBust: true
        });

        const link = document.createElement('a');
        link.download = `MapNote_Wrapped_${new Date().getTime()}.png`;
        link.href = finalDataUrl;
        link.click();
        showToast('Travel Wrapped image saved!');
    } catch (err) {
        console.error('Dashboard capture failed:', err);
        showToast('Failed to generate image: ' + err.message);
    } finally {
        template.style.display = 'none';
        window.scrollTo(oldScrollX, oldScrollY);
    }
}

// Google OAuth Login Handler
const googleLoginBtn = document.getElementById('auth-google');
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        try {
            // Get the current page URL to redirect back after OAuth
            const currentUrl = window.location.href;

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: currentUrl
                }
            });

            if (error) throw error;
            // OAuth will redirect to Google, then back to our app
        } catch (error) {
            console.error('Google login error:', error);
            showToast('Google login failed: ' + error.message, true);
        }
    });
}

// Quick Date Filter Event Handlers
const quickDateBtns = document.querySelectorAll('.quick-date-btn');
quickDateBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const range = btn.getAttribute('data-range');
        const year = btn.getAttribute('data-year');
        let startDate, endDate;
        const today = new Date();

        if (year) {
            // Year filter: January 1st to December 31st of the selected year
            startDate = new Date(parseInt(year), 0, 1);
            endDate = new Date(parseInt(year), 11, 31);
        } else if (range) {
            // Quick date range filters
            switch (range) {
                case 'last-month':
                    // Get first and last day of previous month
                    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
                    endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
                    break;

                case 'this-month':
                    // Get first day of current month to today
                    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    endDate = new Date(today);
                    break;

                case 'last-week':
                    // Get date 7 days ago to today
                    startDate = new Date(today);
                    startDate.setDate(today.getDate() - 7);
                    endDate = new Date(today);
                    break;
            }
        }

        // Format dates as YYYY-MM-DD for input fields
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Set the date input fields
        if (startDate && endDate) {
            dateFromInput.value = formatDate(startDate);
            dateToInput.value = formatDate(endDate);

            // Apply the filter automatically
            applyDateFilter();
        }
    });
});

// ========== IMPORT FUNCTIONALITY ==========

// Update shared mode UI
function updateSharedModeUI() {
    const banner = document.getElementById('shared-mode-banner');
    const bannerText = document.getElementById('shared-mode-text');
    const goToMyMapBtn = document.getElementById('go-to-my-map-btn');

    if (isSharedMode && banner && bannerText) {
        banner.classList.remove('hidden');
        bannerText.textContent = t('import.viewingShared', sharedUserNickname || 'Anonymous');

        if (goToMyMapBtn) {
            goToMyMapBtn.classList.remove('hidden');
            goToMyMapBtn.onclick = () => {
                if (!currentUser) {
                    // Set flag to redirect after login
                    sessionStorage.setItem('redirect_to_my_map', 'true');
                    authOverlay.classList.remove('hidden');
                    showToast(t('ui.loginRequired') || '로그인이 필요합니다.');
                } else {
                    // Clear URL parameters and reload to show user's own map
                    window.location.href = window.location.pathname;
                }
            };
        }
    } else if (banner) {
        banner.classList.add('hidden');
    }
}

// Show import confirmation modal
window.showImportModal = (placeId) => {
    if (!currentUser) {
        authOverlay.classList.remove('hidden');
        showToast(t('import.loginRequired'));
        return;
    }

    const place = allPlaces.find(p => p.id === placeId);
    if (!place) return;

    const modal = document.getElementById('import-modal');
    const titleEl = document.getElementById('import-modal-title');
    const messageEl = document.getElementById('import-modal-message');
    const copyPhotosCheckbox = document.getElementById('import-copy-photos');
    const photoNote = document.getElementById('import-photo-note');
    const confirmBtn = document.getElementById('confirm-import-btn');

    titleEl.textContent = t('import.confirmTitle');
    messageEl.textContent = t('import.confirmMessage');
    copyPhotosCheckbox.checked = false; // Default: don't copy photos
    photoNote.textContent = t('import.photosWontCopy');

    // Update note text when checkbox changes
    copyPhotosCheckbox.onchange = () => {
        photoNote.textContent = copyPhotosCheckbox.checked
            ? t('import.photosWillCopy')
            : t('import.photosWontCopy');
    };

    // Set up confirm button
    confirmBtn.onclick = async () => {
        const copyPhotos = copyPhotosCheckbox.checked;
        modal.classList.add('hidden');
        await importPlaceToMyMap(place, copyPhotos);
    };

    modal.classList.remove('hidden');
};

// Check if similar place already exists
async function checkIfPlaceExists(place) {
    if (!currentUser) return null;

    try {
        // Check by coordinates (within ~10 meters)
        const latThreshold = 0.0001; // ~11 meters
        const lngThreshold = 0.0001;

        const { data, error } = await supabase
            .from('places')
            .select('*')
            .eq('user_id', currentUser.id)
            .gte('latitude', place.latitude - latThreshold)
            .lte('latitude', place.latitude + latThreshold)
            .gte('longitude', place.longitude - lngThreshold)
            .lte('longitude', place.longitude + lngThreshold);

        if (error) throw error;

        if (data && data.length > 0) {
            return data[0]; // Return first matching place
        }

        return null;
    } catch (error) {
        console.error('Error checking for duplicate:', error);
        return null;
    }
}

// Import place to user's map
async function importPlaceToMyMap(sharedPlace, copyPhotos = false) {
    if (!currentUser) {
        showToast(t('import.loginRequired'), true);
        return;
    }

    showToast(t('import.importing'));

    try {
        // Check for duplicates
        const existingPlace = await checkIfPlaceExists(sharedPlace);
        if (existingPlace) {
            showToast(t('import.duplicate'), true);
            return;
        }

        // Prepare place data
        const newPlace = {
            user_id: currentUser.id,
            name: sharedPlace.name,
            address: sharedPlace.address,
            latitude: sharedPlace.latitude,
            longitude: sharedPlace.longitude,
            comment: sharedPlace.comment,
            rating: sharedPlace.rating,
            visit_date: sharedPlace.visit_date,
            color: sharedPlace.color,
            is_public: false, // Default to private
            photo_urls: []
        };

        // Handle photos
        if (copyPhotos && sharedPlace.photo_urls && sharedPlace.photo_urls.length > 0) {
            // Check storage limit
            const photosToAdd = sharedPlace.photo_urls.length;
            if (userPhotoCount + photosToAdd > 300) {
                showToast(t('import.storageLimit'), true);
                return;
            }

            // Copy photos
            const copiedPhotoUrls = await copyPhotosToUserStorage(sharedPlace.photo_urls, sharedPlace.id);
            newPlace.photo_urls = copiedPhotoUrls;
        }

        // Insert new place
        const { data, error } = await supabase
            .from('places')
            .insert([newPlace])
            .select();

        if (error) throw error;

        // Mark as imported
        importedPlaceIds.add(sharedPlace.id);
        localStorage.setItem(`imported_${sharedUserId}`, JSON.stringify([...importedPlaceIds]));

        // Update UI
        showToast(t('import.success'));

        // Refresh the list to show "Already Added" state
        applyFilters();

    } catch (error) {
        console.error('Error importing place:', error);
        showToast(t('import.error'), true);
    }
}

// Copy photos to user's storage
async function copyPhotosToUserStorage(photoUrls, originalPlaceId) {
    const copiedUrls = [];

    for (const url of photoUrls) {
        try {
            // Download the image
            const response = await fetch(url);
            const blob = await response.blob();

            // Resize and optimize
            const optimizedBlob = await resizeImage(blob);

            // Generate unique filename
            const timestamp = Date.now();
            const randomStr = Math.random().toString(36).substring(7);
            const filename = `${currentUser.id}/${timestamp}_${randomStr}_imported.webp`;

            // Upload to storage
            const { data, error } = await supabase.storage
                .from('place-photos')
                .upload(filename, optimizedBlob, {
                    contentType: 'image/webp',
                    cacheControl: '3600'
                });

            if (error) throw error;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('place-photos')
                .getPublicUrl(filename);

            copiedUrls.push(publicUrl);

        } catch (error) {
            console.error('Error copying photo:', error);
            // Continue with other photos even if one fails
        }
    }

    return copiedUrls;
}

// Set up import modal event listeners
const importModal = document.getElementById('import-modal');
const closeImportModal = document.getElementById('close-import-modal');
const cancelImportBtn = document.getElementById('cancel-import-btn');

if (closeImportModal) {
    closeImportModal.addEventListener('click', () => {
        importModal.classList.add('hidden');
    });
}

if (cancelImportBtn) {
    cancelImportBtn.addEventListener('click', () => {
        importModal.classList.add('hidden');
    });
}

// ========== END IMPORT FUNCTIONALITY ==========

// Load Shared Places - Router function
async function loadSharedPlaces() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const legacyUserId = urlParams.get('shared');

    if (token) {
        // New token-based sharing
        await loadSharedPlacesByToken(token);
    } else if (legacyUserId) {
        // Legacy user ID-based sharing
        await loadSharedPlacesByUserId(legacyUserId);
    }
}

// Start
initMap();
attachPinSettingsEvents();
loadSharedPlaces();
updateUILanguage();

// ========== SHARE LINK TOKEN SYSTEM ==========

// Generate random token
function generateRandomToken(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < length; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// Generate share token
// Generate share token
async function generateShareToken(expirationHours, placeIds = null) {
    if (!currentUser) return null;

    try {
        const token = generateRandomToken(32);

        // Calculate expiration
        const expiresAt = expirationHours === 'never'
            ? new Date('2099-12-31').toISOString()
            : new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();

        // Insert into database
        const { data, error } = await supabase
            .from('share_tokens')
            .insert({
                token,
                user_id: currentUser.id,
                expires_at: expiresAt,
                place_ids: placeIds
            })
            .select()
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error generating share token:', error);
        return null;
    }
}

// Load active share tokens
async function loadActiveShareTokens() {
    if (!currentUser) return [];

    try {
        const { data, error } = await supabase
            .from('share_tokens')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('is_active', true)
            .gte('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error loading share tokens:', error);
        return [];
    }
}

// Deactivate share token
async function deactivateShareToken(tokenId) {
    try {
        const { error } = await supabase
            .from('share_tokens')
            .update({ is_active: false })
            .eq('id', tokenId);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Error deactivating token:', error);
        return false;
    }
}

// Load shared places by token
async function loadSharedPlacesByToken(token) {
    try {
        console.log('Validating token:', token);
        const now = new Date().toISOString();
        console.log('Current time (ISO):', now);

        // Validate token
        const { data: tokenData, error: tokenError } = await supabase
            .from('share_tokens')
            .select('*')
            .eq('token', token)
            .eq('is_active', true)
            .gte('expires_at', now)
            .single();

        if (tokenError || !tokenData) {
            console.error('Token validation failed:', tokenError, tokenData);
            showToast(t('share.linkInvalid'), true);
            return;
        }

        console.log('Token validated successfully:', tokenData);

        // Update access count
        await supabase
            .from('share_tokens')
            .update({
                access_count: tokenData.access_count + 1,
                last_accessed_at: new Date().toISOString()
            })
            .eq('id', tokenData.id);

        // Load shared user's data
        isSharedMode = true;
        sharedUserId = tokenData.user_id;

        // Get user profile
        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('nickname')
                .eq('id', sharedUserId)
                .single();

            if (profileError) {
                console.warn('Profile fetch failed (Token):', profileError);
                sharedUserNickname = 'Anonymous';
            } else {
                sharedUserNickname = profile?.nickname || 'Anonymous';
            }
        } catch (pError) {
            console.error('Error fetching profile (Token):', pError);
            sharedUserNickname = 'Anonymous';
        }

        // Load public places
        let placesQuery = supabase
            .from('places')
            .select('*')
            .eq('user_id', sharedUserId)
            .eq('is_public', true);

        // Filter by specific place IDs if present in token
        if (tokenData.place_ids && tokenData.place_ids.length > 0) {
            placesQuery = placesQuery.in('id', tokenData.place_ids);
        }

        const { data: places, error: placesError } = await placesQuery;

        if (placesError) throw placesError;

        allPlaces = places || [];

        // Load imported place IDs
        const storedImports = localStorage.getItem(`imported_${sharedUserId}`);
        if (storedImports) {
            importedPlaceIds = new Set(JSON.parse(storedImports));
        }

        applyFilters();
        updateSharedModeUI();

        // Auto-show sidebar in shared mode
        if (sidebar) {
            sidebar.classList.remove('hidden');
        }

    } catch (error) {
        console.error('Error loading shared places by token:', error);
        showToast(t('share.linkInvalid'), true);
    }
}

// Load shared places by user ID (legacy support)
async function loadSharedPlacesByUserId(userId) {
    try {
        isSharedMode = true;
        sharedUserId = userId;

        // Get user profile
        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('nickname')
                .eq('id', sharedUserId)
                .single();

            if (profileError) {
                console.warn('Profile fetch failed (User ID):', profileError);
                sharedUserNickname = 'Anonymous';
            } else {
                sharedUserNickname = profile?.nickname || 'Anonymous';
            }
        } catch (pError) {
            console.error('Error fetching profile (User ID):', pError);
            sharedUserNickname = 'Anonymous';
        }

        // Load public places
        const { data: places, error } = await supabase
            .from('places')
            .select('*')
            .eq('user_id', sharedUserId)
            .eq('is_public', true);

        if (error) throw error;

        allPlaces = places || [];

        // Load imported place IDs
        const storedImports = localStorage.getItem(`imported_${sharedUserId}`);
        if (storedImports) {
            importedPlaceIds = new Set(JSON.parse(storedImports));
        }

        applyFilters();
        updateSharedModeUI();

        // Auto-show sidebar in shared mode
        if (sidebar) {
            sidebar.classList.remove('hidden');
        }

    } catch (error) {
        console.error('Error loading shared places:', error);
        showToast('Failed to load shared places', true);
    }
}

// Display active share links
async function loadAndDisplayActiveTokens() {
    const tokens = await loadActiveShareTokens();
    const listEl = document.getElementById('active-links-list');

    if (!listEl) return;

    if (tokens.length === 0) {
        listEl.innerHTML = '';
        return;
    }

    listEl.innerHTML = tokens.map(token => {
        const expiresDate = new Date(token.expires_at);
        const isNeverExpires = expiresDate.getFullYear() >= 2099;
        const expiresText = isNeverExpires
            ? t('share.never')
            : `${t('share.expires')}: ${expiresDate.toLocaleString()}`;

        const placesCountText = token.place_ids
            ? `${token.place_ids.length} ${t('share.placesCount')}`
            : t('share.allPlaces');

        return `
            <div class="active-link-item" onclick="selectShareLink('${token.token}')">
                <div class="link-info">
                    <span class="link-url">${window.location.origin}${window.location.pathname}?token=${token.token}</span>
                    <span class="link-expires">${expiresText}</span>
                    <span class="link-stats">${placesCountText} | ${t('share.accessed')} ${token.access_count} ${t('share.times')}</span>
                </div>
                <button class="delete-link-btn" onclick="event.stopPropagation(); deleteShareLink('${token.id}')">
                    ${t('share.deleteLink')}
                </button>
            </div>
        `;
    }).join('');
}

// Delete share link
window.deleteShareLink = async (tokenId) => {
    if (confirm(t('share.deleteConfirm'))) {
        const success = await deactivateShareToken(tokenId);
        if (success) {
            showToast(t('share.linkDeleted'));
            await loadAndDisplayActiveTokens();
        } else {
            showToast('Failed to delete link', true);
        }
    }
};

// Select existing share link
window.selectShareLink = (token) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?token=${token}`;
    shareLinkUrlInput.value = shareUrl;

    // Show the generated section if hidden
    if (generatedLinkSection) {
        generatedLinkSection.classList.remove('hidden');
    }

    // Animation effect
    if (shareLinkUrlInput) {
        shareLinkUrlInput.classList.remove('highlight-flash');
        void shareLinkUrlInput.offsetWidth; // Trigger reflow
        shareLinkUrlInput.classList.add('highlight-flash');

        // Remove class after animation finishes
        setTimeout(() => {
            shareLinkUrlInput.classList.remove('highlight-flash');
        }, 1200);
    }
};

// Share Link Modal Setup
const shareLinkBtn = document.getElementById('share-link-btn');
const shareLinkModal = document.getElementById('share-link-modal');
const closeShareLinkModal = document.getElementById('close-share-link-modal');
const generateShareLinkBtn = document.getElementById('generate-share-link-btn');
const shareExpirationSelect = document.getElementById('share-expiration');
const shareLinkUrlInput = document.getElementById('share-link-url');
const copyShareLinkBtn = document.getElementById('copy-share-link-btn');
const generatedLinkSection = document.getElementById('generated-link-section');

if (shareLinkBtn) {
    shareLinkBtn.addEventListener('click', async () => {
        if (!currentUser) {
            showToast(t('ui.loginRequired'), true);
            return;
        }

        shareLinkModal.classList.remove('hidden');
        generatedLinkSection.classList.add('hidden');
        await loadAndDisplayActiveTokens();
    });
}

if (closeShareLinkModal) {
    closeShareLinkModal.addEventListener('click', () => {
        shareLinkModal.classList.add('hidden');
    });
}

if (generateShareLinkBtn) {
    generateShareLinkBtn.addEventListener('click', async () => {
        const expiration = shareExpirationSelect.value;
        const expirationHours = expiration === 'never' ? 'never' : parseInt(expiration);

        showToast(t('share.generateLink') + '...');

        // Collect currently filtered place IDs
        const filteredIds = currentFilteredPlaces.map(p => p.id);
        const placeIds = filteredIds.length > 0 ? filteredIds : null;

        const tokenData = await generateShareToken(expirationHours, placeIds);

        if (tokenData) {
            const shareUrl = `${window.location.origin}${window.location.pathname}?token=${tokenData.token}`;
            shareLinkUrlInput.value = shareUrl;
            generatedLinkSection.classList.remove('hidden');
            showToast(t('share.linkGenerated'));

            // Refresh active links list
            await loadAndDisplayActiveTokens();
        } else {
            showToast('Failed to generate link', true);
        }
    });
}

if (copyShareLinkBtn) {
    copyShareLinkBtn.addEventListener('click', () => {
        const url = shareLinkUrlInput.value;
        navigator.clipboard.writeText(url).then(() => {
            showToast(t('ui.linkCopied'));
        }).catch(err => {
            console.error('Failed to copy:', err);
            showToast('Failed to copy link', true);
        });
    });
}

// ========== END SHARE LINK TOKEN SYSTEM ==========
