// ============================================================================
// Supabase 클라이언트 공용 설정 — 로그인 관련 페이지(login.html/auth-callback.html
// 등)가 전부 이 파일을 통해 같은 클라이언트 인스턴스를 씀. battle-themes.js/
// exp-table.js와 같은 이유로 분리(중복 설정 방지, 한 곳만 고치면 됨).
//
// anon key는 공개돼도 되는 값이라 여기 직접 박아둠 — Discord OAuth 클라이언트
// 시크릿이나 Supabase의 service_role 키와는 성격이 다름(그것들은 절대 프론트
// 엔드에 넣으면 안 됨). anon key는 Row Level Security로 보호되는 걸 전제로
// 설계된 "공개 API 키"다.
//
// Supabase JS 라이브러리는 이 파일보다 먼저 로드돼 있어야 함:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//   <script src="supabase-client.js"></script>
// ============================================================================
(function () {
  const SUPABASE_URL = "https://pauhrbebgmukknbrofon.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhdWhyYmViZ211a2tuYnJvZm9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2OTMyMDksImV4cCI6MjEwMjI2OTIwOX0.zKgzNXC7c0SvOt6e3uleMsPxMd2sRI0UwYFujDcxW54";

  if (!window.supabase) {
    console.error("[supabase-client] supabase-js 라이브러리가 먼저 로드돼 있어야 함");
    return;
  }
  window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
