// ============================================================================
// 임무(퀘스트) 진행 판정/완료 로직 — web/guild.html(목록)과
// web/quest-detail.html(상세) 양쪽이 공용으로 씀.
//
// 2026-08-21에 guild.html의 임무 게시판 IIFE에서 통째로 추출함 — 원래
// guild.html 하나에만 있던 로직인데, 상세 페이지를 신설하면서 두 파일이
// 각자 사본을 갖게 두면 battle-log-view.html의 로그 파서가 예전에 그랬던
// 것처럼(CLAUDE.md 참고) 한쪽만 계속 갱신되고 다른 쪽이 낡은 사본으로
// 남는 문제가 재발할 게 뻔해서, battle-themes.js/item-sets.js/
// battle-entry.js와 같은 패턴으로 공용 파일로 뺌.
//
// session을 클로저로 감추지 않고 매 함수에 명시적 인자로 받음 — 두 페이지가
// 각자 독립적으로 AuthGuard.requireSession()을 호출해서 얻은 세션으로
// 부르므로, 모듈 스코프에 세션을 고정해둘 이유가 없음.
// ============================================================================
(function () {
  const QUEST_TABLE = window.QuestTable.QUEST_TABLE;

  // questIds를 생략하면 QUEST_TABLE 전체 기준(길드 목록용 — 모든 임무의
  // 상태를 한 번에 알아야 함). 배열로 주면 그 임무들만 걸러서 세 쿼리를
  // 좁힘(quest-detail.html이 이 방식으로 호출 — 퀘스트 하나만 볼 때 다른
  // 임무의 진행 데이터까지 긁어올 이유가 없음).
  async function loadState(session, questIds) {
    const quests = questIds
      ? QUEST_TABLE.filter((q) => questIds.includes(q.id))
      : QUEST_TABLE;
    const battleIds = [...new Set(quests.filter((q) => q.type === "battleClear").map((q) => q.target.battleId))];
    const itemNames = [...new Set(quests.filter((q) => q.type === "itemTurnIn").map((q) => q.target.itemName))];

    let progressQuery = window.sbClient.from("quest_progress")
      .select("quest_id,completed_count,last_completed_at").eq("user_id", session.user.id);
    if (questIds) progressQuery = progressQuery.in("quest_id", quests.map((q) => q.id));

    const [{ data: progressRows }, { data: battleRows }, { data: itemRows }] = await Promise.all([
      progressQuery,
      battleIds.length
        ? window.sbClient.from("battle_progress").select("battle_id,cleared,cleared_at").eq("user_id", session.user.id).in("battle_id", battleIds)
        : Promise.resolve({ data: [] }),
      itemNames.length
        ? window.sbClient.from("warehouse_items").select("id,name,quantity").eq("user_id", session.user.id).in("name", itemNames)
        : Promise.resolve({ data: [] }),
    ]);
    const progressById = {};
    (progressRows || []).forEach((r) => { progressById[r.quest_id] = r; });
    const battleById = {};
    (battleRows || []).forEach((r) => { battleById[r.battle_id] = r; });
    const itemQtyByName = {};
    (itemRows || []).forEach((r) => { itemQtyByName[r.name] = (itemQtyByName[r.name] || 0) + r.quantity; });
    return { progressById, battleById, itemQtyByName };
  }

  // status: "ready"(완료 가능) / "locked"(조건 미충족) / "waiting"(반복형,
  // 마지막 완료 이후 조건을 다시 채운 적 없음) / "done"(일회성, 이미 완료함)
  function evaluateQuest(quest, state) {
    const progress = state.progressById[quest.id];
    const done = !!(progress && progress.completed_count > 0);
    if (!quest.repeatable && done) return { status: "done" };

    if (quest.type === "battleClear") {
      const battle = state.battleById[quest.target.battleId];
      if (!battle || !battle.cleared) return { status: "locked" };
      if (progress && progress.last_completed_at && battle.cleared_at &&
          new Date(battle.cleared_at) <= new Date(progress.last_completed_at)) {
        return { status: "waiting" };
      }
      return { status: "ready" };
    }

    if (quest.type === "itemTurnIn") {
      const owned = state.itemQtyByName[quest.target.itemName] || 0;
      if (owned < quest.target.quantity) return { status: "locked", owned };
      return { status: "ready", owned };
    }

    return { status: "locked" };
  }

  const STATUS_LABEL = { ready: "완료 가능", locked: "진행 중", waiting: "재도전 필요", done: "완료됨" };

  function rewardText(rewards) {
    return rewards.map((r) => r.type === "gold" ? `골드 ${r.amount}` : `${r.name} ${r.quantity || 1}개`).join(" · ");
  }

  function conditionText(quest, evalResult) {
    if (quest.type === "battleClear") {
      const battleName = window.BattleThemes.battleNameById(quest.target.battleId);
      return `"${battleName}" 클리어`;
    }
    if (quest.type === "itemTurnIn") {
      const owned = evalResult.owned || 0;
      return `${quest.target.itemName} ${owned}/${quest.target.quantity}개 납품`;
    }
    return "";
  }

  // 아이템 납품 임무 완료 시 필요한 만큼 소모(여러 행에 나뉘어 있을 수 있으므로
  // 순회하며 차감 — workshop.html의 consumeMaterial과 같은 패턴). amount는
  // 이미 배수(multiplier)가 반영된 "실제로 소모할 총량"을 받음 — 이 함수
  // 자체는 배수 개념을 모름(호출부인 completeQuest가 스케일링 책임을 짐).
  async function consumeItem(session, itemName, amount) {
    let remaining = amount;
    const { data: rows } = await window.sbClient.from("warehouse_items")
      .select("id,quantity").eq("user_id", session.user.id).eq("name", itemName).order("quantity", { ascending: true });
    for (const row of rows || []) {
      if (remaining <= 0) break;
      const take = Math.min(row.quantity, remaining);
      remaining -= take;
      if (take >= row.quantity) {
        await window.sbClient.from("warehouse_items").delete().eq("id", row.id);
      } else {
        await window.sbClient.from("warehouse_items").update({ quantity: row.quantity - take }).eq("id", row.id);
      }
    }
    return remaining <= 0;
  }

  async function grantRewards(session, rewards) {
    for (const reward of rewards) {
      if (reward.type === "gold") {
        const { data: profile } = await window.sbClient.from("profiles").select("gold").eq("user_id", session.user.id).single();
        await window.sbClient.from("profiles").update({ gold: (profile.gold || 0) + reward.amount }).eq("user_id", session.user.id);
      } else if (reward.type === "item") {
        const { name, category, quantity, ...spec } = reward;
        const { data: existing } = category !== "equipment"
          ? await window.sbClient.from("warehouse_items").select("id,quantity").eq("user_id", session.user.id).eq("name", name).is("held_by", null).maybeSingle()
          : { data: null };
        if (existing) {
          await window.sbClient.from("warehouse_items").update({ quantity: existing.quantity + (quantity || 1) }).eq("id", existing.id);
        } else {
          await window.sbClient.from("warehouse_items").insert({ user_id: session.user.id, name, category, quantity: quantity || 1, ...spec });
        }
      }
    }
  }

  // multiplier — itemTurnIn+repeatable 임무를 한 번에 여러 번 납품하는 배치
  // 완료용(2026-08-21 신설, 기본값 1은 기존 단일 완료와 완전히 동일). 소모량
  // (target.quantity)과 보상(rewards)을 전부 multiplier배로 스케일하고,
  // quest_progress.completed_count도 1이 아니라 multiplier만큼 늘림.
  // battleClear는 애초에 "한 번 클리어 = 한 번 완료"라 배치 개념이 없으므로
  // 항상 multiplier=1로만 불려야 함(호출부 책임 — 여기선 강제하지 않음).
  async function completeQuest(session, quest, state, multiplier = 1) {
    if (quest.type === "itemTurnIn") {
      const ok = await consumeItem(session, quest.target.itemName, quest.target.quantity * multiplier);
      if (!ok) { alert("아이템이 부족합니다."); return false; }
    }

    const scaledRewards = quest.rewards.map((r) =>
      r.type === "gold" ? { ...r, amount: r.amount * multiplier } : { ...r, quantity: (r.quantity || 1) * multiplier }
    );
    await grantRewards(session, scaledRewards);

    const progress = state.progressById[quest.id];
    if (progress) {
      await window.sbClient.from("quest_progress")
        .update({ completed_count: progress.completed_count + multiplier, last_completed_at: new Date().toISOString() })
        .eq("user_id", session.user.id).eq("quest_id", quest.id);
    } else {
      await window.sbClient.from("quest_progress")
        .insert({ user_id: session.user.id, quest_id: quest.id, completed_count: multiplier, last_completed_at: new Date().toISOString() });
    }
    return true;
  }

  window.QuestLogic = { loadState, evaluateQuest, STATUS_LABEL, rewardText, conditionText, consumeItem, grantRewards, completeQuest };
})();
