// Japanese Formula — App / UI controller
(function () {
  // ====== State ======
  let selectedCourse = null;
  let selectedLaps = 20;
  let selectedPitMandatory = true;
  let race = null;
  let raceLoopId = null;
  let lastTickAt = 0;
  let lastResult = null;

  // ====== DOM helpers ======
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const screens = ['title', 'course', 'race', 'result', 'records'];
  function show(name) {
    screens.forEach(s => {
      const el = document.getElementById('screen-' + s);
      if (el) el.classList.toggle('active', s === name);
    });
    if (name === 'course') buildCourseList();
    if (name === 'records') buildRecords();
  }

  // ====== Title navigation ======
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.dataset.action;
    if (a === 'goto-course') show('course');
    else if (a === 'goto-title') show('title');
    else if (a === 'goto-records') show('records');
    else if (a === 'rematch') startRace();
  });

  // ====== Course list ======
  function buildCourseList() {
    const list = $('#courseList');
    list.innerHTML = '';
    COURSES.forEach((c, idx) => {
      const card = document.createElement('div');
      card.className = 'course-card' + (selectedCourse && selectedCourse.slug === c.slug ? ' selected' : '');
      card.dataset.slug = c.slug;
      card.innerHTML = `
        <h4>${c.name}</h4>
        <div class="desc">${c.nameJa} — ${c.desc}</div>
        <div class="course-meters">
          <div class="course-meter">
            OVERTAKE
            <div class="meter-bar"><div class="meter-fill" style="width:${(meterValue(c,'overtake')*100).toFixed(0)}%"></div></div>
          </div>
          <div class="course-meter">
            TIRE LOAD
            <div class="meter-bar"><div class="meter-fill" style="width:${(meterValue(c,'tireLoad')*100).toFixed(0)}%; background: var(--push)"></div></div>
          </div>
          <div class="course-meter">
            PIT LOSS
            <div class="meter-bar"><div class="meter-fill" style="width:${(meterValue(c,'pitLoss')*100).toFixed(0)}%; background: var(--pit)"></div></div>
          </div>
        </div>
      `;
      card.addEventListener('click', () => {
        selectedCourse = c;
        $$('.course-card').forEach(el => el.classList.toggle('selected', el.dataset.slug === c.slug));
        $('#btnStartRace').disabled = false;
      });
      list.appendChild(card);
    });

    // セグメントの初期反映
    $$('#pitMandatorySeg button').forEach(b => {
      b.classList.toggle('active', (b.dataset.val === 'true') === selectedPitMandatory);
    });
    $$('#lapsSeg button').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.val, 10) === selectedLaps);
    });

    $('#btnStartRace').disabled = !selectedCourse;
  }

  // セグメント切替
  $('#pitMandatorySeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    selectedPitMandatory = b.dataset.val === 'true';
    $$('#pitMandatorySeg button').forEach(el => el.classList.toggle('active', el === b));
  });
  $('#lapsSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    selectedLaps = parseInt(b.dataset.val, 10);
    $$('#lapsSeg button').forEach(el => el.classList.toggle('active', el === b));
  });

  $('#btnStartRace').addEventListener('click', () => {
    if (!selectedCourse) return;
    startRace();
  });

  // ====== Race ======
  function startRace() {
    if (!selectedCourse) { show('course'); return; }
    race = new Race(selectedCourse, {
      totalLaps: selectedLaps,
      pitMandatory: selectedPitMandatory,
    });
    race.running = true;
    show('race');
    $('#rCourse').textContent = selectedCourse.name;
    bindRaceButtons();
    startRaceLoop();
  }

  function bindRaceButtons() {
    $$('.cmd').forEach(btn => {
      btn.onclick = () => {
        if (!race) return;
        const c = btn.dataset.cmd;
        if (c === 'PUSH') race.setPlayerPace('PUSH');
        else if (c === 'SAVE') race.setPlayerPace('SAVE');
        else if (c === 'OTS') race.activatePlayerOTS();
        else if (c === 'PIT') race.pitPlayer();
      };
    });
  }

  function startRaceLoop() {
    if (raceLoopId) cancelAnimationFrame(raceLoopId);
    lastTickAt = performance.now();
    const loop = (now) => {
      if (!race) return;
      const dt = Math.min(120, now - lastTickAt); // フレーム飛び保護
      lastTickAt = now;
      race.tick(dt);
      renderRace();
      if (race.cars[0].finished && race.cars.every(c => c.finished)) {
        finishRace();
        return;
      }
      raceLoopId = requestAnimationFrame(loop);
    };
    raceLoopId = requestAnimationFrame(loop);
  }

  function renderRace() {
    const info = race.getPlayerInfo();
    $('#rPos').textContent = `${info.position}/${info.totalCars}`;
    $('#rLap').textContent = `${info.currentLap}/${race.totalLaps}`;

    $('#rGapAhead').textContent = info.gapAhead === null ? '——' : fmtGap(info.gapAhead);
    $('#rGapBehind').textContent = info.gapBehind === null ? '——' : fmtGap(info.gapBehind);

    $('#rTireBar').style.width = `${info.tireWear.toFixed(1)}%`;
    $('#rTireText').textContent = `${info.tireWear.toFixed(0)}%`;

    $('#rOtsBar').style.width = `${info.otsRemaining.toFixed(1)}%`;
    $('#rOtsText').textContent = info.otsActive
      ? `ACTIVE (${info.otsRemaining.toFixed(0)}%)`
      : `${info.otsRemaining.toFixed(0)}%`;

    const paceTag = $('#rPaceTag');
    paceTag.textContent = info.paceMode + (info.otsActive ? ' + OTS' : '');
    paceTag.className = 'pace-tag ' + info.paceMode;

    const pitTag = $('#rPitTag');
    if (race.pitMandatory) {
      if (info.pitsCompleted > 0) {
        pitTag.textContent = 'PIT ✓ 達成';
        pitTag.className = 'pit-tag done';
      } else {
        pitTag.textContent = 'PIT 未達成';
        pitTag.className = 'pit-tag warn';
      }
    } else {
      pitTag.textContent = `PIT ${info.pitsCompleted}回`;
      pitTag.className = 'pit-tag';
    }

    $('#rLapFill').style.width = `${(info.lapProgress * 100).toFixed(1)}%`;

    // pace ボタンの active 表示
    $$('.cmd').forEach(b => {
      const c = b.dataset.cmd;
      if (c === 'PUSH') b.classList.toggle('active', info.paceMode === 'PUSH');
      else if (c === 'SAVE') b.classList.toggle('active', info.paceMode === 'SAVE');
      else if (c === 'OTS') b.classList.toggle('active', info.otsActive);
    });
    // ピット中は操作不可
    $$('.cmd').forEach(b => { b.disabled = info.pitting || info.finished; });

    // 順位パネル
    const sorted = race.getSortedCars();
    const posBox = $('#rPositions');
    posBox.innerHTML = '';
    sorted.forEach((c, idx) => {
      const row = document.createElement('div');
      row.className = 'pos-row' + (c.isPlayer ? ' player' : '');
      let gapText = '';
      if (idx === 0) gapText = 'LEADER';
      else {
        const leader = sorted[0];
        if (c.finished && leader.finished) {
          gapText = `+${(c.finishTime - leader.finishTime).toFixed(2)}s`;
        } else if (!c.finished && !leader.finished) {
          const g = (leader.raceProgress - c.raceProgress) * race.course.baseLapTime;
          gapText = g > race.course.baseLapTime
            ? `+${Math.floor(g / race.course.baseLapTime)}LAP`
            : `+${g.toFixed(2)}s`;
        }
      }
      row.innerHTML = `
        <span class="p">${idx + 1}</span>
        <span>${c.name}${c.pittingUntil ? ' [PIT]' : ''}</span>
        <span class="gap">${gapText}</span>
      `;
      posBox.appendChild(row);
    });

    // イベントログ
    const ev = $('#rEventLog');
    ev.innerHTML = '';
    race.events.forEach(e => {
      const div = document.createElement('div');
      div.className = 'ev ' + (e.kind || '');
      div.textContent = e.text;
      ev.appendChild(div);
    });
  }

  function finishRace() {
    if (raceLoopId) cancelAnimationFrame(raceLoopId);
    raceLoopId = null;
    // 結果集計
    const sorted = race.getSortedCars();
    const player = race.cars[0];
    const playerIdx = sorted.findIndex(c => c.isPlayer);

    lastResult = {
      courseSlug: selectedCourse.slug,
      courseName: selectedCourse.name,
      position: playerIdx + 1,
      totalCars: race.cars.length,
      totalTime: player.finishTime,
      bestLap: isFinite(player.bestLap) ? player.bestLap : null,
      pitsCompleted: player.pitsCompleted,
      pitMandatory: race.pitMandatory,
      totalLaps: race.totalLaps,
      pitPenalty: !!player.pitPenalty,
      sorted,
    };

    Storage.recordResult(lastResult);
    renderResult(lastResult);
    show('result');
  }

  // ====== Result ======
  function renderResult(r) {
    $('#resPos').textContent = `P${r.position}`;
    let sub = `${r.position} / ${r.totalCars}`;
    if (r.position === 1) sub = 'WIN — ' + sub;
    else if (r.position <= 3) sub = 'PODIUM — ' + sub;
    if (r.pitPenalty) sub += '  (PIT 義務未達: +30s)';
    $('#resSub').textContent = sub;
    $('#resTotal').textContent = fmtTime(r.totalTime);
    $('#resBest').textContent = r.bestLap ? fmtTime(r.bestLap) : '--';
    $('#resPit').textContent = String(r.pitsCompleted);
    $('#resCourse').textContent = r.courseName;

    const tbl = $('#resTable');
    tbl.innerHTML = '';
    r.sorted.forEach((c, idx) => {
      const row = document.createElement('div');
      row.className = 'row' + (c.isPlayer ? ' player' : '');
      const gap = idx === 0 ? '' : `+${(c.finishTime - r.sorted[0].finishTime).toFixed(2)}s`;
      row.innerHTML = `
        <span>P${idx + 1}</span>
        <span>${c.name}${c.pitPenalty ? ' (PIT未達)' : ''}</span>
        <span style="text-align:right">${idx === 0 ? fmtTime(c.finishTime) : gap}</span>
      `;
      tbl.appendChild(row);
    });
  }

  // ====== Records ======
  function buildRecords() {
    const data = Storage.load();
    const wrap = $('#recordsArea');
    wrap.innerHTML = '';

    // コース別
    COURSES.forEach(c => {
      const card = document.createElement('div');
      card.className = 'rec-card';
      const wins = data.wins[c.slug] || 0;
      const bl = data.bestLap[c.slug];
      card.innerHTML = `
        <h4>${c.name}</h4>
        <div class="rec-row"><span>WINS</span><span class="v">${wins}</span></div>
        <div class="rec-row"><span>BEST LAP</span><span class="v">${bl ? fmtTime(bl) : '--'}</span></div>
      `;
      wrap.appendChild(card);
    });

    // 直近結果
    const recCard = document.createElement('div');
    recCard.className = 'rec-card';
    recCard.innerHTML = `<h4>RECENT</h4>`;
    if (data.recent.length === 0) {
      recCard.innerHTML += `<div class="empty">まだ記録がありません</div>`;
    } else {
      data.recent.forEach(r => {
        const c = COURSES.find(x => x.slug === r.courseSlug);
        const cname = c ? c.name : r.courseSlug;
        const dt = new Date(r.ts);
        const tstr = `${dt.getMonth()+1}/${dt.getDate()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        const row = document.createElement('div');
        row.className = 'rec-row';
        row.innerHTML = `<span>${tstr} ${cname}</span><span class="v">P${r.position}/${r.totalCars}</span>`;
        recCard.appendChild(row);
      });
    }
    wrap.appendChild(recCard);
  }

  $('#btnClearRecords').addEventListener('click', () => {
    if (confirm('記録をクリアしますか？')) {
      Storage.clear();
      buildRecords();
    }
  });

  // ====== Init ======
  show('title');
})();
