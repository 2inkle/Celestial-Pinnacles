// ============================================================================
// 로그인 가드 공용 스크립트 — Supabase 세션이 없으면 login.html로 리다이렉트.
// web/exp-table.js와 동일한 로드/노출 컨벤션(IIFE, window.AuthGuard로 노출,
// <script src="auth-guard.js"></script>로 단순 로드). supabase-js CDN +
// web/supabase-client.js가 먼저 로드돼 있어야 함(window.sbClient 필요).
//
// 지금까지 어떤 페이지에도 인증 가드가 없었다 — battleSim_username은 전부
// 관리자 판별용이었지 로그인 여부 체크가 아니었음. Supabase 기반으로 전환하는
// 페이지는 데이터 조회 전에 이 requireSession()을 거쳐야 함.
// ============================================================================
(function () {
  window.AuthGuard = {
    // 세션이 있으면 그 세션을 resolve. 없으면 login.html로 보내고, 이 페이지의
    // 나머지 코드가 더 실행되지 않도록 영구히 pending 상태인 Promise를 반환함
    // (redirect가 실제로 페이지를 벗어나기 전까지 호출부의 뒤 이은 await 코드가
    // 잘못된 데이터로 실행되는 걸 막기 위함).
    async requireSession() {
      const { data, error } = await window.sbClient.auth.getSession();
      if (error || !data.session) {
        location.href = new URL("login.html", location.href).toString();
        return new Promise(() => {});
      }
      return data.session;
    },
  };
})();
