// ============================================================================
// 전투 입장 비용(consumesItem 소모재 차감 / attemptCooldownHours 시계) 공용
// 로직 — battle-select.html과 battle-view.html이 함께 씀.
//
// 2026-08-20 신설 배경: 원래 이 로직은 battle-select.html에만 있었고, 페이지를
// 떠나기 "직전"에 딱 한 번만 부과됐다. battle-view.html은 입장 조건을 한 번도
// 검사하지 않아서, battle-view URL을 직접 열거나 "다시 전투하기"를 반복하면
// AFTERMATH(예: 고블린 수송대)를 조건 없이 무한 재도전할 수 있었다 — "한 번의
// 기회가 신중해야 한다"는 설계와 정면 충돌.
//
// 전투 진입 즉시 자동 실행(프리뷰+버튼 클릭 제거)으로 바뀌면서 "새로고침 =
// 전투 1회"가 되므로 이 구멍을 반드시 막아야 했음. 해법: 1회용 입장 토큰
// 대신, battle-view.html이 **전투를 실행할 때마다** 이 모듈로 자격을 확인하고
// 비용을 차감한다. 그러면 새로고침이든 재전투 버튼이든 최초 진입이든 전부
// 같은 관문을 통과해야 하고, 조건을 만족하는 한 몇 번을 다시 열어도 정당하게
// (비용을 다시 치르고) 재도전할 수 있다 — "입장조건만 제대로 확인하고
// 통과시킨다면 새로고침 재전투도 괜찮다"는 설계 의도 그대로.
//
// battle-select.html은 이제 비용을 "부과"하지 않고 배지로 "표시"만 한다 —
// 실제 차감을 두 곳에서 하면 이중 차감이 되므로 반드시 한쪽(battle-view)만
// 수행해야 함.
//
// battle-encounters.js/battle-adapter.js와 같은 "주입 캐시" 패턴 — setContext
// 한 번으로 세션 정보를 넣어두고, 이후 함수들은 이를 참조.
// ============================================================================
(function () {
  let ctx = { sbClient: null, userId: null };

  function setContext({ sbClient, userId }) {
    ctx = { sbClient, userId };
  }

  // 이 전투의 진행 기록(클리어/도전 시각) — battle-select.html의 목록 캐시와
  // 달리, battle-view.html은 전투 하나만 다루므로 그때그때 단건 조회로 충분함
  // (매 실행마다 최신 상태를 봐야 하므로 오히려 캐시가 없는 편이 안전).
  async function fetchProgress(battleId) {
    const { data, error } = await ctx.sbClient
      .from("battle_progress")
      .select("cleared,cleared_at,attempted_at")
      .eq("user_id", ctx.userId).eq("battle_id", battleId).maybeSingle();
    if (error) throw error;
    return {
      cleared: data?.cleared || false,
      clearedAt: data?.cleared_at || null,
      attemptedAt: data?.attempted_at || null,
    };
  }

  function remainingAttemptCooldownMs(attemptedAt, hours) {
    if (!attemptedAt) return 0;
    return Math.max(0, new Date(attemptedAt).getTime() + hours * 3600 * 1000 - Date.now());
  }

  function formatHours(h) {
    return h >= 1 ? `${h}시간` : `${Math.round(h * 60)}분`;
  }
  function formatDuration(ms) {
    const total = Math.ceil(ms / 60000);
    const h = Math.floor(total / 60), m = total % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  }

  // consumesItem 조건에 걸린 아이템을 전부 갖고 있는지(차감은 안 함) — 확인
  // 대화상자를 띄우기 전 자격 판정용.
  async function hasEntryItems(battle) {
    const needed = (battle.requirements || []).filter((r) => r.type === "consumesItem").map((r) => r.value);
    if (needed.length === 0) return true;
    const { data, error } = await ctx.sbClient.from("warehouse_items")
      .select("name,quantity").eq("user_id", ctx.userId).in("name", needed);
    if (error) throw error;
    return needed.every((name) => (data || []).some((row) => row.name === name && row.quantity > 0));
  }

  // consumesItem 조건에 걸린 아이템을 창고에서 1개씩 실제로 차감함(battle-select.html의
  // consumeEntryItems를 그대로 옮김). 수량이 0이 되면 행 자체를 지움. 차감에
  // 성공했는지를 반환 — 실패하면 입장을 막아야 함.
  async function consumeEntryItems(battle) {
    const needed = (battle.requirements || []).filter((r) => r.type === "consumesItem").map((r) => r.value);
    if (needed.length === 0) return true;

    const { data: rows, error } = await ctx.sbClient.from("warehouse_items")
      .select("id,name,quantity").eq("user_id", ctx.userId).in("name", needed);
    if (error) throw error;
    for (const itemName of needed) {
      const entry = rows.find((it) => it.name === itemName && it.quantity > 0);
      if (!entry) return false; // 창고에 없음 — 입장 불가
    }
    for (const itemName of needed) {
      const entry = rows.find((it) => it.name === itemName);
      if (entry.quantity <= 1) {
        const { error: delError } = await ctx.sbClient.from("warehouse_items").delete().eq("id", entry.id);
        if (delError) throw delError;
      } else {
        const { error: updError } = await ctx.sbClient.from("warehouse_items").update({ quantity: entry.quantity - 1 }).eq("id", entry.id);
        if (updError) throw updError;
      }
    }
    return true;
  }

  // attemptCooldownHours 시계를 "지금"으로 찍음 — 성패와 무관하게 입장한
  // 순간 시작되는 시계(수송대 추적에 실패해도 대가를 치러야 한다는 설계).
  async function markAttempt(battleId) {
    const { error } = await ctx.sbClient.from("battle_progress")
      .upsert({ user_id: ctx.userId, battle_id: battleId, attempted_at: new Date().toISOString() }, { onConflict: "user_id,battle_id" });
    if (error) throw error;
  }

  // 확인 대화상자에 쓸 비용 설명 문자열 배열.
  function describeEntryCost(battle) {
    const lines = [];
    const names = (battle.requirements || []).filter((r) => r.type === "consumesItem").map((r) => r.value);
    if (names.length) lines.push(`${names.map((n) => `"${n}"`).join(", ")} 1개가 소모돼요.`);
    const attemptReq = (battle.requirements || []).find((r) => r.type === "attemptCooldownHours");
    if (attemptReq) lines.push(`성패와 관계없이 ${formatHours(attemptReq.value)} 동안 재도전할 수 없어요.`);
    return lines;
  }

  window.BattleEntry = {
    setContext,
    fetchProgress,
    remainingAttemptCooldownMs,
    formatHours,
    formatDuration,
    hasEntryItems,
    consumeEntryItems,
    markAttempt,
    describeEntryCost,
  };
})();
