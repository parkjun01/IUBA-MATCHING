// ============================================================
// 데이터 (Supabase)
// ============================================================
const PW_KEY     = 'iuba_admin_pw';
const PW_DEFAULT = '2014';
function getAdminPw() { return localStorage.getItem(PW_KEY) || PW_DEFAULT; }
function setAdminPw(pw) { localStorage.setItem(PW_KEY, pw); }
const SUPABASE_URL = 'https://uospwzmrfaqypnwlhazd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvc3B3em1yZmFxeXBud2xoYXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzQxMjMsImV4cCI6MjA5NzcxMDEyM30.qszyTs4DwJSlQnWd4YUqIF27MixNQFRrnvDVD01HVaI';
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let db = { requiredMembers: [], optionalMembers: [], venues: [] };
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _fromMember(r) {
  return { id: r.id, name: r.name, gender: r.gender, role: r.role, hasCar: r.has_car, attending: r.attending };
}
async function loadDB() {
  const [{ data: mems, error: me }, { data: vens, error: ve }] = await Promise.all([
    supa.from('members').select('*').order('created_at'),
    supa.from('venues').select('*').order('created_at'),
  ]);
  if (me || ve) { console.error(me || ve); toast('데이터 로드 실패. 인터넷 연결을 확인해주세요.'); return; }
  db.requiredMembers = (mems || []).filter(m => m.member_type === 'required').map(_fromMember);
  db.optionalMembers = (mems || []).filter(m => m.member_type === 'optional').map(_fromMember);
  db.venues = (vens || []).map(v => ({ id: v.id, name: v.name, requiresCar: v.requires_car }));
}
async function _upsertMember(member, type) {
  const { error } = await supa.from('members').upsert({
    id: member.id, name: member.name, gender: member.gender,
    role: member.role, has_car: member.hasCar,
    member_type: type, attending: member.attending || false,
  });
  if (error) throw error;
}
async function _deleteMember(id) {
  const { error } = await supa.from('members').delete().eq('id', id);
  if (error) throw error;
}
async function _upsertVenue(venue) {
  const { error } = await supa.from('venues').upsert({ id: venue.id, name: venue.name, requires_car: venue.requiresCar });
  if (error) throw error;
}
async function _deleteVenue(id) {
  const { error } = await supa.from('venues').delete().eq('id', id);
  if (error) throw error;
}
// ============================================================
// 페이지 전환
// ============================================================
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (id === 'page-home')     refreshHome();
  if (id === 'page-required') renderRequired();
  if (id === 'page-optional') renderOptional();
  if (id === 'page-venues')   renderVenues();
  if (id === 'page-confirm')  renderConfirm();
  if (id === 'page-manual')   renderManual();
}
// ============================================================
// 홈
// ============================================================
function refreshHome() {
  const pool = getPool();
  document.getElementById('stat-total').textContent = pool.length + '명';
  const container = document.getElementById('home-names');
  if (pool.length === 0) {
    container.innerHTML = '<p class="home-names-empty">관리자 페이지에서 멤버를 추가해주세요.</p>';
  } else {
    container.innerHTML = pool.map(m =>
      `<span class="name-chip name-chip-session">${esc(m.name)}<button class="chip-rm" onclick="removeParticipant('${m.id}')">✕</button></span>`
    ).join('');
  }
  const venueEl = document.getElementById('home-venue-chips');
  if (!venueEl) return;
  const visibleVenues = db.venues.filter(v => !sessionHiddenVenues.has(v.id));
  venueEl.innerHTML = visibleVenues.length === 0
    ? '<p class="home-names-empty">장소를 추가해주세요.</p>'
    : visibleVenues.map(v =>
        `<span class="name-chip name-chip-session">${esc(v.name)}${v.requiresCar ? ' 🚗' : ''}<button class="chip-rm" onclick="hideVenueHome('${v.id}')">✕</button></span>`
      ).join('');
}
function removeParticipant(id) {
  sessionExcluded.add(id);
  sessionIncluded.delete(id);
  refreshHome();
}
function openAddParticipant() {
  const poolIds = new Set(getPool().map(m => m.id));
  const available = [...db.requiredMembers, ...db.optionalMembers].filter(m => !poolIds.has(m.id));
  if (available.length === 0) { toast('추가 가능한 인원이 없습니다.'); return; }
  document.getElementById('add-participant-list').innerHTML = available.map(m =>
    `<button class="pick-item" onclick="addParticipant('${m.id}')">${esc(m.name)}</button>`
  ).join('');
  openModal('modal-add-participant');
}
function addParticipant(id) {
  sessionExcluded.delete(id);
  const opt = db.optionalMembers.find(m => m.id === id);
  if (opt && !opt.attending) sessionIncluded.add(id);
  closeModal('modal-add-participant');
  refreshHome();
}
function startMatching() {
  const pool = getPool();
  if (pool.length < 2) { toast('매칭 대상이 2명 이상이어야 합니다.'); return; }
  showPage('page-confirm');
}
function goHome() {
  sessionExcluded.clear();
  sessionIncluded.clear();
  sessionHiddenVenues.clear();
  showPage('page-home');
}
function hideVenueHome(id) {
  sessionHiddenVenues.add(id);
  refreshHome();
}
// ============================================================
// 고정 멤버
// ============================================================
function renderRequired() {
  const list = db.requiredMembers;
  document.getElementById('empty-required').style.display = list.length ? 'none' : 'block';
  document.getElementById('list-required').innerHTML = list.map(m => memberCardHTML(m, 'required')).join('');
}
// ============================================================
// 유동 멤버
// ============================================================
function renderOptional() {
  const list = db.optionalMembers;
  document.getElementById('empty-optional').style.display = list.length ? 'none' : 'block';
  document.getElementById('list-optional').innerHTML = list.map(m => optionalCardHTML(m)).join('');
}
async function toggleAttend(id) {
  const m = db.optionalMembers.find(x => x.id === id);
  if (!m) return;
  m.attending = !m.attending;
  try { await _upsertMember(m, 'optional'); } catch(e) { m.attending = !m.attending; toast('저장 실패'); return; }
  renderOptional(); refreshHome();
}
// ============================================================
// 장소
// ============================================================
function renderVenues() {
  const list = db.venues;
  document.getElementById('empty-venues').style.display = list.length ? 'none' : 'block';
  document.getElementById('list-venues').innerHTML = list.map(v => venueCardHTML(v)).join('');
}
// ============================================================
// HTML 생성 헬퍼
// ============================================================
function memberCardHTML(m, type) {
  const icon = m.gender === 'male' ? '👦' : '👧';
  const gTag = m.gender === 'male'
    ? '<span class="tag tag-m">남</span>'
    : '<span class="tag tag-f">여</span>';
  const rTag = m.role !== '일반' ? `<span class="tag tag-role">${m.role}</span>` : '';
  const cTag = m.hasCar ? '<span class="tag tag-car">🚗 차량</span>' : '';
  return `
    <div class="member-card">
      <div class="avatar ${m.gender}">${icon}</div>
      <div class="member-info">
        <div class="member-name">${esc(m.name)}</div>
        <div class="tags">${gTag}${rTag}${cTag}</div>
      </div>
      <div class="card-actions">
        <button class="btn-icon" onclick="openMemberEdit('${m.id}','${type}')">✏️</button>
        <button class="btn-icon" onclick="deleteMember('${m.id}','${type}')">🗑️</button>
      </div>
    </div>`;
}
function optionalCardHTML(m) {
  const icon = m.gender === 'male' ? '👦' : '👧';
  const gTag = m.gender === 'male'
    ? '<span class="tag tag-m">남</span>'
    : '<span class="tag tag-f">여</span>';
  const rTag = m.role !== '일반' ? `<span class="tag tag-role">${m.role}</span>` : '';
  const cTag = m.hasCar ? '<span class="tag tag-car">🚗 차량</span>' : '';
  const onClass = m.attending ? 'on' : '';
  const onText  = m.attending ? '✅ 이번 참석' : '이번 참석';
  return `
    <div class="member-card">
      <div class="avatar ${m.gender}">${icon}</div>
      <div class="member-info">
        <div class="member-name">${esc(m.name)}</div>
        <div class="tags">${gTag}${rTag}${cTag}</div>
      </div>
      <div class="card-actions">
        <button class="toggle-attend ${onClass}" onclick="toggleAttend('${m.id}')">${onText}</button>
        <button class="btn-icon" onclick="openMemberEdit('${m.id}','optional')">✏️</button>
        <button class="btn-icon" onclick="deleteMember('${m.id}','optional')">🗑️</button>
      </div>
    </div>`;
}
function venueCardHTML(v) {
  const icon = v.requiresCar ? '🚗📍' : '📍';
  const cTag = v.requiresCar ? '<span class="tag tag-car">차량 필요</span>' : '';
  return `
    <div class="venue-card">
      <div class="venue-icon">${icon}</div>
      <div class="venue-info">
        <div class="venue-name">${esc(v.name)}</div>
        <div class="tags" style="margin-top:4px">${cTag}</div>
      </div>
      <div class="card-actions">
        <button class="btn-icon" onclick="openVenueEdit('${v.id}')">✏️</button>
        <button class="btn-icon" onclick="deleteVenue('${v.id}')">🗑️</button>
      </div>
    </div>`;
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// ============================================================
// 확인 페이지 + 세션 제외
// ============================================================
const sessionExcluded = new Set();
const sessionIncluded = new Set();
const sessionHiddenVenues = new Set();
function getPool() {
  const req = db.requiredMembers.filter(m => !sessionExcluded.has(m.id));
  const opt = db.optionalMembers.filter(m =>
    (m.attending || sessionIncluded.has(m.id)) && !sessionExcluded.has(m.id)
  );
  return [...req, ...opt];
}
function getAllCandidates() {
  return [
    ...db.requiredMembers,
    ...db.optionalMembers.filter(m => m.attending)
  ];
}
function renderConfirm() {
  const all = getAllCandidates();
  document.getElementById('confirm-list').innerHTML = all.map(m => {
    const icon = m.gender === 'male' ? '👦' : '👧';
    const gTag = m.gender === 'male'
      ? '<span class="tag tag-m">남</span>'
      : '<span class="tag tag-f">여</span>';
    const cTag = m.hasCar ? '<span class="tag tag-car">🚗</span>' : '';
    const excl = sessionExcluded.has(m.id);
    return `
      <div class="member-card ${excl ? 'excluded' : ''}">
        <div class="avatar ${m.gender}">${icon}</div>
        <div class="member-info">
          <div class="member-name">${esc(m.name)}</div>
          <div class="tags">${gTag}${cTag}</div>
        </div>
        <button class="btn-exclude ${excl ? 'on' : ''}" onclick="toggleExclude('${m.id}')">
          ${excl ? '제외됨' : '제외'}
        </button>
      </div>`;
  }).join('');
  const pool = getPool();
  const el   = document.getElementById('combo-count');
  if (pool.length < 2) {
    el.className = 'combo-info warn';
    el.innerHTML = '<span class="combo-num">0</span>매칭 대상이 2명 이상이어야 합니다.';
    return;
  }
  const configs = getAllTeamSizeConfigs(pool.length);
  if (configs.length === 0) {
    el.className = 'combo-info warn';
    el.innerHTML = '<span class="combo-num">0</span>유효한 팀 구성이 없습니다. 성별 구성을 확인해주세요.';
    return;
  }
  el.className = 'size-config-wrap';
  el.innerHTML = `
    <p class="size-config-title">팀 구성 방식 선택</p>
    <div class="size-config-cards">
      ${configs.map(c => {
        const parts = [];
        if (c.threes > 0) parts.push(`3인 ${c.threes}팀`);
        if (c.twos   > 0) parts.push(`2인 ${c.twos}팀`);
        return `<button class="size-config-card" onclick="selectSizeConfig(${c.twos},${c.threes})">
          <span class="size-config-label">${parts.join(' + ')}</span>
          <span class="size-config-total">총 ${c.twos + c.threes}팀 · 탭해서 시작 →</span>
        </button>`;
      }).join('')}
    </div>`;
}
function toggleExclude(id) {
  sessionExcluded.has(id) ? sessionExcluded.delete(id) : sessionExcluded.add(id);
  renderConfirm();
}
// ============================================================
// 경우의 수 계산 (비트마스크 DP)
// ============================================================
function countCombinations(members) {
  const n = members.length;
  if (n < 2) return 0;
  if (n > 16) return null;
  const memo = new Map();
  function bits(mask) { let c = 0, m = mask; while (m) { c += m & 1; m >>= 1; } return c; }
  function dp(avail) {
    if (avail === 0) return 1;
    if (memo.has(avail)) return memo.get(avail);
    let first = -1;
    for (let i = 0; i < n; i++) { if (avail & (1 << i)) { first = i; break; } }
    const others = [];
    for (let i = first + 1; i < n; i++) { if (avail & (1 << i)) others.push(i); }
    let total = 0;
    for (let i = 0; i < others.length; i++) {
      const team = [members[first], members[others[i]]];
      if (validTeam(team)) {
        const next = avail ^ (1 << first) ^ (1 << others[i]);
        const left = bits(next);
        if (left === 0 || left >= 2) total += dp(next);
      }
    }
    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        const team = [members[first], members[others[i]], members[others[j]]];
        if (validTeam(team)) {
          const next = avail ^ (1 << first) ^ (1 << others[i]) ^ (1 << others[j]);
          const left = bits(next);
          if (left === 0 || left >= 2) total += dp(next);
        }
      }
    }
    memo.set(avail, total);
    return total;
  }
  return dp((1 << n) - 1);
}
// ============================================================
// 팀 규모 구성
// ============================================================
function getAllTeamSizeConfigs(n) {
  const configs = [];
  for (let b = Math.floor(n / 3); b >= 0; b--) {
    const rem = n - b * 3;
    if (rem % 2 === 0) configs.push({ twos: rem / 2, threes: b });
  }
  return configs; // 3인 팀 많은 순서
}

function generateTeamsWithConfig(members, twos, threes) {
  const sizes = [...Array(threes).fill(3), ...Array(twos).fill(2)];
  function tryBuild() {
    const s = shuffle(members);
    let idx = 0, teams = [];
    for (const sz of sizes) {
      const team = s.slice(idx, idx + sz);
      idx += sz;
      if (!validTeam(team)) return null;
      teams.push(team);
    }
    return teams;
  }
  for (let t = 0; t < 2000; t++) {
    const teams = tryBuild();
    if (teams && teams.every(t => t.filter(m => m.role !== '일반').length <= 1)) return teams;
  }
  for (let t = 0; t < 1000; t++) {
    const teams = tryBuild();
    if (teams) return teams;
  }
  return null;
}

function selectSizeConfig(twos, threes) {
  const pool = getPool();
  const teams = generateTeamsWithConfig(pool, twos, threes);
  if (!teams) { toast('유효한 팀을 구성할 수 없습니다. 성별 구성을 확인해주세요.'); return; }
  const result = assignVenues(teams, db.venues);
  _manualCount = 0;
  _aniOffset   = 0;
  matchResult  = result;
  aniTeams     = result;
  aniIndex     = 0;
  aniCancelled = false;
  document.getElementById('teams-revealed').innerHTML = '';
  document.getElementById('slot-area').innerHTML = '';
  document.getElementById('matching-title').textContent = '🎯 매칭 중...';
  showPage('page-matching');
  setTimeout(animateNext, 800);
}

// ============================================================
// 매칭 알고리즘
// ============================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function teamSizes(n) {
  const sizes = [];
  let r = n;
  while (r > 0) {
    if (r <= 3)      { sizes.push(r); r = 0; }
    else if (r === 4){ sizes.push(2, 2); r = 0; }
    else             { sizes.push(3); r -= 3; }
  }
  return sizes;
}
function validTeam(team) {
  const m = team.filter(x => x.gender === 'male').length;
  const f = team.filter(x => x.gender === 'female').length;
  if (m === 2 && f === 1) return false; // 남2+여1 불가
  if (m === 1 && f === 1) return false; // 남1+여1 불가
  return true;
}
function generateTeams(members) {
  if (members.length < 2) throw new Error('매칭 대상이 2명 이상이어야 합니다.');

  function tryBuild() {
    const s = shuffle(members);
    const sizes = teamSizes(s.length);
    let idx = 0, teams = [];
    for (const sz of sizes) {
      const team = s.slice(idx, idx + sz);
      idx += sz;
      if (!validTeam(team)) return null;
      teams.push(team);
    }
    return teams;
  }

  // 1순위: 임원끼리 같은 팀이 없는 조합
  for (let t = 0; t < 2000; t++) {
    const teams = tryBuild();
    if (teams && teams.every(t => t.filter(m => m.role !== '일반').length <= 1)) return teams;
  }

  // 2순위(후순위): 임원 중복 허용
  for (let t = 0; t < 1000; t++) {
    const teams = tryBuild();
    if (teams) return teams;
  }

  throw new Error('유효한 팀을 구성할 수 없습니다.\n남자 2명 + 여자 1명 조합은 불가합니다.\n인원 구성을 확인해 주세요.');
}
function assignVenues(teams, venues) {
  if (!venues.length) return teams.map(t => ({ members: t, venue: null }));
  const carVenues  = shuffle(venues.filter(v => v.requiresCar));
  const freeVenues = shuffle(venues.filter(v => !v.requiresCar));
  const carTeams   = shuffle(teams.filter(t => t.some(m => m.hasCar)));
  if (carVenues.length > carTeams.length) {
    toast(`⚠️ 차량 필요 장소(${carVenues.length})가 차량 보유 팀(${carTeams.length})보다 많습니다.`);
  }
  const map = new Map();
  carVenues.forEach((v, i) => { if (carTeams[i]) map.set(carTeams[i], v); });
  const unassigned = teams.filter(t => !map.has(t));
  freeVenues.forEach((v, i) => { if (unassigned[i]) map.set(unassigned[i], v); });
  return teams.map(t => ({ members: t, venue: map.get(t) || null }));
}
// ============================================================
// 애니메이션 (슬롯머신 릴 스타일)
// ============================================================
let matchResult  = [];
let _manualCount = 0;
let _aniOffset   = 0;
let aniTeams     = [];
let aniIndex     = 0;
let aniCancelled = false;
const REEL_ITEM_H = 56;
const REEL_WIN_H  = 56;
function startAnimation() {
  const pool = getPool();
  if (pool.length < 2) { toast('매칭 대상이 2명 이상이어야 합니다.'); return; }
  const configs = getAllTeamSizeConfigs(pool.length);
  if (!configs.length) { toast('유효한 팀 구성이 없습니다.'); return; }
  const cfg = configs[Math.floor(Math.random() * configs.length)];
  selectSizeConfig(cfg.twos, cfg.threes);
}
// ── 효과음 (Web Audio API) ──
let _audioCtx = null;
function _getAC() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}
function playTick() {
  try {
    const ac = _getAC();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.value = 600 + Math.random() * 300;
    gain.gain.setValueAtTime(0.09, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.055);
    osc.start(ac.currentTime); osc.stop(ac.currentTime + 0.055);
  } catch(e) {}
}
function playReveal() {
  try {
    const ac = _getAC();
    [0, 0.08, 0.16].forEach((t, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.value = [523, 659, 784][i];
      gain.gain.setValueAtTime(0, ac.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.16, ac.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.38);
      osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.38);
    });
  } catch(e) {}
}
function playComplete() {
  try {
    const ac = _getAC();
    [0, 0.1, 0.2, 0.35, 0.5].forEach((t, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      osc.type = 'triangle';
      osc.frequency.value = [523, 659, 784, 1047, 1318][i];
      gain.gain.setValueAtTime(0, ac.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.18, ac.currentTime + t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + t + 0.55);
      osc.start(ac.currentTime + t); osc.stop(ac.currentTime + t + 0.55);
    });
  } catch(e) {}
}
function animateNext() {
  if (aniCancelled) return;
  if (aniIndex >= aniTeams.length) {
    document.getElementById('matching-title').textContent = '💞 매칭 완료!';
    document.getElementById('slot-area').innerHTML = '';
    playComplete();
    launchConfetti();
    setTimeout(() => { if (!aniCancelled) showResults(); }, 2000);
    return;
  }
  const { members: team, venue } = aniTeams[aniIndex];
  const teamNo = aniIndex + 1 + _aniOffset;
  document.getElementById('matching-title').textContent = `팀 ${teamNo} 뽑는 중...`;
  const allNames = getPool().map(m => m.name);
  buildSlotUI(team, allNames, () => {
    if (aniCancelled) return;
    revealTeam({ members: team, venue }, teamNo);
    aniIndex++;
    setTimeout(animateNext, 1400);
  });
}
function buildSlotUI(team, allNames, onDone) {
  const slotArea = document.getElementById('slot-area');
  slotArea.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'slot-vs-row';
  const reelData = [];
  team.forEach((member, idx) => {
    if (idx > 0) {
      const sep = document.createElement('div');
      sep.className = 'slot-sep';
      sep.textContent = idx === 1 ? 'vs' : '+';
      row.appendChild(sep);
    }
    const wrap = document.createElement('div');
    wrap.className = 'slot-reel-wrap';
    const lbl = document.createElement('div');
    lbl.className = 'slot-member-lbl';
    lbl.textContent = `멤버 ${idx + 1}`;
    wrap.appendChild(lbl);
    const win = document.createElement('div');
    win.className = 'slot-reel-win';
    const ft = document.createElement('div'); ft.className = 'slot-fade-top';
    const fb = document.createElement('div'); fb.className = 'slot-fade-bot';
    const cl = document.createElement('div'); cl.className = 'slot-center-line';
    const reel = document.createElement('div');
    reel.className = 'slot-reel';
    const nameList = [];
    for (let i = 0; i < 16; i++) { shuffle([...allNames]).forEach(n => nameList.push(n)); }
    nameList.push(member.name);
    nameList.forEach(name => {
      const item = document.createElement('div');
      item.className = 'slot-reel-item';
      item.textContent = name;
      reel.appendChild(item);
    });
    win.appendChild(ft); win.appendChild(fb); win.appendChild(cl); win.appendChild(reel);
    wrap.appendChild(win);
    row.appendChild(wrap);
    reelData.push({ reel, win, member, nameList });
  });
  slotArea.appendChild(row);
  let doneCount = 0;
  reelData.forEach(({ reel, win, member, nameList }, idx) => {
    const delay    = idx * 350;
    const duration = 3200 + idx * 700;
    setTimeout(() => {
      if (aniCancelled) return;
      spinReel(reel, win, nameList, member.name, member.gender, duration, () => {
        doneCount++;
        if (doneCount === team.length && !aniCancelled) setTimeout(onDone, 500);
      });
    }, delay);
  });
}
function spinReel(reel, win, nameList, target, gender, duration, onDone) {
  const targetIdx = nameList.lastIndexOf(target);
  const finalY = -(targetIdx * REEL_ITEM_H) + (REEL_WIN_H / 2) - (REEL_ITEM_H / 2);
  let startTime = null;
  let lastTickIdx = -1;
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function frame(ts) {
    if (aniCancelled) return;
    if (!startTime) startTime = ts;
    const elapsed  = ts - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = easeOutQuart(progress);
    const currentY = finalY * eased;
    reel.style.transform = `translateY(${currentY.toFixed(2)}px)`;
    reel.style.filter = progress < 0.65
      ? `blur(${((1 - progress / 0.65) * 3).toFixed(1)}px)` : 'none';
    const tickIdx = Math.floor(-currentY / REEL_ITEM_H);
    if (tickIdx !== lastTickIdx) { lastTickIdx = tickIdx; playTick(); }
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      reel.style.transform = `translateY(${finalY}px)`;
      reel.style.filter    = 'none';
      win.classList.add('slot-win-pop');
      win.classList.add(gender === 'male' ? 'slot-glow-m' : 'slot-glow-f');
      setTimeout(() => win.classList.remove('slot-win-pop'), 500);
      if (onDone) setTimeout(onDone, 320);
    }
  }
  requestAnimationFrame(frame);
}
function revealTeam({ members, venue }, no) {
  playReveal();
  const membersHTML = members.map(m => {
    const icon = m.gender === 'male' ? '👦' : '👧';
    return `<span class="name-pill name-pill-${m.gender}">${icon} ${esc(m.name)}</span>`;
  }).join('');
  const venueHTML = venue
    ? `<div class="venue-pill">📍 ${esc(venue.name)}${venue.requiresCar ? ' 🚗' : ''}</div>` : '';
  const card = document.createElement('div');
  card.className = 'team-chip';
  card.innerHTML = `
    <div class="team-chip-no">팀 ${no}</div>
    <div class="team-chip-members">${membersHTML}</div>
    ${venueHTML}`;
  const container = document.getElementById('teams-revealed');
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('team-chip-in')));
  document.getElementById('slot-area').innerHTML = '';
}
function launchConfetti() {
  const container = document.getElementById('page-matching');
  const colors = ['#a78bfa','#34d399','#fbbf24','#f472b6','#ffffff','#60a5fa'];
  for (let i = 0; i < 36; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-dot';
    const angle = Math.random() * Math.PI * 2;
    const dist  = 80 + Math.random() * 200;
    const size  = 7 + Math.random() * 9;
    const delay = Math.random() * 0.5;
    const dur   = 1.0 + Math.random() * 0.8;
    const color = colors[i % colors.length];
    const dx    = (Math.cos(angle) * dist).toFixed(1);
    const dy    = (Math.sin(angle) * dist).toFixed(1);
    el.style.cssText = `width:${size}px;height:${size}px;background:${color};left:50%;top:40%;animation:confettiFly ${dur}s ${delay}s cubic-bezier(.22,.61,.36,1) forwards;--dx:${dx}px;--dy:${dy}px;`;
    container.appendChild(el);
    setTimeout(() => el.remove(), (dur + delay + 0.2) * 1000);
  }
}
// ============================================================
// 결과
// ============================================================
function showResults() {
  showPage('page-results');
  renderResults();
}
function renderResults() {
  const hasRandom = _manualCount > 0 && matchResult.length > _manualCount;
  document.getElementById('results-list').innerHTML = matchResult.map(({ members, venue }, i) => {
    const membersHTML = members.map(m =>
      `<div class="result-member"><strong>${esc(m.name)}</strong></div>`
    ).join('');
    const venueHTML = venue
      ? `<button class="result-venue result-venue-btn" onclick="pickResultVenue(${i})">
           📍 <strong>${esc(venue.name)}</strong>${venue.requiresCar ? ' 🚗' : ''}
           <span class="venue-change">변경</span>
         </button>`
      : `<button class="result-venue result-venue-btn" onclick="pickResultVenue(${i})">
           📍 <span class="venue-unset">장소 선택 →</span>
         </button>`;
    const divider = (hasRandom && i === _manualCount)
      ? `<div class="result-divider">🎰 랜덤 배정</div>` : '';
    const badge = hasRandom
      ? (i < _manualCount ? '<span class="team-badge badge-fixed">직접</span>' : '<span class="team-badge badge-random">랜덤</span>')
      : '';
    return `${divider}<div class="result-card"><div class="result-team-no">팀 ${i + 1} ${badge}</div><div class="result-members">${membersHTML}</div>${venueHTML}</div>`;
  }).join('');
}
function restartMatching() {
  aniCancelled = true;
  showPage('page-confirm');
}
// ============================================================
// 장소 픽커
// ============================================================
let _venuePick_cb = null;
function openVenuePicker(callback) {
  _venuePick_cb = callback;
  const venues = [{ id: '__none__', name: '미배정', requiresCar: false }, ...db.venues];
  document.getElementById('venue-pick-list').innerHTML = venues.map(v =>
    `<button class="pick-item" onclick="applyVenuePick('${v.id}')">📍 ${esc(v.name)}${v.requiresCar ? ' 🚗' : ''}</button>`
  ).join('');
  openModal('modal-venue-pick');
}
function applyVenuePick(venueId) {
  const venue = venueId === '__none__' ? null : db.venues.find(v => v.id === venueId) || null;
  closeModal('modal-venue-pick');
  if (_venuePick_cb) { _venuePick_cb(venue); _venuePick_cb = null; }
}
function pickResultVenue(teamIdx) {
  openVenuePicker(venue => { matchResult[teamIdx].venue = venue; renderResults(); });
}
// ============================================================
// 직접 배정
// ============================================================
let manualTeams = [];
let _memberPick_cb = null;
function openManualMode() {
  const pool = getPool();
  if (pool.length < 2) { toast('매칭 대상이 2명 이상이어야 합니다.'); return; }
  manualTeams = [{ members: [], venue: null }];
  showPage('page-manual');
}
function renderManual() {
  const pool = getPool();
  const assigned = new Set(manualTeams.flatMap(t => t.members.map(m => m.id)));
  const unassigned = pool.filter(m => !assigned.has(m.id));
  document.getElementById('manual-pool').innerHTML = unassigned.length === 0
    ? '<span class="home-names-empty">모두 배정되었습니다.</span>'
    : unassigned.map(m => `<span class="name-chip">${esc(m.name)}</span>`).join('');
  document.getElementById('manual-teams').innerHTML = manualTeams.map((team, i) => {
    const membersHTML = team.members.map((m, mi) =>
      `<span class="name-chip name-chip-rm" onclick="removeManualMember(${i},${mi})">${esc(m.name)} ✕</span>`
    ).join('');
    const venueLabel = team.venue ? `📍 ${esc(team.venue.name)}` : '📍 장소 선택';
    const rmBtn = manualTeams.length > 1
      ? `<button class="btn-rm-team" onclick="removeManualTeam(${i})" title="팀 삭제">✕</button>` : '';
    return `
      <div class="manual-team-card">
        <div class="manual-team-header">
          <span class="manual-team-title">팀 ${i + 1}</span>
          <button class="btn-venue-pick" onclick="pickManualVenue(${i})">${venueLabel}</button>
          ${rmBtn}
        </div>
        <div class="manual-team-members">
          ${membersHTML}
          <button class="btn-add-member" onclick="pickManualMember(${i})">+ 추가</button>
        </div>
      </div>`;
  }).join('');
}
function addManualTeam() { manualTeams.push({ members: [], venue: null }); renderManual(); }
function removeManualTeam(i) { manualTeams.splice(i, 1); renderManual(); }
function pickManualMember(teamIdx) {
  const pool = getPool();
  const assigned = new Set(manualTeams.flatMap(t => t.members.map(m => m.id)));
  const unassigned = pool.filter(m => !assigned.has(m.id));
  if (unassigned.length === 0) { toast('배정할 멤버가 없습니다.'); return; }
  _memberPick_cb = memberId => {
    const member = pool.find(m => m.id === memberId);
    if (member) { manualTeams[teamIdx].members.push(member); renderManual(); }
  };
  document.getElementById('member-pick-list').innerHTML = unassigned.map(m =>
    `<button class="pick-item" onclick="applyMemberPick('${m.id}')">${esc(m.name)}</button>`
  ).join('');
  openModal('modal-member-pick');
}
function applyMemberPick(memberId) {
  closeModal('modal-member-pick');
  if (_memberPick_cb) { _memberPick_cb(memberId); _memberPick_cb = null; }
}
function removeManualMember(teamIdx, memberIdx) {
  manualTeams[teamIdx].members.splice(memberIdx, 1);
  renderManual();
}
function pickManualVenue(teamIdx) {
  openVenuePicker(venue => { manualTeams[teamIdx].venue = venue; renderManual(); });
}
function finalizeManual() {
  const fixedTeams = manualTeams.filter(t => t.members.length > 0);
  const pool = getPool();
  const assigned = new Set(fixedTeams.flatMap(t => t.members.map(m => m.id)));
  const remaining = pool.filter(m => !assigned.has(m.id));
  if (remaining.length === 1) { toast('나머지 1명은 팀을 구성할 수 없습니다. 기존 팀에 추가해주세요.'); return; }
  let randomResults = [];
  if (remaining.length >= 2) {
    try { const teams = generateTeams(remaining); randomResults = assignVenues(teams, db.venues); }
    catch(e) { toast(e.message); return; }
  }
  _manualCount = fixedTeams.length;
  matchResult = [...fixedTeams.map(t => ({ members: t.members, venue: t.venue })), ...randomResults];

  if (randomResults.length === 0) { showResults(); return; }

  aniTeams     = randomResults;
  aniIndex     = 0;
  aniCancelled = false;
  _aniOffset   = _manualCount;

  document.getElementById('teams-revealed').innerHTML = '';
  document.getElementById('slot-area').innerHTML = '';
  document.getElementById('matching-title').textContent = '🎯 나머지 랜덤 매칭 중...';
  showPage('page-matching');
  setTimeout(animateNext, 800);
}
// ============================================================
// 멤버 모달
// ============================================================
function openMemberModal(type) {
  document.getElementById('modal-member-title').textContent =
    type === 'required' ? '고정 멤버 추가' : '유동 멤버 추가';
  document.getElementById('m-id').value   = '';
  document.getElementById('m-type').value = type;
  document.getElementById('m-name').value = '';
  document.getElementById('m-role').value = '일반';
  document.getElementById('m-car').checked = false;
  document.querySelectorAll('input[name="m-gender"]').forEach(r => r.checked = false);
  openModal('modal-member');
}
function openMemberEdit(id, type) {
  const list = type === 'required' ? db.requiredMembers : db.optionalMembers;
  const m = list.find(x => x.id === id);
  if (!m) return;
  document.getElementById('modal-member-title').textContent = '멤버 수정';
  document.getElementById('m-id').value   = id;
  document.getElementById('m-type').value = type;
  document.getElementById('m-name').value = m.name;
  document.getElementById('m-role').value = m.role;
  document.getElementById('m-car').checked = m.hasCar;
  const radio = document.querySelector(`input[name="m-gender"][value="${m.gender}"]`);
  if (radio) radio.checked = true;
  openModal('modal-member');
}
async function saveMember(e) {
  e.preventDefault();
  const id     = document.getElementById('m-id').value;
  const type   = document.getElementById('m-type').value;
  const name   = document.getElementById('m-name').value.trim();
  const gender = document.querySelector('input[name="m-gender"]:checked')?.value;
  const role   = document.getElementById('m-role').value;
  const hasCar = document.getElementById('m-car').checked;
  if (!name || !gender) { toast('이름과 성별을 입력해 주세요.'); return; }
  const list = type === 'required' ? db.requiredMembers : db.optionalMembers;
  let member;
  if (id) {
    member = list.find(x => x.id === id);
    if (member) Object.assign(member, { name, gender, role, hasCar });
  } else {
    member = { id: genId(), name, gender, role, hasCar, attending: false };
    list.push(member);
  }
  try { await _upsertMember(member, type); }
  catch(err) { toast('저장 실패. 다시 시도해주세요.'); return; }
  closeModal('modal-member');
  if (type === 'required') renderRequired(); else renderOptional();
  refreshHome();
  toast(id ? '수정되었습니다.' : '추가되었습니다.');
}
async function deleteMember(id, type) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  const list = type === 'required' ? db.requiredMembers : db.optionalMembers;
  const idx  = list.findIndex(m => m.id === id);
  if (idx === -1) return;
  list.splice(idx, 1);
  try { await _deleteMember(id); }
  catch(err) { toast('삭제 실패. 다시 시도해주세요.'); return; }
  if (type === 'required') renderRequired(); else renderOptional();
  refreshHome();
  toast('삭제되었습니다.');
}
// ============================================================
// 장소 모달
// ============================================================
function openVenueModal() {
  document.getElementById('modal-venue-title').textContent = '장소 추가';
  document.getElementById('v-id').value   = '';
  document.getElementById('v-name').value = '';
  document.getElementById('v-car').checked = false;
  openModal('modal-venue');
}
function openVenueEdit(id) {
  const v = db.venues.find(x => x.id === id);
  if (!v) return;
  document.getElementById('modal-venue-title').textContent = '장소 수정';
  document.getElementById('v-id').value   = id;
  document.getElementById('v-name').value = v.name;
  document.getElementById('v-car').checked = v.requiresCar;
  openModal('modal-venue');
}
async function saveVenue(e) {
  e.preventDefault();
  const id          = document.getElementById('v-id').value;
  const name        = document.getElementById('v-name').value.trim();
  const requiresCar = document.getElementById('v-car').checked;
  if (!name) { toast('장소명을 입력해 주세요.'); return; }
  let venue;
  if (id) {
    venue = db.venues.find(x => x.id === id);
    if (venue) Object.assign(venue, { name, requiresCar });
  } else {
    venue = { id: genId(), name, requiresCar };
    db.venues.push(venue);
  }
  try { await _upsertVenue(venue); }
  catch(err) { toast('저장 실패. 다시 시도해주세요.'); return; }
  closeModal('modal-venue');
  renderVenues();
  refreshHome();
  toast(id ? '수정되었습니다.' : '장소가 추가되었습니다.');
}
async function deleteVenue(id) {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  const idx = db.venues.findIndex(v => v.id === id);
  if (idx === -1) return;
  db.venues.splice(idx, 1);
  try { await _deleteVenue(id); }
  catch(err) { toast('삭제 실패. 다시 시도해주세요.'); return; }
  renderVenues();
  refreshHome();
  toast('삭제되었습니다.');
}
// ============================================================
// 모달 유틸
// ============================================================
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function onOverlayClick(e, id) { if (e.target === e.currentTarget) closeModal(id); }
// ============================================================
// 관리자 비밀번호
// ============================================================
function openAdminLogin() {
  const input = document.getElementById('admin-pw-input');
  input.value = '';
  document.getElementById('admin-pw-error').style.display = 'none';
  input.classList.remove('shake');
  openModal('modal-admin-login');
  setTimeout(() => input.focus(), 120);
}
function submitAdminLogin(e) {
  e.preventDefault();
  const input = document.getElementById('admin-pw-input');
  if (input.value === getAdminPw()) {
    closeModal('modal-admin-login');
    showPage('page-admin');
  } else {
    const errEl = document.getElementById('admin-pw-error');
    errEl.style.display = 'block';
    input.value = '';
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    input.focus();
  }
}
function openChangePw() {
  ['cp-current','cp-new','cp-confirm'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('cp-error').style.display = 'none';
  openModal('modal-change-pw');
  setTimeout(() => document.getElementById('cp-current').focus(), 120);
}
function submitChangePw(e) {
  e.preventDefault();
  const cur  = document.getElementById('cp-current').value;
  const nw   = document.getElementById('cp-new').value;
  const conf = document.getElementById('cp-confirm').value;
  const errEl = document.getElementById('cp-error');
  if (cur !== getAdminPw()) { errEl.textContent = '현재 비밀번호가 틀렸습니다.'; errEl.style.display = 'block'; return; }
  if (nw.length < 1) { errEl.textContent = '새 비밀번호를 입력해주세요.'; errEl.style.display = 'block'; return; }
  if (nw !== conf) { errEl.textContent = '새 비밀번호가 일치하지 않습니다.'; errEl.style.display = 'block'; return; }
  setAdminPw(nw);
  closeModal('modal-change-pw');
  toast('비밀번호가 변경되었습니다.');
}
// ============================================================
// 토스트
// ============================================================
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
// ============================================================
// 초기화
// ============================================================
(async () => {
  await loadDB();
  showPage('page-home');
})();
