// .env 대신 클라이언트 테스트 환경용 변수 설정
const GEMINI_API_KEY = process.env.gemini_api || "YOUR_API_KEY_HERE";

// 게임 상태 객체
const gameState = {
  floor: 1,
  node: 0,
  maxFloors: 3,
  nodesPerFloor: 5,
  hp: 100,
  maxHp: 100,
  relics: []
};

// UI 상태 업데이트 함수
function updateUI() {
  document.getElementById("current-floor").innerText = gameState.floor;
  document.getElementById("current-hp").innerText = gameState.hp;
  document.getElementById("current-node").innerText = gameState.node;
  document.getElementById("relics-list").innerText = 
    gameState.relics.length > 0 ? gameState.relics.join(", ") : "None";

  // 지도 노드 UI 업데이트
  const nodes = document.querySelectorAll(".node");
  nodes.forEach((el, idx) => {
    const step = idx + 1;
    el.classList.remove("active", "cleared");
    if (step < gameState.node) {
      el.classList.add("cleared");
    } else if (step === gameState.node) {
      el.classList.add("active");
    }
  });
}

// 다음 노드로 진입
async function enterNextNode() {
  if (gameState.node < gameState.nodesPerFloor) {
    gameState.node++;
  } else {
    // 다음 층으로 이동
    if (gameState.floor < gameState.maxFloors) {
      gameState.floor++;
      gameState.node = 1;
    } else {
      showEndGame("여정 완수", "모든 시공간의 왜곡을 극복하고 시대를 지켜냈습니다.");
      return;
    }
  }

  updateUI();

  // 5번째 노드는 보스(Anomaly), 그 외는 일반 미스테리 이벤트
  if (gameState.node === 5) {
    fetchLLMEvent("보스");
  } else {
    fetchLLMEvent("일반");
  }
}

// Gemini API 호출 (JSON 포맷 응답 요청)
async function fetchLLMEvent(type) {
  const eventTitle = document.getElementById("event-title");
  const eventDesc = document.getElementById("event-description");
  const eventBadge = document.getElementById("event-badge");
  const choicesContainer = document.getElementById("choices-container");

  eventBadge.innerText = type === "보스" ? "ANOMALY PHENOMENON" : "MYSTERIOUS EVENT";
  eventTitle.innerText = "현상을 관측하는 중...";
  eventDesc.innerText = "시공간의 왜곡 속에서 무언가가 다가옵니다...";
  choicesContainer.innerHTML = "";

  const prompt = `
    당신은 리버스 1999 스타일의 미스테리 로그라이크 게임 마스터입니다.
    현재 플레이어 위치: ${gameState.floor}층 ${gameState.node}번째 노드 (${type} 인카운터).
    현재 체력: ${gameState.hp}/${gameState.maxHp}.
    
    신비롭고 고풍스러우며 기묘한 분위기의 텍스트 이벤트와 선택지 2개를 생성하세요.
    반드시 아래 JSON 포맷으로만 응답해야 합니다.

    {
      "title": "이벤트 제목",
      "description": "상황 설명 (2~3문장, 시적이고 미스테리한 톤)",
      "choices": [
        { "text": "선택지 1 내용", "hpChange": -10, "relic": "녹슨 태엽 시계", "result": "선택 후 결과 문장" },
        { "text": "선택지 2 내용", "hpChange": 10, "relic": null, "result": "선택 후 결과 문장" }
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
    renderEvent(eventData);

  } catch (err) {
    console.error(err);
    eventTitle.innerText = "시공간 균열 발생";
    eventDesc.innerText = "알 수 없는 영향으로 현상을 해석할 수 없습니다.";
    choicesContainer.innerHTML = `<button class="gold-btn" onclick="enterNextNode()">➤ 다음으로 강제 이동</button>`;
  }
}

// 이벤트 및 선택지 버튼 렌더링
function renderEvent(data) {
  document.getElementById("event-title").innerText = data.title;
  document.getElementById("event-description").innerText = data.description;

  const choicesContainer = document.getElementById("choices-container");
  choicesContainer.innerHTML = "";

  data.choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.className = "gold-btn";
    btn.innerText = `➤ ${choice.text}`;
    btn.onclick = () => handleChoice(choice);
    choicesContainer.appendChild(btn);
  });
}

// 플레이어 선택 결과 처리
function handleChoice(choice) {
  // HP 변경 및 유물 획득 반영
  gameState.hp = Math.min(gameState.maxHp, Math.max(0, gameState.hp + choice.hpChange));
  if (choice.relic && !gameState.relics.includes(choice.relic)) {
    gameState.relics.push(choice.relic);
  }

  updateUI();

  // 사망 검사
  if (gameState.hp <= 0) {
    showEndGame("여정의 종말", "체력이 모두 소진되어 폭풍우 속으로 사라졌습니다...");
    return;
  }

  // 결과 출력 및 다음 이동 버튼 제공
  document.getElementById("event-description").innerText = choice.result;
  const choicesContainer = document.getElementById("choices-container");
  choicesContainer.innerHTML = `<button class="gold-btn" onclick="enterNextNode()">➤ 다음 노드로 이동</button>`;
}

// 게임 엔딩/사망 화면
function showEndGame(title, message) {
  document.getElementById("event-badge").innerText = "FINALE";
  document.getElementById("event-title").innerText = title;
  document.getElementById("event-description").innerText = message;
  document.getElementById("choices-container").innerHTML = 
    `<button class="gold-btn" onclick="location.reload()">➤ 다시 시작하기</button>`;
}

// 페이지 로드 시 initial UI 초기화
updateUI();