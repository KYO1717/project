// 브라우저에서 직접 테스트 시 키를 따옴표 안에 작성하세요.
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";

const gameState = {
  floor: 1,
  node: 0,
  maxNodes: 5,
  hp: 100,
  maxHp: 100,
  relics: []
};

// 페이지 로드 시 노드 클릭 이벤트 바인딩
document.addEventListener("DOMContentLoaded", () => {
  setupNodeEvents();
  updateUI();
});

function setupNodeEvents() {
  const nodes = document.querySelectorAll(".node");
  nodes.forEach(node => {
    node.addEventListener("click", () => {
      const step = parseInt(node.dataset.step);
      // 순서대로만 진입 가능 (현재 노드 + 1 위치만 클릭 허용)
      if (step === gameState.node + 1) {
        enterNode(step, node.dataset.type);
      }
    });
  });
}

function updateUI() {
  document.getElementById("current-floor").innerText = gameState.floor;
  document.getElementById("current-hp").innerText = gameState.hp;
  document.getElementById("relics-list").innerText = 
    gameState.relics.length > 0 ? gameState.relics.join(", ") : "None";

  // 지도 노드 클릭 가능 상태 조절
  const nodes = document.querySelectorAll(".node");
  nodes.forEach(node => {
    const step = parseInt(node.dataset.step);
    node.classList.remove("active", "cleared", "clickable");
    
    if (step < gameState.node) {
      node.classList.add("cleared");
    } else if (step === gameState.node) {
      node.classList.add("active");
    } else if (step === gameState.node + 1) {
      node.classList.add("clickable");
    }
  });
}

function enterNode(step, type) {
  gameState.node = step;
  updateUI();

  // 노드 유형별 로직 분기 (전투 / 사건 / 보상 / 보스)
  if (type === "전투" || type === "보스") {
    handleCombatNode(type);
  } else if (type === "사건") {
    fetchLLMEvent("사건");
  } else if (type === "보상") {
    fetchLLMEvent("보상");
  }
}

// 1) 전투 및 보스 노드 처리 (로직 처리)
function handleCombatNode(type) {
  const isBoss = type === "보스";
  const enemyName = isBoss ? "시공간의 환영 (보스)" : "경계의 왜곡체";
  const damage = isBoss ? 25 : 10;

  document.getElementById("event-badge").innerText = isBoss ? "BOSS COMBAT" : "COMBAT";
  document.getElementById("event-title").innerText = `${enemyName}와의 전투`;
  document.getElementById("event-description").innerText = 
    `적과 조우했습니다! 적을 격퇴하려면 대가를 치러야 합니다. (예상 피해: ${damage} HP)`;

  const container = document.getElementById("choices-container");
  container.innerHTML = `
    <button class="gold-btn" onclick="resolveCombat(${damage}, '${enemyName}')">➤ 교전하기 (HP -${damage})</button>
  `;
}

function resolveCombat(damage, enemyName) {
  gameState.hp = Math.max(0, gameState.hp - damage);
  updateUI();

  if (gameState.hp <= 0) {
    showEndGame("사망", "체력이 모두 소진되었습니다.");
    return;
  }

  document.getElementById("event-title").innerText = "전투 승리";
  document.getElementById("event-description").innerText = `${enemyName}을(를) 격퇴했습니다! 다음 노드로 이동할 수 있습니다.`;
  
  const container = document.getElementById("choices-container");
  container.innerHTML = gameState.node === gameState.maxNodes 
    ? `<button class="gold-btn" onclick="showEndGame('1층 클리어', '1층의 모든 시공간을 정복했습니다!')">➤ 층 완료하기</button>`
    : `<p style="color: var(--text-muted); font-size: 0.85rem;">위 지도에서 다음 노드를 클릭하세요.</p>`;
}

// 2) 사건/보상 노드 처리 (Gemini API 연동)
async function fetchLLMEvent(nodeType) {
  const eventTitle = document.getElementById("event-title");
  const eventDesc = document.getElementById("event-description");
  const eventBadge = document.getElementById("event-badge");
  const container = document.getElementById("choices-container");

  eventBadge.innerText = nodeType === "보상" ? "ARTIFACT" : "EVENT";
  eventTitle.innerText = "관측 중...";
  eventDesc.innerText = "현상을 일으키는 문장을 불러오고 있습니다...";
  container.innerHTML = "";

  const prompt = `
    당신은 리버스 1999 감성의 로그라이크 게임 마스터입니다.
    현재 위치: 1층 ${gameState.node}번째 노드 (${nodeType} 노드).
    
    ${nodeType} 유형에 맞는 미스테리한 텍스트 이벤트와 선택지 2개를 생성하세요.
    반드시 아래 JSON 포맷으로만 응답해야 합니다.

    {
      "title": "이벤트/보상 이름",
      "description": "상황 및 묘사 문장 (2문장)",
      "choices": [
        { "text": "선택지 1", "hpChange": -5, "relic": "${nodeType === '보상' ? '녹슨 태엽시계' : null}", "result": "결과 문장" },
        { "text": "선택지 2", "hpChange": 5, "relic": null, "result": "결과 문장" }
      ]
    }
  `;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    );

    const data = await response.json();
    const eventData = JSON.parse(data.candidates[0].content.parts[0].text);
    
    eventTitle.innerText = eventData.title;
    eventDesc.innerText = eventData.description;

    container.innerHTML = "";
    eventData.choices.forEach(choice => {
      const btn = document.createElement("button");
      btn.className = "gold-btn";
      btn.innerText = `➤ ${choice.text}`;
      btn.onclick = () => handleChoice(choice);
      container.appendChild(btn);
    });

  } catch (err) {
    console.error(err);
    eventTitle.innerText = "현상 관측 실패";
    eventDesc.innerText = "API 키가 올바르지 않거나 오류가 발생했습니다. 직접 키를 설정했는지 확인하세요.";
  }
}

function handleChoice(choice) {
  gameState.hp = Math.min(gameState.maxHp, Math.max(0, gameState.hp + choice.hpChange));
  if (choice.relic && !gameState.relics.includes(choice.relic)) {
    gameState.relics.push(choice.relic);
  }

  updateUI();

  if (gameState.hp <= 0) {
    showEndGame("사망", "폭풍우 속으로 사라졌습니다.");
    return;
  }

  document.getElementById("event-description").innerText = choice.result;
  document.getElementById("choices-container").innerHTML = 
    `<p style="color: var(--text-muted); font-size: 0.85rem;">위 지도에서 다음 노드를 클릭하세요.</p>`;
}

function showEndGame(title, message) {
  document.getElementById("event-badge").innerText = "FINALE";
  document.getElementById("event-title").innerText = title;
  document.getElementById("event-description").innerText = message;
  document.getElementById("choices-container").innerHTML = 
    `<button class="gold-btn" onclick="location.reload()">➤ 처음부터 다시하기</button>`;
}