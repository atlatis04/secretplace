# Google 로그인 설정

앱은 Supabase OAuth를 사용합니다. Google 로그인 버튼이 Google 화면으로 이동하지 않거나 `redirect_uri_mismatch` 오류를 표시하면 아래 설정을 확인하세요.

1. Supabase Dashboard → **Authentication → Providers → Google**에서 Google provider를 활성화하고, Google Cloud에서 발급한 Client ID와 Client Secret을 저장합니다.
2. Google Cloud Console → **APIs & Services → Credentials**의 해당 OAuth 2.0 Client에서 Authorized redirect URI에 아래 Supabase 콜백 URI를 정확히 추가합니다.

   `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`

   `<SUPABASE_PROJECT_REF>`는 `.env`의 `VITE_SUPABASE_URL`에서 `https://`와 `.supabase.co` 사이의 값입니다.
3. Supabase Dashboard → **Authentication → URL Configuration**에서 Site URL을 실제 배포 도메인으로 설정하고, Redirect URLs에 다음을 추가합니다.

   - `http://localhost:5173/*` (개발)
   - `https://<배포-도메인>/*` (운영)

Google OAuth는 로그인 후 현재 페이지의 경로(예: `/map.html`)로 돌아오므로, 운영 도메인은 와일드카드 경로까지 허용해야 합니다. 설정을 바꾼 뒤에는 브라우저의 팝업 차단을 해제하고 다시 시도하세요.
