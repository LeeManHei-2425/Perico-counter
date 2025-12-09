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
      // 計算價值密度用於排序
      Counter.targetsData.targets.secondary.forEach(({ name, value, weight }) => {
        const profit = getAverage(value.min, value.max) / weight;
        Counter.secondaryTargetsOrder.push({ name, bagProfit: profit });
      });
      Counter.secondaryTargetsOrder.sort((a, b) => b.bagProfit - a.bagProfit);
      Counter.getLoot();
    });
  },

  // --- 自動最佳化核心演算法 ---
  optimize: function() {
      const available = {
          gold: parseInt(document.querySelector('#gold').value) || 0,
          cocaine: parseInt(document.querySelector('#cocaine').value) || 0,
          weed: parseInt(document.querySelector('#weed').value) || 0,
          paintings: parseInt(document.querySelector('#paintings').value) || 0,
          cash: parseInt(document.querySelector('#cash').value) || 0
      };

      const players = parseInt(document.querySelector('#amountOfPlayers').value) || 1;
      let capacityRemaining = players; // 總容量
      const isGoldAlone = document.querySelector('#goldAlone').value === 'true';

      const targets = Counter.targetsData.targets.secondary;
      
      // 優先級排序：黃金 > 古柯鹼 > 大麻 > 畫作 > 現金
      const priority = ['gold', 'cocaine', 'weed', 'paintings', 'cash'];

      priority.forEach(type => {
          const targetData = targets.find(t => t.name === type);
          const weight = targetData.weight;
          const countAvailable = available[type];
          
          if (type === 'gold' && players === 1 && !isGoldAlone) {
              Settings[type] = 0;
              return;
          }

          let canTake = 0;
          
          if (type === 'paintings') {
             // 畫作只能拿整數
             for(let i=0; i<countAvailable; i++) {
                 if (capacityRemaining >= 0.5) {
                     canTake++;
                     capacityRemaining -= 0.5;
                 }
             }
          } else {
             // 其他可拿小數點 (模擬點擊次數)
             const neededSpace = countAvailable * weight;
             
             if (capacityRemaining >= neededSpace) {
                 canTake = countAvailable;
                 capacityRemaining -= neededSpace;
             } else {
                 // 只能拿一部分，計算比例
                 canTake = capacityRemaining / weight;
                 capacityRemaining = 0;
             }
          }
          Settings[type] = canTake;
      });

      Counter.getLoot();
      
      // 按鈕反饋
      const btn = document.getElementById('optimize-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check"></i> 計算完成';
      setTimeout(() => btn.innerHTML = originalText, 1500);
  },

  getLoot: function() {
    const amounts = [];
    let bagsFill = 0;
    const players = Settings.amountOfPlayers;
    let totalValue = 0;
    const isHardMode = Settings.isHardMode ? 'hard' : 'standard';
    const withinCooldownSecondaryBonus = Settings.isWithinCooldown ?
      Counter.targetsData.targets.primary.find(({ name }) => name === Settings.primaryTarget).bonus_multiplier : 1;

    // 分紅警告計算 (修正：如果只有1人，不計算其他人的分紅)
    // 這裡確保如果 UI 隱藏了隊員，計算時也不會加進去
    const totalCut = Settings.leaderCut + 
                    (players > 1 ? Settings.member1Cut : 0) + 
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

    // 計算戰利品
    ['gold', 'cocaine', 'weed', 'paintings', 'cash'].forEach(name => {
      const obj = Counter.targetsData.targets.secondary.find(o => o.name === name);
      let amountTaken = Settings[name]; // 這裡是堆數 (Stacks)

      if (amountTaken < 0) amountTaken = 0;
      if (name === 'paintings') amountTaken = Math.floor(amountTaken);

      const weight = obj.weight;
      const realFill = amountTaken * weight;
      
      if (realFill > 0.001) { 
        bagsFill += realFill;
        
        let clickText = '';
        if (name === 'paintings') {
            clickText = `${amountTaken} 幅`;
        } else {
            const fullStacks = Math.floor(amountTaken);
            const partialStack = amountTaken - fullStacks;
            
            const clicksPerStack = obj.pickup_steps.length;
            let totalClicks = fullStacks * clicksPerStack;

            if (partialStack > 0.001) {
                const percent = partialStack * 100;
                const stepIndex = findClosestValue(percent, obj.pickup_steps);
                totalClicks += stepIndex;
            }
            
            clickText = `${rounding(amountTaken)} 堆 (${totalClicks} 次)`;
        }

        amounts.push({ name: name, amount: realFill, clicks: clickText });
        totalValue += realFill * (getAverage(obj.value.min, obj.value.max) * withinCooldownSecondaryBonus / weight);
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
    
    const fencingFee = totalValue * 0.1;
    const pavelFee = totalValue * 0.02;
    const eliteChallenge = Counter.targetsData.elite_challenge[Settings.isHardMode ? 'hard' : 'standard'];
    
    document.querySelector('#office-safe').innerText = `~ $${Math.round(averageOfficeSafe).toLocaleString()}`;
    document.querySelector('#fencing-fee').innerText = Math.round(fencingFee).toLocaleString();
    document.querySelector('#pavel-fee').innerText = Math.round(pavelFee).toLocaleString();
    document.querySelector('#elite-challenge').innerText = Math.round(eliteChallenge).toLocaleString();
    
    const finalProfit = totalValue + averageOfficeSafe - fencingFee - pavelFee;
    document.querySelector('#max-loot-value').innerText = Math.round(finalProfit).toLocaleString();

    const inputs = document.querySelectorAll('.cuts input');
    [...inputs].forEach(element => {
      // 簡單的顯示更新，錯誤狀態由 CSS 處理
      if (!element.classList.contains('error-input') || element.value <= 100) {
          element.nextElementSibling.innerText = Math.round(finalProfit * element.value / 100).toLocaleString();
      } else {
          element.nextElementSibling.innerText = "Error";
      }
    });

    // 更新列表
    const takenContainer = document.getElementById('taken-loot-display');
    takenContainer.innerHTML = '';
    
    if (amounts.length > 0) {
        takenContainer.classList.remove('hidden');
        amounts.forEach(obj => {
            const div = document.createElement('div');
            div.className = 'taken-item';
            const mapName = {
                'gold': '黃金', 'cocaine': '古柯鹼', 'weed': '大麻', 'paintings': '畫作', 'cash': '現金'
            };
            div.innerHTML = `<span>${mapName[obj.name]}</span> <span>${obj.clicks}</span>`;
            takenContainer.appendChild(div);
        });
    } else {
        takenContainer.classList.add('hidden');
    }

    // 更新背包條
    const maxCapacity = Settings.amountOfPlayers;
    document.querySelector('#max_bags_display').innerText = maxCapacity;
    document.querySelector('#bags_fill').innerText = bagsFill.toFixed(2);
    
    const percent = (bagsFill / maxCapacity) * 100;
    const bar = document.querySelector('#bag-bar');
    bar.style.width = `${Math.min(percent, 100)}%`;
    
    if (percent > 100.1) bar.style.backgroundColor = '#ff5252';
    else if (percent > 95) bar.style.backgroundColor = '#00e676';
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

    Object.values(htmlElements).forEach(element => {
      if(element) {
          element.addEventListener('change', event => {
            Settings[event.currentTarget.id] = +event.target.value;
            Counter.getLoot();
          });
      }
    });
    
    document.querySelector('#reset-settings').addEventListener('click', () => {
       ['gold', 'weed', 'cash', 'cocaine', 'paintings'].forEach(t => {
           Settings[t] = 0;
           document.getElementById(t).value = 0;
       });
       // 重置時，如果現在是多人，回復 85/15；如果是單人，設為 100
       if (Settings.amountOfPlayers === 1) {
           Settings.leaderCut = 100; document.getElementById('leaderCut').value = 100;
       } else {
           Settings.leaderCut = 85; document.getElementById('leaderCut').value = 85;
           Settings.member1Cut = 15; document.getElementById('member1Cut').value = 15;
       }
       Counter.getLoot();
    });

    document.querySelector('#link-settings').addEventListener('click', () => {
        alert("功能維護中"); 
    });

    SettingProxy.addListener(Settings, 'gold weed cash cocaine paintings primaryTarget isHardMode isWithinCooldown goldAlone leaderCut member1Cut member2Cut member3Cut amountOfPlayers', Counter.getLoot);
    
    // 監聽玩家人數改變，動態隱藏/顯示分紅欄位
    SettingProxy.addListener(Settings, 'amountOfPlayers', () => {
      document.querySelector('#goldAlone').parentElement.classList.toggle('hidden', Settings.amountOfPlayers !== 1);
      
      const rows = document.querySelectorAll('.cuts .cut-row');
      // 這裡對應 index.html 結構: 
      // rows[0]=Leader, rows[1]=Member1, rows[2]=Member2, rows[3]=Member3
      
      // 當人數 < 2 (即 1人) 時，隱藏 Member 1 (rows[1])
      if(rows[1]) rows[1].classList.toggle('hidden', Settings.amountOfPlayers < 2);
      if(rows[2]) rows[2].classList.toggle('hidden', Settings.amountOfPlayers < 3);
      if(rows[3]) rows[3].classList.toggle('hidden', Settings.amountOfPlayers < 4);

      // 單人時自動將隊長設為 100%
      if (Settings.amountOfPlayers === 1) {
          Settings.leaderCut = 100;
          const leaderInput = document.getElementById('leaderCut');
          if(leaderInput) leaderInput.value = 100;
      }

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