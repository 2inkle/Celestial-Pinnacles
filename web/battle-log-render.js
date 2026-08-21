// ============================================================================
// 전투 서사 로그 파서/렌더러 — battle-view.html(직접 전투)과
// battle-log-view.html(저장된 로그 뷰어/공유 화면) 양쪽이 공용으로 씀.
//
// 2026-08-18에 battle-view.html에서 통째로 추출함 — 예전엔 이 코드가
// battle-view.html/battle-log-view.html 두 파일에 복제돼 있었고(원래
// battle-log-view.html이 원본, battle-view.html이 나중에 그대로 가져다
// 씀), 그 결과 battle-view.html 쪽만 계속 갱신되고 battle-log-view.html은
// 낡은 사본으로 남는 문제가 있었음(CLAUDE.md에 등록됐던 "battle-log-view.html의
// 로그 파서가 낡음" 버그). 공용 파일로 합쳐서 이 종류의 드리프트 자체를
// 없앰 — 다른 콘텐츠 정의 파일들(battle-themes.js/battle-encounters.js)과
// 같은 패턴.
//
// 순수 함수들이라(DOM/네트워크 의존 없음) 입력(logLines, result)만 같으면
// 항상 같은 HTML을 반환함 — 저장된 로그를 나중에 다시 열어도 당시와
// 동일하게 재현된다는 전제(전투 로그 저장/공유 기능의 핵심 요건)가 이
// 순수성에서 나옴.
// ============================================================================
(function () {
  const OUTCOME_LINE_PATTERN = /파티는 승리했다!$|^패배했다\.\.\.$|^비겼다\.$/;

  function parseBattleLog(rawLines) {
    const lines = rawLines
      .map((l) => l.replace(/^\n/, ""))
      .filter((l) => l.trim() && l !== "==================================================");

    let i = 0;
    const intro = [];
    while (i < lines.length && !/^\[ TURN \d+ \]$/.test(lines[i])) {
      intro.push(lines[i]);
      i++;
    }

    const turns = [];
    while (i < lines.length) {
      const turnMatch = lines[i].match(/^\[ TURN (\d+) \]$/);
      if (!turnMatch) break;
      const turnNumber = Number(turnMatch[1]);
      i++;

      const snapshot = { ally: [], enemy: [] };
      let side = null;
      while (i < lines.length) {
        if (lines[i] === "[ 아군 ]") { side = "ally"; i++; continue; }
        if (lines[i] === "[ 적군 ]") { side = "enemy"; i++; continue; }
        const unitMatch = lines[i].match(/^\s*(.+?)\s+HP (\d+)\/(\d+)\s+SP (\d+)\/(\d+)\s*$/);
        if (unitMatch && side) {
          snapshot[side].push({ name: unitMatch[1], hp: +unitMatch[2], maxHp: +unitMatch[3], sp: +unitMatch[4], maxSp: +unitMatch[5], alive: true });
          i++; continue;
        }
        const downMatch = lines[i].match(/^\s*(.+?)\s+💀 전투불능\s*$/);
        if (downMatch && side) {
          snapshot[side].push({ name: downMatch[1], alive: false });
          i++; continue;
        }
        // Boss(creatureTier:"boss")는 src/engine.js의 renderStatusBoard()가
        // "{이름}   ???"만 찍음(HP/SP 수치 자체를 안 냄) — 위 unitMatch
        // 정규식엔 안 걸리므로 여기서 별도로 잡아서 hidden 유닛으로 표시함
        // (2026-08-21). hp/maxHp가 없으니 renderUnitRow가 게이지를 못
        // 그리고, 그게 바로 목적 — "정확한 기준 수치를 숨긴다".
        const hiddenMatch = lines[i].match(/^\s*(.+?)\s+\?\?\?\s*$/);
        if (hiddenMatch && side) {
          snapshot[side].push({ name: hiddenMatch[1], alive: true, hidden: true });
          i++; continue;
        }
        break;
      }

      const narrative = [];
      while (i < lines.length && !/^\[ TURN \d+ \]$/.test(lines[i]) && !OUTCOME_LINE_PATTERN.test(lines[i])) {
        narrative.push(lines[i]);
        i++;
      }
      turns.push({ turnNumber, snapshot, narrative });
    }

    return { intro, turns };
  }

  function renderUnitRow(u) {
    if (!u.alive) {
      return `<div class="unit-row down"><span class="unit-name">${u.name}</span><span class="down-tag">💀 전투불능</span></div>`;
    }
    if (u.hidden) {
      // Boss — HP/SP 수치 자체가 로그에 없으니 게이지를 그릴 수가 없음(의도됨).
      return `<div class="unit-row"><span class="unit-name">${u.name}</span><span class="hidden-tag">❓ 비공개</span></div>`;
    }
    const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
    const spPct = u.maxSp > 0 ? Math.max(0, Math.min(100, (u.sp / u.maxSp) * 100)) : 0;
    return `
      <div class="unit-row">
        <span class="unit-name">${u.name}</span>
        <div class="unit-bars">
          <div class="bar-line"><span class="bar-tag">HP</span><div class="bar-wrap"><div class="bar-fill hp" style="width:${hpPct}%"></div></div><span class="bar-figure">${u.hp}/${u.maxHp}</span></div>
          <div class="bar-line"><span class="bar-tag">SP</span><div class="bar-wrap"><div class="bar-fill sp" style="width:${spPct}%"></div></div><span class="bar-figure">${u.sp}/${u.maxSp}</span></div>
        </div>
      </div>
    `;
  }

  function classifyLine(line) {
    if (line.includes("[스킬]")) return "skill";
    // "{증감량} {유형} ▷ {대상} (...)" — src/skillResolution.js·registries.js의
    // statChangeLine()이 만드는 모양. 예전엔 "...에게 N의 데미지" 정규식으로
    // 데미지만 잡았는데, " ▷ " 하나로 통일해서 앞으로 SP피해 외에 다른
    // 증감 유형이 추가돼도 자동으로 같이 강조됨.
    if (line.includes(" ▷ ")) return "damage";
    return "";
  }

  function extractActorLine(line) {
    const m = line.match(/^"(.+?)"\s*\((?:ALLY|ENEMY)\)\s*행동!$/);
    return m ? m[1] : null;
  }

  // "{이름}, {스킬명}" — src/engine.js의 resolvePreparedSkill이 스킬 발동
  // 시점에 내는 줄. 선딜레이가 있는 스킬의 발동은 게이지 루프가 아니라
  // readyAtTick 도래 시점에 따로 처리되는 경로라 "(ALLY/ENEMY) 행동!" 마커가
  // 안 붙는다 — 그래서 이 줄 자체를 새 블록의 시작으로도 인식해야 한다.
  // 안 그러면 직전에 "행동!"을 낸 다른 유닛의 블록 밑에 잘못 묶여버린다
  // (실제로 그렇게 묶이고 있었음 — 파티원 3명이 같은 턴에 스킬을 발동하면
  // 셋 다 마지막으로 "행동!"을 낸 한 명 블록 아래 뒤섞였음).
  function extractSkillActivation(line) {
    const m = line.match(/^([^,]+), (.+)$/);
    return m ? { name: m[1], skill: m[2] } : null;
  }

  function splitNarrativeIntoBlocks(narrative, snapshot) {
    const allyNames = new Set((snapshot?.ally || []).map((u) => u.name));
    const enemyNames = new Set((snapshot?.enemy || []).map((u) => u.name));
    const sideOf = (name) => allyNames.has(name) ? "ally" : enemyNames.has(name) ? "enemy" : null;

    const blocks = [];
    let current = null;
    // "행동!" 마커는 즉발 액션(몬스터 기본 공격 등)에서만 나오고, 바로 다음
    // 줄에 같은 유닛의 "{이름}, {행동명}" 줄이 따라온다(registries.js가 그
    // 형태로 로그하도록 맞춰둠 — src/registries.js의 ATTACK 참조). 이 둘을
    // 하나로 합쳐야 캐릭터 스킬(resolvePreparedSkill, 애초에 "행동!" 마커가
    // 안 붙는 경로)과 똑같은 한 줄짜리 헤더가 된다. 아직 이 컨벤션으로 안
    // 옮긴 다른 액션(포션/마법진 등)은 다음 줄이 안 맞으니 예전처럼 "행동!"
    // 단독으로 plain 헤더 블록이 됨 — 회귀 없음.
    let pendingLine = null;
    let pendingName = null;
    function flushPending() {
      if (!pendingLine) return;
      current = { side: sideOf(pendingName) || "ally", lines: [pendingLine] };
      blocks.push(current);
      pendingLine = null;
      pendingName = null;
    }

    narrative.forEach((line) => {
      const marker = extractActorLine(line);
      if (marker) {
        flushPending(); // 직전 "행동!"이 짝을 못 찾았으면 그대로 확정하고 새로 대기
        pendingLine = line;
        pendingName = marker;
        return;
      }

      const activation = extractSkillActivation(line);
      if (activation && activation.name === pendingName) {
        // "행동!" 바로 다음이 같은 유닛의 발동줄 — 합쳐서 한 줄짜리 헤더로
        current = { side: sideOf(activation.name) || "ally", lines: [line], skillHeader: true };
        blocks.push(current);
        pendingLine = null;
        pendingName = null;
        return;
      }
      flushPending();

      if (activation) {
        // "행동!" 없이 곧장 나온 발동줄(선딜레이 스킬의 발동 시점)
        // 스냅샷 이름 목록으로 아군/적군을 가림 — 못 찾으면(예: 이미 죽어서
        // 이번 턴 스냅샷에 없는 경우) 직전 블록의 진영을 이어받음.
        const side = sideOf(activation.name) || (current ? current.side : "ally");
        current = { side, lines: [line], skillHeader: true };
        blocks.push(current);
        return;
      }
      if (current) current.lines.push(line);
    });
    flushPending();

    return blocks;
  }

  function renderBlock(block) {
    const bodyLines = block.lines.map((line, idx) => {
      if (idx === 0) {
        if (block.skillHeader) {
          // 볼드+밑줄은 스킬명에만 건다 — "{이름}, " 부분은 일반 텍스트.
          const activation = extractSkillActivation(line);
          return `<div class="log-line skill-activate">${activation.name}, <span class="skill-name-strong">${activation.skill}</span></div>`;
        }
        const name = extractActorLine(line) || line;
        return `<div class="log-line actor">${name}</div>`;
      }
      const cls = classifyLine(line);
      return `<div class="log-line ${cls}">${line}</div>`;
    }).join("");
    return `<div class="action-block ${block.side}">${bodyLines}</div>`;
  }

  const OUTCOME_META = {
    allyWin: { cls: "win", eyebrow: "VICTORY", title: (u) => `${u}의 파티는 승리했다!` },
    enemyWin: { cls: "lose", eyebrow: "DEFEAT", title: () => `패배했다...` },
    draw: { cls: "draw", eyebrow: "STALEMATE", title: () => `비겼다.` },
  };

  function renderResultSideBox(label, side, counts, participants, damageDealt) {
    const totalCurrentHp = participants.reduce((sum, p) => sum + p.currentHp, 0);
    const totalMaxHp = participants.reduce((sum, p) => sum + p.maxHp, 0);
    return `
      <div class="result-side-box ${side}">
        <div class="result-side-label">${label}</div>
        <div class="result-survivors">${counts.alive} <span class="of">/ ${counts.total}</span></div>
        <div class="result-sub">생존</div>
        <div class="result-hp-block"><div class="result-hp-figure"><b>${totalCurrentHp}</b> / ${totalMaxHp} HP</div></div>
        <div class="result-dmg-block"><div class="result-dmg-figure">상대에게 입힌 피해 <b>${damageDealt}</b></div></div>
      </div>
    `;
  }

  function renderResult(result) {
    const meta = OUTCOME_META[result.outcome] || OUTCOME_META.draw;
    return `
      <div class="outcome-banner">
        <div class="outcome-eyebrow">${meta.eyebrow}</div>
        <div class="outcome-title ${meta.cls}">${meta.title(result.username || "플레이어")}</div>
        <div class="outcome-turns">진행 턴수 <b>${result.turnsElapsed}</b></div>
      </div>
      <div class="result-sides">
        ${renderResultSideBox("🛡️ 아군", "ally", result.survivorCounts.ally, result.participants.ally, result.damageDealt.ally)}
        ${renderResultSideBox("💀 적군", "enemy", result.survivorCounts.enemy, result.participants.enemy, result.damageDealt.enemy)}
      </div>
      <div class="loot-panel">
        <div class="loot-row"><span class="loot-label">✨ 경험치</span><span class="loot-value exp">+${result.expGained}</span></div>
        <div class="loot-row"><span class="loot-label">💰 골드</span><span class="loot-value">+${result.goldGained}</span></div>
        ${result.lootGained.length ? result.lootGained.map((it) => `
          <div class="loot-row"><span class="loot-label">${it.name}</span><span class="loot-value">×${it.quantity}</span></div>
        `).join("") : `<div class="loot-empty">획득한 아이템 없음</div>`}
      </div>
    `;
  }

  function renderBattleLog(logLines, result) {
    const parsed = parseBattleLog(logLines);
    let html = `<div class="intro-banner" style="text-align:center;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--mist-dim);padding:10px 0;">${parsed.intro.join("<br/>")}</div>`;

    parsed.turns.forEach((t) => {
      const blocks = splitNarrativeIntoBlocks(t.narrative, t.snapshot);
      html += `
        <div class="turn-block">
          <div class="turn-label">TURN ${t.turnNumber}</div>
          <table class="status-table">
            <thead><tr><th class="ally-col">🛡️ 아군</th><th class="enemy-col">💀 적군</th></tr></thead>
            <tbody>
              <tr>
                <td class="ally-col">${t.snapshot.ally.map(renderUnitRow).join("")}</td>
                <td class="enemy-col">${t.snapshot.enemy.map(renderUnitRow).join("")}</td>
              </tr>
            </tbody>
          </table>
          <div class="turn-narrative">${blocks.map(renderBlock).join("")}</div>
        </div>
      `;
    });

    html += `<div class="outro">${renderResult(result)}</div>`;
    return html;
  }

  window.BattleLogRender = {
    OUTCOME_LINE_PATTERN,
    parseBattleLog,
    renderUnitRow,
    classifyLine,
    extractActorLine,
    extractSkillActivation,
    splitNarrativeIntoBlocks,
    renderBlock,
    renderResultSideBox,
    renderResult,
    renderBattleLog,
  };
})();
