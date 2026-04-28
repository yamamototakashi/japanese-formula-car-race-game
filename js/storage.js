// Japanese Formula — localStorage helper
const STORAGE_KEY = 'jfrace_v1';

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.empty();
      const data = JSON.parse(raw);
      // 互換: 必要キーを補完
      if (!data.wins) data.wins = {};
      if (!data.bestLap) data.bestLap = {};
      if (!data.recent) data.recent = [];
      return data;
    } catch (e) {
      console.warn('storage load failed', e);
      return this.empty();
    }
  },

  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('storage save failed', e);
    }
  },

  empty() {
    return { wins: {}, bestLap: {}, recent: [] };
  },

  // 1レース分の結果を反映
  recordResult({ courseSlug, position, totalCars, totalTime, bestLap, pitsCompleted, pitMandatory, totalLaps }) {
    const data = this.load();

    // 勝利数
    if (position === 1) {
      data.wins[courseSlug] = (data.wins[courseSlug] || 0) + 1;
    }

    // ベストラップ更新
    const cur = data.bestLap[courseSlug];
    if (bestLap && isFinite(bestLap) && (!cur || bestLap < cur)) {
      data.bestLap[courseSlug] = bestLap;
    }

    // 直近10件
    data.recent.unshift({
      ts: Date.now(),
      courseSlug, position, totalCars, totalTime, bestLap,
      pitsCompleted, pitMandatory, totalLaps,
    });
    if (data.recent.length > 10) data.recent.length = 10;

    this.save(data);
    return data;
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
