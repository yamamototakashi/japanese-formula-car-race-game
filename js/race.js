// Japanese Formula — Race simulation
// 連続シミュレーション。ゲーム時間は実時間より高速。
// 各車は raceProgress (= 完了周回 + 周回内位置 0..1) を持ち、tickで前進する。

const AI_NAMES = ['TANAKA', 'KIMURA', 'NAKAJIMA', 'SAITO', 'SATO', 'TOYODA', 'HOSHINO', 'INOUE'];

class Race {
  constructor(course, opts) {
    this.course = course;
    this.totalLaps = opts.totalLaps || 20;
    this.pitMandatory = !!opts.pitMandatory;
    this.gameSpeed = opts.gameSpeed || 4.0;
    this.gameTime = 0;
    this.running = false;
    this.events = [];
    this.tickCount = 0;

    const numCars = 6;
    this.cars = [];
    // シャッフルしたAI名
    const names = [...AI_NAMES].sort(() => Math.random() - 0.5);

    for (let i = 0; i < numCars; i++) {
      this.cars.push({
        id: i,
        isPlayer: i === 0,
        name: i === 0 ? 'YOU' : names[i - 1],
        // スターティンググリッド: AIをランダム配置、プレイヤーはP3-4くらいに
        startPos: 0,
        raceProgress: 0,
        tireWear: 0,
        paceMode: i === 0 ? 'NORMAL' : (Math.random() < 0.2 ? 'PUSH' : 'NORMAL'),
        otsRemaining: 100,
        otsActive: false,
        otsActiveUntil: 0,
        pitsCompleted: 0,
        pittingUntil: 0,
        finished: false,
        finishTime: 0,
        bestLap: Infinity,
        currentLapStart: 0,
        currentLap: 1,
        laneSpeed: 1 / course.baseLapTime,
        skill: 0.94 + Math.random() * 0.10, // 0.94–1.04
        aggression: 0.3 + Math.random() * 0.5, // AIの積極度
        // ピット戦略: 何周目にピットインするか（プレイヤー以外）
        plannedPitLap: Math.floor(this.totalLaps * (0.35 + Math.random() * 0.35)),
        pitPenalty: false,
      });
    }

    // グリッド配置: 0〜0.02 のラップ距離分くらいスタガーする
    const gridShuffle = [0, 1, 2, 3, 4, 5];
    // プレイヤーはP3 (= index 2) スタートを基本に
    gridShuffle.sort(() => Math.random() - 0.5);
    // プレイヤーをだいたい中盤に
    const playerGridIdx = 2 + Math.floor(Math.random() * 2); // P3 or P4
    // 入替
    const playerCar = this.cars[0];
    const otherCars = this.cars.slice(1);
    otherCars.sort(() => Math.random() - 0.5);
    const allOrdered = [
      ...otherCars.slice(0, playerGridIdx),
      playerCar,
      ...otherCars.slice(playerGridIdx),
    ];
    allOrdered.forEach((c, idx) => {
      c.startPos = idx + 1;
      c.raceProgress = -idx * 0.0015; // 前にいるほど大きい (= 0)
    });
  }

  // ============= ループ =============
  tick(dtRealMs) {
    if (!this.running) return;
    const dt = (dtRealMs / 1000) * this.gameSpeed;
    this.gameTime += dt;
    this.tickCount++;

    for (const car of this.cars) {
      if (car.finished) continue;

      // ピットイン中？
      if (car.pittingUntil > 0) {
        if (this.gameTime >= car.pittingUntil) {
          car.pittingUntil = 0;
          car.tireWear = 0;
          car.pitsCompleted++;
          if (car.isPlayer) this.pushEvent('PIT 完了 (新タイヤ)', 'ok');
          else this.pushEvent(`${car.name} ピットアウト`, '');
        } else {
          continue; // ピット中は前進しない
        }
      }

      // OTSチェック
      if (car.otsActive && this.gameTime >= car.otsActiveUntil) {
        car.otsActive = false;
        if (car.isPlayer) this.pushEvent('OTS 終了', '');
      }

      // 速度計算 → raceProgress 加算
      const speed = this.calcSpeed(car);
      const oldProg = car.raceProgress;
      car.raceProgress += speed * dt;

      // ラップ越え検知
      if (Math.floor(car.raceProgress) > Math.floor(Math.max(0, oldProg))) {
        const lapTime = this.gameTime - car.currentLapStart;
        if (lapTime > 0 && lapTime < car.bestLap) car.bestLap = lapTime;
        car.currentLapStart = this.gameTime;
        car.currentLap = Math.floor(car.raceProgress) + 1;

        // AIピット判定（このラップ完了時点で予定ラップ達成 & 未ピット）
        if (!car.isPlayer && car.pitsCompleted === 0 && Math.floor(car.raceProgress) >= car.plannedPitLap) {
          this.doPit(car);
        }
        // タイヤ消耗が高すぎるAIは追加ピット検討
        else if (!car.isPlayer && car.tireWear > 85 && this.totalLaps - Math.floor(car.raceProgress) > 4) {
          if (Math.random() < 0.3) this.doPit(car);
        }

        // フィニッシュ判定
        if (car.raceProgress >= this.totalLaps) {
          car.finished = true;
          car.finishTime = this.gameTime;
          // ピット義務未達成ならペナルティ
          if (this.pitMandatory && car.pitsCompleted === 0) {
            car.finishTime += 30;
            car.pitPenalty = true;
          }
          if (car.isPlayer) this.pushEvent('FINISH', 'ok');
        }
      }

      // タイヤ摩耗
      car.tireWear = Math.min(100, car.tireWear + this.calcTireWear(car) * dt);

      // OTS再充填(微少): ラップ後半に少し戻す。ここではしない。シンプル運用。
    }

    // AI判断
    this.aiDecide(dt);

    // 接近時のオーバーテイク判定
    this.processOvertakes(dt);

    // 全車フィニッシュ
    if (this.cars.every(c => c.finished)) {
      this.running = false;
    }
  }

  // ============= 計算 =============
  calcSpeed(car) {
    let s = car.laneSpeed * car.skill;
    if (car.paceMode === 'PUSH') s *= 1.030;
    else if (car.paceMode === 'SAVE') s *= 0.965;
    if (car.otsActive) s *= 1.055;
    // タイヤ摩耗 → 最大10%減
    s *= 1 - (car.tireWear / 100) * 0.10;
    return s;
  }

  calcTireWear(car) {
    let r = this.course.tireLoad * 0.040; // %/sec
    if (car.paceMode === 'PUSH') r *= 1.6;
    else if (car.paceMode === 'SAVE') r *= 0.55;
    if (car.otsActive) r *= 1.4;
    return r;
  }

  // ============= アクション =============
  setPlayerPace(mode) {
    const p = this.cars[0];
    if (p.finished || p.pittingUntil) return;
    if (p.paceMode === mode) {
      p.paceMode = 'NORMAL';
      this.pushEvent(`PACE: NORMAL`, 'you');
    } else {
      p.paceMode = mode;
      this.pushEvent(`PACE: ${mode}`, 'you');
    }
  }

  activatePlayerOTS() {
    const p = this.cars[0];
    if (p.finished || p.pittingUntil) return;
    if (p.otsActive) return;
    if (p.otsRemaining < 8) {
      this.pushEvent('OTS 残量不足', 'bad');
      return;
    }
    const useDuration = 5; // game seconds
    const cost = useDuration * 4; // 5秒で20%消費
    p.otsActive = true;
    p.otsActiveUntil = this.gameTime + useDuration;
    p.otsRemaining = Math.max(0, p.otsRemaining - cost);
    this.pushEvent('OTS 起動', 'you');
  }

  pitPlayer() {
    const p = this.cars[0];
    if (p.finished || p.pittingUntil) return;
    this.doPit(p);
    this.pushEvent('PIT IN', 'you');
  }

  doPit(car) {
    // ピット中は raceProgress 進まない。pitLoss 秒後に再開、タイヤ0
    car.pittingUntil = this.gameTime + this.course.pitLoss;
    car.otsActive = false;
    car.paceMode = car.isPlayer ? 'NORMAL' : (Math.random() < 0.3 ? 'PUSH' : 'NORMAL');
  }

  // ============= AI =============
  aiDecide(dt) {
    // 数tickに1回判断
    if (this.tickCount % 5 !== 0) return;

    for (const car of this.cars) {
      if (car.isPlayer || car.finished || car.pittingUntil) continue;

      // タイヤ摩耗に応じてSAVE/PUSH切替
      if (car.tireWear > 75) car.paceMode = 'SAVE';
      else if (car.tireWear < 35 && car.aggression > 0.5) car.paceMode = 'PUSH';
      else if (car.tireWear < 60) car.paceMode = 'NORMAL';

      // OTS使用判断: 前車との距離が近く、OTS残量があり、最終1/3
      if (!car.otsActive && car.otsRemaining > 12) {
        const ahead = this.findAhead(car);
        if (ahead) {
          const gap = (ahead.raceProgress - car.raceProgress) * this.course.baseLapTime;
          const lapsRemaining = this.totalLaps - car.raceProgress;
          if (gap > 0 && gap < 1.2 && lapsRemaining < this.totalLaps * 0.6) {
            if (Math.random() < 0.05 + car.aggression * 0.05) {
              car.otsActive = true;
              car.otsActiveUntil = this.gameTime + 5;
              car.otsRemaining = Math.max(0, car.otsRemaining - 20);
            }
          }
        }
      }
    }
  }

  // ============= 接近時オーバーテイク =============
  processOvertakes(dt) {
    // 数tickに1度走らせる（毎tickだとうるさい）
    if (this.tickCount % 3 !== 0) return;

    const sorted = this.getSortedCars();
    for (let i = 0; i < sorted.length - 1; i++) {
      const front = sorted[i];
      const back = sorted[i + 1];
      if (front.finished || back.finished) continue;
      if (front.pittingUntil || back.pittingUntil) continue;

      const gapLap = front.raceProgress - back.raceProgress;
      // 周回換算でかなり近い & 後続のほうが速い
      if (gapLap > 0 && gapLap < 0.005) {
        const sFront = this.calcSpeed(front);
        const sBack = this.calcSpeed(back);
        const speedAdv = (sBack - sFront) / sFront;
        if (speedAdv > 0.005) {
          // 抜きやすさ: 課程 overtake × speed差 × 後続の積極性
          const baseProb = 0.20 * this.course.overtake * speedAdv * 60;
          const prob = clamp01(baseProb) * (back.isPlayer ? 1 : 0.85 + back.aggression * 0.3);
          if (Math.random() < prob * (this.tickCount % 3 === 0 ? 1 : 0)) {
            // スワップ: 後続を僅かに前に
            const tmp = front.raceProgress;
            front.raceProgress = back.raceProgress;
            back.raceProgress = tmp;
            if (back.isPlayer) this.pushEvent(`▲ ${front.name} を抜いた`, 'you');
            else if (front.isPlayer) this.pushEvent(`▼ ${back.name} に抜かれた`, 'bad');
            else this.pushEvent(`${back.name} が ${front.name} をパス`, '');
          }
        }
      }
    }
  }

  // ============= 取得系 =============
  findAhead(car) {
    let best = null;
    for (const c of this.cars) {
      if (c === car || c.finished) continue;
      if (c.raceProgress > car.raceProgress) {
        if (!best || c.raceProgress < best.raceProgress) best = c;
      }
    }
    return best;
  }

  getSortedCars() {
    const finished = this.cars.filter(c => c.finished).sort((a, b) => a.finishTime - b.finishTime);
    const racing = this.cars.filter(c => !c.finished).sort((a, b) => b.raceProgress - a.raceProgress);
    return [...finished, ...racing];
  }

  getPlayerInfo() {
    const sorted = this.getSortedCars();
    const idx = sorted.findIndex(c => c.isPlayer);
    const player = sorted[idx];
    const ahead = sorted[idx - 1];
    const behind = sorted[idx + 1];

    let gapAhead = null, gapBehind = null;
    if (ahead && !player.finished && !ahead.finished) {
      gapAhead = (ahead.raceProgress - player.raceProgress) * this.course.baseLapTime;
    }
    if (behind && !player.finished && !behind.finished) {
      gapBehind = (player.raceProgress - behind.raceProgress) * this.course.baseLapTime;
    }

    return {
      position: idx + 1,
      totalCars: this.cars.length,
      currentLap: Math.min(this.totalLaps, Math.floor(Math.max(0, player.raceProgress)) + 1),
      lapProgress: Math.max(0, player.raceProgress - Math.floor(Math.max(0, player.raceProgress))),
      gapAhead, gapBehind,
      tireWear: player.tireWear,
      otsRemaining: player.otsRemaining,
      otsActive: player.otsActive,
      paceMode: player.paceMode,
      pitsCompleted: player.pitsCompleted,
      pitting: player.pittingUntil > 0,
      finished: player.finished,
    };
  }

  // ============= イベントログ =============
  pushEvent(text, kind) {
    this.events.unshift({ text, kind: kind || '', t: this.gameTime });
    if (this.events.length > 5) this.events.length = 5;
  }
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// 秒を mm:ss.s に整形
function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
function fmtGap(sec) {
  if (sec === null || sec === undefined) return '--';
  if (!isFinite(sec)) return '--';
  if (sec >= 60) return `+${Math.floor(sec/60)}:${(sec%60).toFixed(1).padStart(4,'0')}`;
  return `+${sec.toFixed(2)}s`;
}
