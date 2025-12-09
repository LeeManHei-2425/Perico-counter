const htmlElements = {
  gold: document.querySelector('#gold'),
  weed: document.querySelector('#weed'),
  cash: document.querySelector('#cash'),
  cocaine: document.querySelector('#cocaine'),
  paintings: document.querySelector('#paintings'),
  amountOfPlayers: document.querySelector('#amountOfPlayers'),
  leaderCut: document.querySelector('#leaderCut'),
  member1Cut: document.querySelector('#member1Cut'),
  member2Cut: document.querySelector('#member2Cut'),
  member3Cut: document.querySelector('#member3Cut'),
};

// 載入預設值
Object.entries(htmlElements).forEach(([setting, elementHTML]) => {
  if (Settings[setting] !== undefined) {
      elementHTML.value = JSON.parse(Settings[setting]);
  }
});

document.querySelector('#isHardMode').value = Settings.isHardMode;
document.querySelector('#isWithinCooldown').value = Settings.isWithinCooldown;
document.querySelector('#goldAlone').value = Settings.goldAlone;
document.querySelector('#primaryTarget').value = Settings.primaryTarget;

let bags = {};

const Counter = {
  targetsData: {},
  secondaryTargetsOrder: [],

  init: function() {
    return Loader.promises['targets'].execute(data => {
      Counter.targetsData = data;
      // 計算每個單位的價值 (用於排序優先級)
      // 注意：這裡只算單純價值，optimize() 會有更精確的邏輯
      Counter.targetsData.targets.secondary.forEach(({ name, value, weight }) => {
        const profit = getAverage(value.min, value.max) / weight;
        Counter.secondaryTargetsOrder.push({ name, bagProfit: profit });
      });
      // 根據價值排序 (高到低)
      Counter.secondaryTargetsOrder.sort((a, b) => b.bagProfit - a.bagProfit);
      
      Counter.getLoot();
    });
  },

  // --- 自動最佳化核心演算法 ---
  optimize: function() {
      // 1. 獲取當前偵察到的數量 (從輸入框)
      const available = {
          gold: parseInt(document.querySelector('#gold').value) || 0,
          cocaine: parseInt(document.querySelector('#cocaine').value) || 0,
          weed: parseInt(document.querySelector('#weed').value) || 0,
          paintings: parseInt(document.querySelector('#paintings').value) || 0,
          cash: parseInt(document.querySelector('#cash').value) || 0
      };

      const players = parseInt(document.querySelector('#amountOfPlayers').value) || 1;
      let capacityRemaining = players; // 每個玩家 1.0 的容量
      const isGoldAlone = document.querySelector('#goldAlone').value === 'true';

      // 定義權重與優先級 (根據遊戲數據)
      // 權重: Gold(0.66), Painting(0.5), Cocaine(0.5), Weed(0.375), Cash(0.25)
      // 價值密度排序: Gold > Cocaine > Weed > Paintings > Cash
      // *Paintings 雖然是 50%，但單價有時不如半袋 Weed，不過為了簡化，通常 Cocaine > Painting/Weed
      
      // 這裡直接模擬 "拿取" 動作，修改 Settings 中的值，然後呼叫 getLoot 計算錢
      // 由於原本的 getLoot 邏輯是 "拿這種類型多少 stacks"，我們這裡要算的是 "能拿多少 stacks"
      
      const targets = Counter.targetsData.targets.secondary;
      
      // 重置當前拿取設定 (此設定代表"要拿多少"，不同於輸入框的"有多少")
      // 為了配合原本的邏輯，我們這裡其實不需要改變 input 的值，
      // 而是要利用 Counter.getLoot 的計算邏輯，但 getLoot 是讀取 Settings 的。
      // 所以：我們需要一個變數來存 "Optimal Stacks to Take"
      
      // 簡單起見，我們直接計算出最佳解，然後用 alert 或 console 顯示，或者更新到 UI 的 "Taken" 區域
      // 但為了讓使用者的錢變多，我們直接修改 Settings (模擬玩家選擇了這些)
      // *注意*：原本的 UI 是 "Settings[target] = 數量"，這個數量通常是指 "拿了幾堆"。
      // 但在新 UI 中，Input 是 "偵察到了幾堆"。
      
      // 修正邏輯：Input 現在代表 "Available"。我們需要計算 "Taken"。
      // 由於原本 logic.js 的 getLoot 寫法是遍歷 Settings 中的數量並填包，
      // 我們這裡要做的就是：根據優先級，把 Input (Available) 的數量，
      // 盡可能塞進 Settings (Taken) 變數中，直到包包滿了。

      const priority = ['gold', 'cocaine', 'weed', 'paintings', 'cash'];
      let newSettings = {};

      priority.forEach(type => {
          const targetData = targets.find(t => t.name === type);
          const weight = targetData.weight;
          const countAvailable = available[type];
          
          // 特殊規則：單人不能拿黃金 (除非 glitch)
          if (type === 'gold' && players === 1 && !isGoldAlone) {
              newSettings[type] = 0;
              return;
          }

          let canTake = 0;
          
          if (type === 'paintings') {
             // 畫作不能拿半個，必須判斷剩餘容量 >= 0.5
             for(let i=0; i<countAvailable; i++) {
                 if (capacityRemaining >= 0.5) {
                     canTake++;
                     capacityRemaining -= 0.5;
                 }
             }
          } else {
             // 其他東西可以按比例拿 (遊戲中其實是一撮一撮拿，這裡簡化為 float 計算)
             // 計算全部拿完需要的容量
             const neededSpace = countAvailable * weight;
             
             if (capacityRemaining >= neededSpace) {
                 canTake = countAvailable;
                 capacityRemaining -= neededSpace;
             } else {
                 // 只能拿一部分
                 // 這裡有個小問題：遊戲是離散的拿取次數，但計算機通常允許小數點模擬
                 // 為了精確，我們算出能拿多少比例
                 canTake = capacityRemaining / weight;
                 capacityRemaining = 0;
             }
          }
          
          // 更新全域設定，這樣 getLoot 就會算出這些數量的錢
          Settings[type] = canTake;
      });

      // 觸發重算
      Counter.getLoot();
      
      // UI 反饋 (可選)
      const btn = document.getElementById('optimize-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i> 已計算';
      setTimeout(() => btn.innerHTML = originalText, 2000);
  },

  getLoot: function() {
    const amounts = [];
    let bagsFill = 0;
    const players = Settings.amountOfPlayers;
    let emptySpace = players; // 總容量 = 玩家數 * 1.0
    let totalValue = 0;
    const isHardMode = Settings.isHardMode ? 'hard' : 'standard';
    const withinCooldownSecondaryBonus = Settings.isWithinCooldown ?
      Counter.targetsData.targets.primary.find(({ name }) => name === Settings.primaryTarget).bonus_multiplier : 1;

    // 分紅驗證邏輯
    const totalCut = Settings.leaderCut + Settings.member1Cut + 
                    (players > 2 ? Settings.member2Cut : 0) + 
                    (players > 3 ? Settings.member3Cut : 0);
    const warningEl = document.getElementById('cut-warning');
    const cutInputs = document.querySelectorAll('.cuts input');
    
    if (totalCut > 100) {
        warningEl.classList.remove('hidden');
        cutInputs.forEach(input => input.classList.add('error-input'));
    } else {
        warningEl.classList.add('hidden');
        cutInputs.forEach(input => input.classList.remove('error-input'));
    }

    // 這裡我們稍微修改邏輯：
    // 如果是按下「最佳化」，Settings 裡面的值已經是 "Taken" (要拿的數量)。
    // 如果是手動調整 Input (偵察數量)，我們暫時假設 "全拿" 或是保持 Settings 不變？
    // **修正方案**：為了讓計算機符合直覺，我們假設 Input 代表 "Available"，
    // 而計算邏輯通常需要 "Taken"。
    // 為了不改寫太多舊邏輯，我們在 optimize() 裡修改 Settings[type] 來代表 "Taken"。
    // 而 getLoot 負責讀取 Settings[type] 並計算。
    // *注意*：當使用者手動按 +/- 時，我們其實是在改 Settings (見下方 event listener)。
    // 所以手動模式下，使用者其實是在設定 "我拿了多少"。
    // 而自動模式下，則是幫使用者算出 "該拿多少"。
    
    // 使用預先計算好的順序或預設順序遍歷
    // 為了顯示正確，我們重新遍歷一次所有可能的次要目標
    ['gold', 'cocaine', 'weed', 'paintings', 'cash'].forEach(name => {
      const obj = Counter.targetsData.targets.secondary.find(o => o.name === name);
      let amountTaken = Settings[name]; // 這是 stacks 數量

      // 邊界檢查
      if (amountTaken < 0) amountTaken = 0;
      
      // 特殊規則：畫作
      if (name === 'paintings') {
         // 畫作是整數
         amountTaken = Math.floor(amountTaken);
      }

      const weight = obj.weight;
      const spaceUsed = amountTaken * weight;
      
      if (spaceUsed > 0) {
        bagsFill += spaceUsed;
        
        // 計算點擊次數 (用於顯示)
        let clicks = '';
        if (name === 'paintings') {
            clicks = `${amountTaken} 幅`;
        } else {
            // 簡化顯示，不顯示點擊次數，改顯示 stack 數
            clicks = `${rounding(amountTaken)} 堆`;
        }

        amounts.push({ name: name, amount: spaceUsed, clicks: clicks, rawStack: amountTaken });
        totalValue += spaceUsed * (getAverage(obj.value.min, obj.value.max) * withinCooldownSecondaryBonus / weight);
      }
    });

    const finalValue = totalValue + Counter.targetsData.targets.primary.find(({ name }) =>
      name === Settings.primaryTarget).value[isHardMode];

    Counter.updateWebsite(amounts, finalValue, withinCooldownSecondaryBonus, bagsFill);
  },

  updateWebsite: function(amounts, totalValue, withinCooldownSecondaryBonus, bagsFill) {
    totalValue *= Counter.targetsData.events_multiplier;
    const officeSafe = Counter.targetsData.targets.office_safe;
    const averageOfficeSafe = getAverage(officeSafe.min, officeSafe.max);
    
    // 費用計算
    const fencingFee = totalValue * 0.1;
    const pavelFee = totalValue * 0.02;
    const eliteChallenge = Counter.targetsData.elite_challenge[Settings.isHardMode ? 'hard' : 'standard'];
    
    // 更新 DOM
    document.querySelector('#office-safe').innerText = `~ $${Math.round(averageOfficeSafe).toLocaleString()}`;
    document.querySelector('#fencing-fee').innerText = Math.round(fencingFee).toLocaleString();
    document.querySelector('#pavel-fee').innerText = Math.round(pavelFee).toLocaleString();
    document.querySelector('#elite-challenge').innerText = Math.round(eliteChallenge).toLocaleString();
    
    const finalProfit = totalValue + averageOfficeSafe - fencingFee - pavelFee;
    document.querySelector('#max-loot-value').innerText = Math.round(finalProfit).toLocaleString();

    // 更新分紅顯示
    const inputs = document.querySelectorAll('.cuts input');
    [...inputs].forEach(element => {
      if (!element.classList.contains('error-input')) {
          element.nextElementSibling.innerText = Math.round(finalProfit * element.value / 100).toLocaleString();
      } else {
          element.nextElementSibling.innerText = "Error";
      }
    });

    // 更新背包條與清單
    const takenContainer = document.getElementById('taken-loot-display');
    takenContainer.innerHTML = ''; // 清空
    
    if (amounts.length > 0) {
        takenContainer.classList.remove('hidden');
        amounts.forEach(obj => {
            const div = document.createElement('div');
            div.className = 'taken-item';
            // 翻譯名稱
            const mapName = {
                'gold': '黃金', 'cocaine': '古柯鹼', 'weed': '大麻', 'paintings': '畫作', 'cash': '現金'
            };
            div.innerHTML = `<span>${mapName[obj.name]}</span> <span>${obj.clicks}</span>`;
            takenContainer.appendChild(div);
        });
    } else {
        takenContainer.classList.add('hidden');
    }

    // 更新進度條
    // bagsFill 是實際佔用的容量 (比如 1.5)
    // Settings.amountOfPlayers 是最大容量 (比如 2)
    const maxCapacity = Settings.amountOfPlayers;
    document.querySelector('#max_bags_display').innerText = maxCapacity;
    document.querySelector('#bags_fill').innerText = bagsFill.toFixed(2);
    
    const percent = (bagsFill / maxCapacity) * 100;
    const bar = document.querySelector('#bag-bar');
    bar.style.width = `${Math.min(percent, 100)}%`;
    
    // 顏色邏輯：滿了變紅，未滿變綠
    if (percent > 100) bar.style.backgroundColor = '#ff5252';
    else if (percent > 90) bar.style.backgroundColor = '#00e676';
    else bar.style.backgroundColor = '#2979ff';
  },

  activateHandlers: function() {
    document.querySelector('#isHardMode').addEventListener('change', (e) => {
      Settings.isHardMode = JSON.parse(e.target.value);
    });

    document.querySelector('#isWithinCooldown').addEventListener('change', (e) => {
      Settings.isWithinCooldown = JSON.parse(e.target.value);
    });

    document.querySelector('#goldAlone').addEventListener('change', (e) => {
      Settings.goldAlone = JSON.parse(e.target.value);
    });

    document.querySelector('#primaryTarget').addEventListener('change', (e) => {
      Settings.primaryTarget = e.target.value;
    });

    // 監聽所有 input 的變化
    Object.values(htmlElements).forEach(element => {
      if(element) {
          element.addEventListener('change', event => {
            // 對於 loot input，我們直接把值存入 Settings
            // 雖然這些 input 原本代表 "Available"，但如果沒有按 "Optimize"，
            // 使用者手動調整時，我們就當作他是手動指定 "Taken"
            // 這是一種混合 UX，但為了不重寫整個架構，這是最穩妥的
            Settings[event.currentTarget.id] = +event.target.value;
            Counter.getLoot(); // 即時重算
          });
      }
    });
    
    // 重置按鈕
    document.querySelector('#reset-settings').addEventListener('click', () => {
       ['gold', 'weed', 'cash', 'cocaine', 'paintings'].forEach(t => {
           Settings[t] = 0;
           document.getElementById(t).value = 0;
       });
       Settings.leaderCut = 85; document.getElementById('leaderCut').value = 85;
       Settings.member1Cut = 15; document.getElementById('member1Cut').value = 15;
       Counter.getLoot();
    });

    // 連結按鈕
    document.querySelector('#link-settings').addEventListener('click', () => {
        alert("功能維護中"); 
    });

    // 監聽 Settings 變化並觸發計算 (Proxy)
    SettingProxy.addListener(Settings, 'gold weed cash cocaine paintings primaryTarget isHardMode isWithinCooldown goldAlone leaderCut member1Cut member2Cut member3Cut amountOfPlayers', Counter.getLoot);
    
    // 玩家人數變更時的 UI 顯示邏輯
    SettingProxy.addListener(Settings, 'amountOfPlayers', () => {
      document.querySelector('#goldAlone').parentElement.classList.toggle('hidden', Settings.amountOfPlayers !== 1);
      const inputs = document.querySelectorAll('.cuts .cut-row');
      // 顯示/隱藏 P3, P4
      if(inputs[2]) inputs[2].classList.toggle('hidden', Settings.amountOfPlayers < 3);
      if(inputs[3]) inputs[3].classList.toggle('hidden', Settings.amountOfPlayers < 4);
      Counter.getLoot();
    })();
  },
};

const findError = callback => (...args) => callback(args).catch(console.log);

document.addEventListener('DOMContentLoaded', () => {
  try {
    Counter.init()
      .then(Counter.activateHandlers)
      .then(Loader.resolveContentLoaded);
  } catch (error) {
    console.log(error);
  }
});

function rounding(value) {
  return (Math.round(value * 20) * 0.05).toFixed(2);
}

function getAverage(...args) {
  return args.reduce((acc, val) => acc + val, 0) / args.length;
}

function findClosestValue(value, array) {
  if (value === 0) return 0;
  return array
    .map(element => Math.abs(value - element))
    .reduce((acc, el, index, arr) => el < arr[acc] ? index : acc, 0) + 1;
}