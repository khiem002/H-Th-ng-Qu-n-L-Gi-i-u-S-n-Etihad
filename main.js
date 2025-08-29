// State & Storage
const STORAGE_KEY = "tournament_state_v1";
const AUTH_KEY = "tournament_auth_v1"; // {username, passHash}
const SESSION_KEY = "tournament_session"; // {username}

/** @typedef {{id:string,name:string, groupId?:string}} Team */
/** @typedef {{homeId:string,awayId:string,homeScore:number|null,awayScore:number|null,played:boolean, customPoints?:{win:number,draw:number,loss:number}}} Match */
/** @typedef {{name:string,type:'round_robin'|'knockout',points:{win:number,draw:number,loss:number},homeAway:'single'|'double', tiebreaker:'fifa'|'simple'}} Config */
/** @typedef {{id:string,name:string}} Group */
/** @typedef {{config:Config,groups?:Group[],activeGroupId?:string,teams:Team[],rounds?:Match[][],roundsByGroup?:Record<string,Match[][]>,bracket?:Match[][], roundOverrides?:{[roundIndex:number]:{win:number,draw:number,loss:number}}, roundOverridesByGroup?:Record<string,Record<number,{win:number,draw:number,loss:number}>>}} Tournament */

/** @type {Tournament} */
let state = loadState() || {
    config: { name: "Giải đấu mới", type: "round_robin", points: { win: 3, draw: 1, loss: 0 }, homeAway: 'single', tiebreaker: 'fifa' },
    groups: [{id:'A', name:'Bảng A'}],
    activeGroupId: 'A',
    teams: [],
    roundsByGroup: {},
    bracket: [],
    roundOverridesByGroup: {}
};

// Elements
const el = {
    appHeader: document.getElementById('app-header'),
    appMain: document.getElementById('app-main'),
    authScreen: document.getElementById('auth-screen'),
    authTitle: document.getElementById('auth-title'),
    authInfo: document.getElementById('auth-info'),
    authUsername: document.getElementById('auth-username'),
    authPassword: document.getElementById('auth-password'),
    btnLogin: document.getElementById('btn-login'),
    btnSwitchSetup: document.getElementById('btn-switch-setup'),
    setupArea: document.getElementById('setup-area'),
    setupUsername: document.getElementById('setup-username'),
    setupPassword: document.getElementById('setup-password'),
    btnSetup: document.getElementById('btn-setup'),

    name: document.getElementById('tournament-name'),
    type: document.getElementById('tournament-type'),
    pointWin: document.getElementById('point-win'),
    pointDraw: document.getElementById('point-draw'),
    pointLoss: document.getElementById('point-loss'),
    homeAway: document.getElementById('home-away'),
    labelHomeAway: document.getElementById('label-homeaway'),
    btnApplyConfig: document.getElementById('btn-apply-config'),
    tiebreaker: document.getElementById('tiebreaker-mode'),

    teamName: document.getElementById('team-name'),
    btnAddTeam: document.getElementById('btn-add-team'),
    btnClearTeams: document.getElementById('btn-clear-teams'),
    teamList: document.getElementById('team-list'),
    bulkTeams: document.getElementById('bulk-teams'),
    btnBulkAdd: document.getElementById('btn-bulk-add'),

    btnGenerate: document.getElementById('btn-generate-schedule'),
    btnClearSchedule: document.getElementById('btn-clear-schedule'),
    fixtures: document.getElementById('fixtures'),

    standings: document.getElementById('standings'),
    stats: document.getElementById('stats'),
    h2h: document.getElementById('h2h'),
    bracket: document.getElementById('bracket'),
    qualifiersPerGroup: document.getElementById('qualifiers-per-group'),
    btnGenBracket: document.getElementById('btn-generate-bracket'),
    btnClearBracket: document.getElementById('btn-clear-bracket'),
    groupSummary: document.getElementById('group-summary'),
    champion: document.getElementById('champion'),

    btnNew: document.getElementById('btn-new'),
    btnSave: document.getElementById('btn-save'),
    btnExport: document.getElementById('btn-export'),
    inputImport: document.getElementById('import-file'),
    btnLogout: document.getElementById('btn-logout')
};
// Group controls
el.groupSelect = document.getElementById('group-select');
el.btnAddGroup = document.getElementById('btn-add-group');
el.btnRenameGroup = document.getElementById('btn-rename-group');
el.btnDelGroup = document.getElementById('btn-del-group');

// Init UI from state
function init() {
    setupAuthGate();
    migrateToGroupsIfNeeded();
    el.name.value = state.config.name || '';
    el.type.value = state.config.type;
    el.pointWin.value = String(state.config.points.win);
    el.pointDraw.value = String(state.config.points.draw);
    el.pointLoss.value = String(state.config.points.loss);
    el.homeAway.value = state.config.homeAway;
    if (el.tiebreaker) el.tiebreaker.value = 'fifa';
    toggleHomeAway();
    renderGroupsUI();
    renderTeams();
    renderFixtures();
    renderStandings();
    renderH2H();
    renderStats();
}

// Storage helpers
function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { console.error(e); return null; }
}

// Utility
function uid() { return Math.random().toString(36).slice(2, 10); }
function findTeam(id) { return state.teams.find(t => t.id === id); }
function currentGroupId(){ return state.activeGroupId || (state.groups?.[0]?.id) || 'A'; }
function teamsInCurrentGroup(){ const gid=currentGroupId(); return state.teams.filter(t=> (t.groupId||'A')===gid); }
function roundsForCurrentGroup(){ const gid=currentGroupId(); if(!state.roundsByGroup[gid]) state.roundsByGroup[gid]=[]; return state.roundsByGroup[gid]; }
function setRoundsForCurrentGroup(rounds){ const gid=currentGroupId(); state.roundsByGroup[gid]=rounds; }
function roundOverridesForCurrentGroup(){ const gid=currentGroupId(); if(!state.roundOverridesByGroup[gid]) state.roundOverridesByGroup[gid]={}; return state.roundOverridesByGroup[gid]; }

// Config
function toggleHomeAway(){
    el.labelHomeAway.classList.toggle('hidden', el.type.value !== 'round_robin');
}
el.type.addEventListener('change', () => {
    toggleHomeAway();
});
el.btnApplyConfig.addEventListener('click', () => {
    state.config.name = el.name.value.trim() || 'Giải đấu mới';
    state.config.type = /** @type any */(el.type.value);
    state.config.points.win = parseInt(el.pointWin.value || '3', 10);
    state.config.points.draw = parseInt(el.pointDraw.value || '1', 10);
    state.config.points.loss = parseInt(el.pointLoss.value || '0', 10);
    state.config.homeAway = /** @type any */(el.homeAway.value);
    state.config.tiebreaker = 'fifa';
    infoToast('Đã áp dụng cấu hình.');
    renderStandings();
    saveState();
});

// Teams
el.btnAddTeam.addEventListener('click', () => {
    const name = el.teamName.value.trim();
    if (!name) return;
    const gid = currentGroupId();
    if (state.teams.some(t => t.name.toLowerCase() === name.toLowerCase() && (t.groupId||'A')===gid)) {
        return alert('Tên đội đã tồn tại.');
    }
    state.teams.push({ id: uid(), name, groupId: gid });
    el.teamName.value = '';
    renderTeams();
    saveState();
});

el.btnClearTeams.addEventListener('click', () => {
    if (!confirm('Xoá tất cả đội?')) return;
    const gid = currentGroupId();
    state.teams = state.teams.filter(t=> (t.groupId||'A')!==gid);
    state.roundsByGroup[gid] = [];
    renderTeams();
    renderFixtures();
    renderStandings();
    renderH2H();
    saveState();
});

el.btnBulkAdd.addEventListener('click', () => {
    const lines = el.bulkTeams.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    let added = 0;
    const gid = currentGroupId();
    for (const name of lines) {
        if (!state.teams.some(t => t.name.toLowerCase() === name.toLowerCase() && (t.groupId||'A')===gid)) {
            state.teams.push({ id: uid(), name, groupId: gid });
            added++;
        }
    }
    if (added === 0) infoToast('Không có đội mới.'); else infoToast(`Đã thêm ${added} đội.`);
    renderTeams();
    saveState();
});

function renderTeams(){
    el.teamList.innerHTML = '';
    const gid = currentGroupId();
    state.teams.filter(t=> (t.groupId||'A')===gid).forEach(team => {
        const li = document.createElement('li');
        const left = document.createElement('div');
        left.textContent = team.name;
        const actions = document.createElement('div');
        actions.className = 'team-actions';
        const btnEdit = document.createElement('button');
        btnEdit.textContent = 'Sửa';
        btnEdit.addEventListener('click', ()=>{
            const newName = prompt('Tên mới:', team.name)?.trim();
            if (!newName) return;
            if (state.teams.some(t => t.id!==team.id && t.name.toLowerCase()===newName.toLowerCase())) {
                return alert('Tên đội đã tồn tại.');
            }
            team.name = newName;
            renderFixtures();
            renderStandings();
            renderTeams();
            saveState();
        });
        const btnDel = document.createElement('button');
        btnDel.textContent = 'Xoá';
        btnDel.className = 'danger';
        btnDel.addEventListener('click', ()=>{
            if (!confirm(`Xoá đội ${team.name}?`)) return;
            state.teams = state.teams.filter(t=>t.id!==team.id);
            // Remove matches containing this team
            state.rounds = state.rounds.map(r=>r.filter(m=>m.homeId!==team.id && m.awayId!==team.id)).filter(r=>r.length>0);
            renderTeams();
            renderFixtures();
            renderStandings();
            saveState();
        });
        actions.append(btnEdit, btnDel);
        li.append(left, actions);
        el.teamList.appendChild(li);
    });
}

// Scheduling
el.btnGenerate.addEventListener('click', () => {
    if (state.config.type === 'round_robin') {
        generateRoundRobin();
    } else {
        generateKnockout();
    }
    renderFixtures();
    renderStandings();
    renderH2H();
    saveState();
});

el.btnClearSchedule.addEventListener('click', () => {
    if (!confirm('Xoá toàn bộ lịch thi đấu?')) return;
    state.rounds = [];
    state.bracket = [];
    renderFixtures();
    renderStandings();
    renderH2H();
    saveState();
});
// Bracket from group stage
el.btnGenBracket?.addEventListener('click', ()=>{
    const q = Math.max(1, parseInt(el.qualifiersPerGroup.value||'2',10));
    const seeds = collectQualifiers(q); // array of teamIds
    if (seeds.length<2) { alert('Chưa đủ đội vượt bảng.'); return; }
    const size = 1 << Math.ceil(Math.log2(seeds.length));
    while (seeds.length < size) seeds.push('__BYE__');
    const rounds = [];
    const r1 = [];
    for (let i=0;i<seeds.length;i+=2){
        const a=seeds[i], b=seeds[i+1];
        if (a==='__BYE__' && b==='__BYE__') continue;
        r1.push({homeId:a,awayId:b,homeScore:null,awayScore:null,played:false});
    }
    rounds.push(r1);
    state.bracket = rounds;
    renderBracket();
    renderGroupSummary(q);
    infoToast('Đã tạo nhánh loại trực tiếp.');
});

el.btnClearBracket?.addEventListener('click', ()=>{
    state.bracket = [];
    renderBracket();
});

function renderGroupSummary(q){
    if (!el.groupSummary) return;
    const lines = [];
    for (const g of state.groups||[{id:'A',name:'Bảng A'}]){
        const rows = standingsForGroup(g.id);
        if (rows.length===0) continue;
        const top = rows.slice(0,q).map(r=>r.team.name).join(', ');
        const max = rows[0].team.name; const min = rows[rows.length-1].team.name;
        lines.push(`${g.name}: Vượt bảng: ${top}. Cao điểm: ${max}. Thấp điểm: ${min}.`);
    }
    el.groupSummary.textContent = lines.join(' \u2013 ');
}

function standingsForGroup(groupId){
    const saveActive = state.activeGroupId; state.activeGroupId = groupId;
    // reuse renderStandings calculation but without DOM
    const gid = groupId;
    const stats = new Map();
    for (const t of state.teams.filter(t=> (t.groupId||'A')===gid)) stats.set(t.id, {team:t, P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,PTS:0});
    const rounds = state.roundsByGroup[gid] || [];
    const roundOverrides = state.roundOverridesByGroup[gid] || {};
    for (let ri=0; ri<rounds.length; ri++) {
        const round = rounds[ri];
        for (const m of round) {
            if (!m.played) continue;
            const a = stats.get(m.homeId); const b = stats.get(m.awayId);
            if (!a || !b) continue;
            a.P++; b.P++;
            a.GF+=m.homeScore; a.GA+=m.awayScore;
            b.GF+=m.awayScore; b.GA+=m.homeScore;
            a.GD=a.GF-a.GA; b.GD=b.GF-b.GA;
            const pts = m.customPoints || roundOverrides?.[ri] || state.config.points;
            if (m.homeScore>m.awayScore){ a.W++; b.L++; a.PTS+=pts.win; b.PTS+=pts.loss; }
            else if (m.homeScore<m.awayScore){ b.W++; a.L++; b.PTS+=pts.win; a.PTS+=pts.loss; }
            else { a.D++; b.D++; a.PTS+=pts.draw; b.PTS+=pts.draw; }
        }
    }
    let rows = Array.from(stats.values());
    rows = stableSort(rows, [ (a,b)=> b.PTS - a.PTS, (a,b)=> b.GD - a.GD, (a,b)=> b.GF - a.GF ]);
    const groups = groupBy(rows, r=>`${r.PTS}|${r.GD}|${r.GF}`);
    const final = [];
    for (const group of groups){
        if (group.length<=1){ final.push(...group); continue; }
        const hh = computeHeadToHeadMiniLeague(group.map(g=>g.team.id));
        const groupSorted = group.slice().sort((a,b)=>{
            const A=hh.get(a.team.id), B=hh.get(b.team.id);
            if (B.PTS!==A.PTS) return B.PTS-A.PTS;
            if (B.GD!==A.GD) return B.GD-A.GD;
            if (B.GF!==A.GF) return B.GF-A.GF;
            return a.team.name.localeCompare(b.team.name);
        });
        final.push(...groupSorted);
    }
    state.activeGroupId = saveActive;
    return final;
}

function collectQualifiers(q){
    const out = [];
    for (const g of state.groups||[{id:'A',name:'Bảng A'}]){
        const rows = standingsForGroup(g.id);
        rows.slice(0,q).forEach(r=> out.push(r.team.id));
    }
    return out;
}

function renderBracket(){
    const container = el.bracket; if (!container) return; container.innerHTML='';
    const rounds = state.bracket || [];
    const wrap = document.createElement('div'); wrap.className='bracket';
    rounds.forEach((round,ri)=>{
        const col = document.createElement('div'); col.className='bracket-round';
        const title = document.createElement('h3'); title.textContent = ri===rounds.length-1? 'Chung kết' : (ri===rounds.length-2? 'Bán kết' : 'Vòng '+(ri+1)); col.appendChild(title);
        round.forEach((m,mi)=>{
            const card = document.createElement('div'); card.className='bracket-match';
            const h4 = document.createElement('h4'); h4.textContent = `Trận ${mi+1}`; card.appendChild(h4);
            const a = document.createElement('div'); a.textContent = teamLabel(m.homeId);
            const b = document.createElement('div'); b.textContent = teamLabel(m.awayId);
            const score = document.createElement('div'); score.className='score';
            const sA = document.createElement('input'); sA.type='number'; sA.min='0'; sA.placeholder='Nhà'; sA.value = m.homeScore==null?'' : String(m.homeScore);
            const sB = document.createElement('input'); sB.type='number'; sB.min='0'; sB.placeholder='Khách'; sB.value = m.awayScore==null?'' : String(m.awayScore);
            sA.addEventListener('input', ()=>{ m.homeScore = sA.value===''?null:parseInt(sA.value,10); m.played = m.homeScore!=null && m.awayScore!=null; if(m.played) advanceBracket(ri,mi); saveState(); });
            sB.addEventListener('input', ()=>{ m.awayScore = sB.value===''?null:parseInt(sB.value,10); m.played = m.homeScore!=null && m.awayScore!=null; if(m.played) advanceBracket(ri,mi); saveState(); });
            score.append(sA,sB);
            card.append(a,b,score);
            col.appendChild(card);
        });
        wrap.appendChild(col);
    });
    container.appendChild(wrap);
    renderChampion();
}

function advanceBracket(ri,mi){
    const rounds = state.bracket; if (!rounds) return;
    const match = rounds[ri][mi];
    if (!match.played) return;
    const winner = getWinnerId(match); if (!winner) return;
    const nextRi = ri+1; const nextMi = Math.floor(mi/2);
    if (!rounds[nextRi]) rounds[nextRi] = [];
    if (!rounds[nextRi][nextMi]) rounds[nextRi][nextMi] = {homeId:winner, awayId:'__TBD__', homeScore:null, awayScore:null, played:false};
    else if (rounds[nextRi][nextMi].awayId==='__TBD__') rounds[nextRi][nextMi].awayId = winner;
    else rounds[nextRi][nextMi].homeId = winner;
    // If we've just completed the final
    if (rounds[nextRi] && rounds[nextRi].length===1 && rounds[nextRi][0].homeId!=='__TBD__' && rounds[nextRi][0].awayId!=='__TBD__'){
        // allow final to be played, but do not create further rounds beyond final
    }
    renderBracket();
}

function renderChampion(){
    if (!el.champion) return;
    const rounds = state.bracket || [];
    if (rounds.length===0){ el.champion.textContent=''; return; }
    const last = rounds[rounds.length-1];
    if (!last || last.length===0) { el.champion.textContent=''; return; }
    const final = last[0];
    if (!final) { el.champion.textContent=''; return; }
    let winnerId = null;
    if (final.played) {
        winnerId = getWinnerId(final);
    } else {
        // If only one đội còn lại (bên kia là __TBD__ hoặc __BYE__) thì công bố vô địch
        if (final.homeId && final.homeId!=='__TBD__' && final.awayId==='__TBD__') winnerId = final.homeId;
        else if (final.awayId && final.awayId!=='__TBD__' && final.homeId==='__TBD__') winnerId = final.awayId;
        else if (final.homeId==='__BYE__' && final.awayId && final.awayId!=='__TBD__') winnerId = final.awayId;
        else if (final.awayId==='__BYE__' && final.homeId && final.homeId!=='__TBD__') winnerId = final.homeId;
    }
    if (!winnerId) { el.champion.textContent=''; return; }
    const name = teamLabel(winnerId);
    el.champion.innerHTML = `<strong>Vô địch:</strong> ${name}`;
}

function generateRoundRobin(){
    const teams = [...teamsInCurrentGroup()];
    if (teams.length < 2) { alert('Cần ít nhất 2 đội.'); return; }
    // If odd, add a bye
    const byeId = '__BYE__';
    if (teams.length % 2 === 1) teams.push({id:byeId,name:'(Bye)'});
    // Circle method
    const n = teams.length;
    const idx = teams.map(t=>t.id);
    const rounds = [];
    const totalRounds = n - 1;
    for (let r = 0; r < totalRounds; r++) {
        const matches = [];
        for (let i = 0; i < n/2; i++) {
            const a = idx[i];
            const b = idx[n - 1 - i];
            if (a!==byeId && b!==byeId) {
                const homeFirst = (r % 2 === 0);
                matches.push({
                    homeId: homeFirst ? a : b,
                    awayId: homeFirst ? b : a,
                    homeScore: null, awayScore: null, played: false
                });
            }
        }
        rounds.push(matches);
        // rotate except first
        idx.splice(1,0,idx.pop());
    }
    if (state.config.homeAway === 'double') {
        const second = rounds.map(round => round.map(m => ({
            homeId: m.awayId, awayId: m.homeId,
            homeScore: null, awayScore: null, played:false
        })));
        setRoundsForCurrentGroup([...rounds, ...second]);
    } else {
        setRoundsForCurrentGroup(rounds);
    }
    state.bracket = [];
}

function generateKnockout(){
    const teams = [...teamsInCurrentGroup()];
    const size = teams.length;
    if (size === 0) { alert('Cần thêm đội.'); return; }
    // Next power of two
    const pow2 = 1 << Math.ceil(Math.log2(Math.max(1,size)));
    const byes = pow2 - size;
    const shuffled = teams.map(t=>t.id);
    // simple seeding: current order
    while (shuffled.length < pow2) shuffled.push('__BYE__');
    const rounds = [];
    let current = [];
    for (let i=0;i<shuffled.length;i+=2){
        const a = shuffled[i], b = shuffled[i+1];
        if (a==='__BYE__' && b==='__BYE__') continue;
        current.push({homeId:a,awayId:b,homeScore:null,awayScore:null,played:false});
    }
    rounds.push(current);
    setRoundsForCurrentGroup(rounds); // re-use fixtures view for R1; later rounds progress
    state.bracket = rounds;
}

// Fixtures rendering and result entry
function renderFixtures(){
    el.fixtures.innerHTML = '';
    const rounds = roundsForCurrentGroup();
    const roundOverrides = roundOverridesForCurrentGroup();
    rounds.forEach((round,ri)=>{
        const wrap = document.createElement('div');
        wrap.className = 'round';
        const h = document.createElement('h3');
        h.textContent = `Vòng ${ri+1}`;
        if (roundOverrides && roundOverrides[ri]){
            const b = document.createElement('span');
            b.className = 'badge-override';
            const o = roundOverrides[ri];
            b.textContent = `Điểm vòng: ${o.win}/${o.draw}/${o.loss}`;
            h.appendChild(b);
        }
        wrap.appendChild(h);
        const ra = document.createElement('div'); ra.className='round-actions';
        const btnClr = document.createElement('button'); btnClr.className='btn-small danger'; btnClr.textContent='Xoá kết quả vòng';
        btnClr.addEventListener('click', ()=>{
            if(!confirm(`Xoá toàn bộ kết quả Vòng ${ri+1}?`)) return;
            round.forEach(m=>{ m.homeScore=null; m.awayScore=null; m.played=false; });
            renderFixtures(); renderStandings(); renderH2H(); saveState();
        });
        const btnPts = document.createElement('button'); btnPts.className='btn-small'; btnPts.textContent='Đặt điểm vòng';
        btnPts.addEventListener('click', ()=>{
            const w = prompt('Điểm Thắng của vòng:', roundOverrides?.[ri]?.win ?? state.config.points.win);
            const d = prompt('Điểm Hoà của vòng:', roundOverrides?.[ri]?.draw ?? state.config.points.draw);
            const l = prompt('Điểm Thua của vòng:', roundOverrides?.[ri]?.loss ?? state.config.points.loss);
            if (w==null||d==null||l==null) return;
            roundOverrides[ri] = { win:parseInt(w,10)||0, draw:parseInt(d,10)||0, loss:parseInt(l,10)||0 };
            renderFixtures(); renderStandings(); renderH2H(); saveState();
        });
        const btnClrPts = document.createElement('button'); btnClrPts.className='btn-small'; btnClrPts.textContent='Xoá điểm vòng';
        btnClrPts.addEventListener('click', ()=>{
            if (roundOverrides) delete roundOverrides[ri];
            renderFixtures(); renderStandings(); renderH2H(); saveState();
        });
        ra.append(btnClr, btnPts, btnClrPts);
        wrap.appendChild(ra);
        round.forEach((m,mi)=>{
            const row = document.createElement('div');
            row.className = 'match';
            const home = document.createElement('span');
            home.textContent = teamLabel(m.homeId);
            const homeBadge = document.createElement('span'); homeBadge.className='goal-badge'; homeBadge.textContent='0'; home.appendChild(homeBadge);
            const vs = document.createElement('span');
            vs.className = 'vs';
            vs.textContent = 'đấu';
            const away = document.createElement('span');
            away.textContent = teamLabel(m.awayId);
            const awayBadge = document.createElement('span'); awayBadge.className='goal-badge'; awayBadge.textContent='0'; away.appendChild(awayBadge);
            const scoreWrap = document.createElement('div');
            const sHome = document.createElement('input'); sHome.type='number'; sHome.min='0'; sHome.placeholder='Nhà';
            const sAway = document.createElement('input'); sAway.type='number'; sAway.min='0'; sAway.placeholder='Khách';
            sHome.value = m.homeScore==null?'' : String(m.homeScore);
            sAway.value = m.awayScore==null?'' : String(m.awayScore);
            sHome.addEventListener('input', ()=> updateScore(ri,mi,sHome.value,sAway.value, homeBadge, awayBadge));
            sAway.addEventListener('input', ()=> updateScore(ri,mi,sHome.value,sAway.value, homeBadge, awayBadge));
            scoreWrap.appendChild(sHome);
            scoreWrap.appendChild(sAway);
            const actions = document.createElement('div'); actions.className='actions';
            const btnUpdate = document.createElement('button'); btnUpdate.className='btn-small'; btnUpdate.textContent='Cập nhật';
            btnUpdate.addEventListener('click', ()=> updateScore(ri,mi,sHome.value,sAway.value));
            const btnEditPts = document.createElement('button'); btnEditPts.className='btn-small'; btnEditPts.textContent='Điểm trận';
            btnEditPts.addEventListener('click', ()=>{
                const cur = m.customPoints || {};
                const w = prompt('Điểm Thắng cho trận này:', cur.win ?? (roundOverrides?.[ri]?.win ?? state.config.points.win));
                const d = prompt('Điểm Hoà cho trận này:', cur.draw ?? (roundOverrides?.[ri]?.draw ?? state.config.points.draw));
                const l = prompt('Điểm Thua cho trận này:', cur.loss ?? (roundOverrides?.[ri]?.loss ?? state.config.points.loss));
                if (w==null||d==null||l==null) return;
                m.customPoints = { win:parseInt(w,10)||0, draw:parseInt(d,10)||0, loss:parseInt(l,10)||0 };
                renderFixtures(); renderStandings(); renderH2H(); saveState();
            });
            const btnClearPts = document.createElement('button'); btnClearPts.className='btn-small'; btnClearPts.textContent='Xoá điểm trận';
            btnClearPts.addEventListener('click', ()=>{ delete m.customPoints; renderFixtures(); renderStandings(); renderH2H(); saveState(); });
            const btnClear = document.createElement('button'); btnClear.className='btn-small danger'; btnClear.textContent='Xoá tỉ số';
            btnClear.addEventListener('click', ()=>{ m.homeScore=null; m.awayScore=null; m.played=false; renderFixtures(); renderStandings(); renderH2H(); saveState(); });
            actions.append(btnUpdate, btnEditPts, btnClearPts, btnClear);
            row.append(home, vs, away, scoreWrap, actions);
            // Set initial badges
            const hs = m.homeScore==null?0:m.homeScore; const as = m.awayScore==null?0:m.awayScore;
            homeBadge.textContent = String(hs);
            awayBadge.textContent = String(as);
            el.fixtures.appendChild(row);
        });
        el.fixtures.appendChild(wrap);
    });
}

function teamLabel(id){
    if (id==='__BYE__') return '(Bye)';
    const t = findTeam(id); return t? t.name : 'Đội?';
}

function updateScore(ri,mi,hs,as, homeBadge, awayBadge){
    const h = hs===''?null:Math.max(0,parseInt(hs,10));
    const a = as===''?null:Math.max(0,parseInt(as,10));
    const m = roundsForCurrentGroup()[ri][mi];
    m.homeScore = Number.isInteger(h)?h:null;
    m.awayScore = Number.isInteger(a)?a:null;
    m.played = m.homeScore!=null && m.awayScore!=null;
    if (homeBadge) homeBadge.textContent = String(m.homeScore||0);
    if (awayBadge) awayBadge.textContent = String(m.awayScore||0);
    if (state.config.type==='knockout' && m.played) {
        progressKnockout(ri,mi);
    }
    renderStandings();
    renderStats();
    renderH2H();
    saveState();
}

function progressKnockout(ri,mi){
    // For simplicity, single-elim straight progression; extend if multiple rounds needed
    // Build next round as needed
    const round = roundsForCurrentGroup()[ri];
    const isLastMatch = (mi % 2 === 1);
    const winnerId = getWinnerId(round[mi]);
    if (winnerId==null) return;
    const nextRoundIndex = ri + 1;
    const allRounds = roundsForCurrentGroup();
    if (!allRounds[nextRoundIndex]) allRounds[nextRoundIndex] = [];
    const targetIndex = Math.floor(mi/2);
    const nextRound = allRounds[nextRoundIndex];
    if (!nextRound[targetIndex]) nextRound[targetIndex] = {homeId:winnerId,awayId:'__TBD__',homeScore:null,awayScore:null,played:false};
    else {
        // fill away if empty
        if (nextRound[targetIndex].awayId==='__TBD__') nextRound[targetIndex].awayId = winnerId;
        else nextRound[targetIndex].homeId = winnerId;
    }
    renderFixtures();
    renderH2H();
}

function getWinnerId(m){
    if (!m.played) return null;
    if (m.homeId==='__BYE__') return m.awayId;
    if (m.awayId==='__BYE__') return m.homeId;
    if (m.homeScore > m.awayScore) return m.homeId;
    if (m.awayScore > m.homeScore) return m.awayId;
    // tie-breaker prompt
    const home = teamLabel(m.homeId), away = teamLabel(m.awayId);
    const pick = prompt(`Hoà. Chọn đội đi tiếp: 1) ${home}  2) ${away}`, '1');
    return pick==='2'?m.awayId:m.homeId;
}

// Standings
function renderStandings(){
    if (state.config.type === 'knockout') {
        el.standings.innerHTML = '<i>Thể thức loại trực tiếp không có bảng xếp hạng. Vui lòng xem sơ đồ.</i>';
        return;
    }
    const gid = currentGroupId();
    const stats = new Map();
    for (const t of state.teams.filter(t=> (t.groupId||'A')===gid)) stats.set(t.id, {team:t, P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,PTS:0});
    const rounds = roundsForCurrentGroup();
    const roundOverrides = roundOverridesForCurrentGroup();
    for (let ri=0; ri<rounds.length; ri++) {
        const round = rounds[ri];
        for (const m of round) {
            if (!m.played) continue;
            const a = stats.get(m.homeId); const b = stats.get(m.awayId);
            if (!a || !b) continue;
            a.P++; b.P++;
            a.GF+=m.homeScore; a.GA+=m.awayScore;
            b.GF+=m.awayScore; b.GA+=m.homeScore;
            a.GD=a.GF-a.GA; b.GD=b.GF-b.GA;
            const pts = m.customPoints || roundOverrides?.[ri] || state.config.points;
            if (m.homeScore>m.awayScore){ a.W++; b.L++; a.PTS+=pts.win; b.PTS+=pts.loss; }
            else if (m.homeScore<m.awayScore){ b.W++; a.L++; b.PTS+=pts.win; a.PTS+=pts.loss; }
            else { a.D++; b.D++; a.PTS+=pts.draw; b.PTS+=pts.draw; }
        }
    }
    let rows = Array.from(stats.values());
    // Chuẩn FIFA: Điểm, Hiệu số, Bàn thắng; nếu vẫn hoà → Đối đầu (Điểm, Hiệu số, Bàn thắng)
    rows = stableSort(rows, [
        (a,b)=> b.PTS - a.PTS,
        (a,b)=> b.GD - a.GD,
        (a,b)=> b.GF - a.GF,
    ]);
    const groups = groupBy(rows, r=>`${r.PTS}|${r.GD}|${r.GF}`);
    const final = [];
    for (const group of groups){
        if (group.length<=1){ final.push(...group); continue; }
        const hh = computeHeadToHeadMiniLeague(group.map(g=>g.team.id));
        const groupSorted = group.slice().sort((a,b)=>{
            const A=hh.get(a.team.id), B=hh.get(b.team.id);
            if (B.PTS!==A.PTS) return B.PTS-A.PTS;
            if (B.GD!==A.GD) return B.GD-A.GD;
            if (B.GF!==A.GF) return B.GF-A.GF;
            return a.team.name.localeCompare(b.team.name);
        });
        final.push(...groupSorted);
    }
    rows = final;
    const table = document.createElement('table');
    table.innerHTML = `
        <thead><tr><th>Hạng</th><th>Đội</th><th>Tr</th><th>T</th><th>H</th><th>B</th><th>BT</th><th>BB</th><th>HS</th><th>Đ</th></tr></thead>
        <tbody></tbody>
    `;
    const tb = table.querySelector('tbody');
    rows.forEach((r,i)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i+1}</td><td style="text-align:left">${r.team.name}</td><td>${r.P}</td><td>${r.W}</td><td>${r.D}</td><td>${r.L}</td><td>${r.GF}</td><td>${r.GA}</td><td>${r.GD}</td><td>${r.PTS}</td>`;
        tb.appendChild(tr);
    });
    el.standings.innerHTML = '';
    el.standings.appendChild(table);
}

function stableSort(arr, comparators){
    return arr
        .map((v,i)=>({v,i}))
        .sort((A,B)=>{
            for (const cmp of comparators){
                const c = cmp(A.v,B.v);
                if (c!==0) return c;
            }
            return A.i - B.i; // stable
        })
        .map(o=>o.v);
}

function groupBy(arr, keyFn){
    const map = new Map();
    for (const it of arr){
        const k = keyFn(it);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(it);
    }
    return Array.from(map.values());
}

function computeHeadToHeadMiniLeague(teamIds){
    const set = new Set(teamIds);
    const table = new Map();
    for (const id of teamIds) table.set(id, {PTS:0,GD:0,GF:0});
    const rounds = roundsForCurrentGroup();
    for (const round of rounds){
        for (const m of round){
            if (!m.played) continue;
            if (!set.has(m.homeId) || !set.has(m.awayId)) continue;
            const A = table.get(m.homeId), B = table.get(m.awayId);
            A.GF+=m.homeScore; B.GF+=m.awayScore;
            A.GD+=m.homeScore - m.awayScore; B.GD+=m.awayScore - m.homeScore;
            const pts = m.customPoints || state.config.points;
            if (m.homeScore>m.awayScore){ A.PTS+=pts.win; B.PTS+=pts.loss; }
            else if (m.homeScore<m.awayScore){ B.PTS+=pts.win; A.PTS+=pts.loss; }
            else { A.PTS+=pts.draw; B.PTS+=pts.draw; }
        }
    }
    return table;
}

// Team scoring stats (GF/GA/GD)
function computeTeamStats(){
    const gid = currentGroupId();
    const stats = new Map();
    for (const t of state.teams.filter(t=> (t.groupId||'A')===gid)) stats.set(t.id, {team:t, GF:0, GA:0, GD:0});
    const rounds = roundsForCurrentGroup();
    for (const round of rounds){
        for (const m of round){
            if (!m.played) continue;
            const a = stats.get(m.homeId); const b = stats.get(m.awayId);
            if (!a || !b) continue;
            a.GF+=m.homeScore; a.GA+=m.awayScore;
            b.GF+=m.awayScore; b.GA+=m.homeScore;
            a.GD=a.GF-a.GA; b.GD=b.GF-b.GA;
        }
    }
    return Array.from(stats.values());
}

function renderStats(){
    if (!el.stats) return;
    const rows = computeTeamStats().sort((x,y)=> y.GF - x.GF);
    const table = document.createElement('table');
    table.innerHTML = `
        <thead><tr><th>#</th><th>Đội</th><th>GF</th><th>GA</th><th>GD</th></tr></thead>
        <tbody></tbody>
    `;
    const tb = table.querySelector('tbody');
    rows.forEach((r,i)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i+1}</td><td style="text-align:left">${r.team.name}</td><td>${r.GF}</td><td>${r.GA}</td><td>${r.GD}</td>`;
        tb.appendChild(tr);
    });
    el.stats.innerHTML = '';
    el.stats.appendChild(table);
}

// Head-to-head matrix
function renderH2H(){
    if (!el.h2h) return;
    const teams = teamsInCurrentGroup();
    if (teams.length===0){ el.h2h.innerHTML=''; return; }
    const map = new Map();
    for (const t of teams) map.set(t.id, new Map());
    const rounds = roundsForCurrentGroup();
    for (const round of rounds){
        for (const m of round){
            if (m.homeId==='__BYE__' || m.awayId==='__BYE__') continue;
            const a = m.homeId, b = m.awayId;
            if (!map.get(a).get(b)) map.get(a).set(b, {played:0,win:0,draw:0,loss:0,gf:0,ga:0});
            if (!map.get(b).get(a)) map.get(b).set(a, {played:0,win:0,draw:0,loss:0,gf:0,ga:0});
            if (m.played){
                const rAB = map.get(a).get(b);
                const rBA = map.get(b).get(a);
                rAB.played++; rBA.played++;
                rAB.gf+=m.homeScore; rAB.ga+=m.awayScore;
                rBA.gf+=m.awayScore; rBA.ga+=m.homeScore;
                if (m.homeScore>m.awayScore){ rAB.win++; rBA.loss++; }
                else if (m.homeScore<m.awayScore){ rBA.win++; rAB.loss++; }
                else { rAB.draw++; rBA.draw++; }
            }
        }
    }
    const wrap = document.createElement('div'); wrap.className='scroll-x';
    const table = document.createElement('table'); table.className='h2h-table';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    const corner = document.createElement('th'); corner.className='sticky'; corner.textContent='Đội ↓ | Đối thủ →'; hr.appendChild(corner);
    teams.forEach(t=>{ const th = document.createElement('th'); th.textContent=t.name; hr.appendChild(th); });
    thead.appendChild(hr);
    const tbody = document.createElement('tbody');
    teams.forEach(a=>{
        const tr = document.createElement('tr');
        const name = document.createElement('td'); name.className='sticky'; name.textContent=a.name; tr.appendChild(name);
        teams.forEach(b=>{
            const td = document.createElement('td');
            if (a.id===b.id){ td.textContent='—'; td.style.color='#556'; tr.appendChild(td); return; }
            const r = map.get(a.id).get(b.id);
            if (!r || r.played===0){ td.textContent=''; tr.appendChild(td); return; }
            td.innerHTML = `<div>${r.win}-${r.draw}-${r.loss}</div><div>${r.gf}:${r.ga}</div>`;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(thead); table.appendChild(tbody); wrap.appendChild(table);
    el.h2h.innerHTML='';
    el.h2h.appendChild(wrap);
}

// Export/Import/Reset
el.btnSave.addEventListener('click', ()=>{ saveState(); infoToast('Đã lưu vào trình duyệt.'); });
el.btnNew.addEventListener('click', ()=>{
    if (!confirm('Tạo mới và xoá dữ liệu hiện tại?')) return;
    state = { config: { name: "Giải đấu mới", type: "round_robin", points: { win: 3, draw: 1, loss: 0 }, homeAway: 'single', tiebreaker:'fifa' }, groups:[{id:'A',name:'Bảng A'}], activeGroupId:'A', teams: [], roundsByGroup:{}, bracket: [], roundOverridesByGroup:{} };
    init(); saveState();
});
el.btnExport.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${state.config.name.replace(/\s+/g,'_')}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});
el.inputImport.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try{ const obj = JSON.parse(text); state = migrateImported(obj); init(); saveState(); infoToast('Đã nhập dữ liệu.'); }
    catch{ alert('Tệp không hợp lệ.'); }
    e.target.value = '';
});

// Auth logic
function setupAuthGate(){
    let auth = loadAuth();
    const session = loadSession();
    if (!auth) {
        // Create default account
        saveAuth({ username: 'Etihad', pass: 'Admin123' });
        auth = loadAuth();
        showAuth(false);
        el.authInfo.textContent = 'Tài khoản mặc định đã được tạo: Etihad / Admin123';
    } else if (session && session.username === auth.username) {
        // already logged in
        showApp();
    } else {
        // need login
        showAuth(false);
        el.authInfo.textContent = 'Vui lòng đăng nhập để tiếp tục.';
    }
}

function showAuth(showSetup){
    el.appHeader.classList.add('hidden');
    el.appMain.classList.add('hidden');
    el.authScreen.classList.remove('hidden');
    el.setupArea.classList.toggle('hidden', !showSetup);
    el.authTitle.textContent = showSetup ? 'Thiết lập tài khoản' : 'Đăng nhập';
    // Hide setup toggle when account exists
    const hasAuth = !!loadAuth();
    el.btnSwitchSetup.classList.toggle('hidden', hasAuth);
}
function showApp(){
    el.authScreen.classList.add('hidden');
    el.appHeader.classList.remove('hidden');
    el.appMain.classList.remove('hidden');
}

function loadAuth(){
    try{ const raw = localStorage.getItem(AUTH_KEY); return raw? JSON.parse(raw):null; }catch{return null}
}
function saveAuth(obj){ localStorage.setItem(AUTH_KEY, JSON.stringify(obj)); }
function loadSession(){
    try{ const raw = sessionStorage.getItem(SESSION_KEY); return raw? JSON.parse(raw):null; }catch{return null}
}
function saveSession(obj){ sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj)); }
function clearSession(){ sessionStorage.removeItem(SESSION_KEY); }
async function hash(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

el.btnSwitchSetup.addEventListener('click', ()=>{
    const auth = loadAuth();
    if (auth) {
        el.setupArea.classList.toggle('hidden');
    } else {
        el.setupArea.classList.remove('hidden');
    }
});

el.btnSetup.addEventListener('click', async ()=>{
    const u = el.setupUsername.value.trim();
    const p = el.setupPassword.value;
    if (u.length<1 || p.length<4) { alert('Tên đăng nhập hoặc mật khẩu không hợp lệ.'); return; }
    const passHash = await hash(p);
    saveAuth({username:u, passHash});
    infoToast('Đã lưu tài khoản. Hãy đăng nhập.');
    el.authUsername.value = u; el.authPassword.value='';
    showAuth(false);
});

el.btnLogin.addEventListener('click', async ()=>{
    const u = el.authUsername.value.trim();
    const p = el.authPassword.value;
    const auth = loadAuth();
    if (!auth) { return alert('Chưa có tài khoản. Vui lòng thiết lập.'); }
    // Support either hashed or plain stored password
    let ok = false;
    if (auth.passHash) {
        const passHash = await hash(p);
        ok = (passHash===auth.passHash);
    } else if (auth.pass) {
        ok = (p===auth.pass);
    }
    if (u===auth.username && ok){
        saveSession({username:u});
        infoToast('Đăng nhập thành công.');
        showApp();
    } else {
        alert('Sai tên đăng nhập hoặc mật khẩu.');
    }
});

el.btnLogout.addEventListener('click', ()=>{
    clearSession();
    infoToast('Đã đăng xuất.');
    setupAuthGate();
});

// Toast
function infoToast(msg){
    const d = document.createElement('div');
    d.textContent = msg; d.style.position='fixed'; d.style.bottom='16px'; d.style.right='16px'; d.style.background='#111827'; d.style.border='1px solid #1f2937'; d.style.padding='8px 12px'; d.style.borderRadius='8px'; d.style.zIndex='9999';
    document.body.appendChild(d);
    setTimeout(()=>{ d.remove(); }, 1800);
}

// Kickoff
init();


// ---- Groups helpers & UI ----
function migrateToGroupsIfNeeded(){
    if (!state.groups){ state.groups = [{id:'A', name:'Bảng A'}]; }
    if (!state.activeGroupId){ state.activeGroupId = 'A'; }
    if (!state.roundsByGroup){
        state.roundsByGroup = {};
        if (state.rounds && state.rounds.length>0) state.roundsByGroup['A'] = state.rounds;
        delete state.rounds;
    }
    if (!state.roundOverridesByGroup){
        state.roundOverridesByGroup = {};
        if (state.roundOverrides) state.roundOverridesByGroup['A'] = state.roundOverrides;
        delete state.roundOverrides;
    }
    // ensure teams have groupId
    state.teams.forEach(t=>{ if (!t.groupId) t.groupId = 'A'; });
}

function migrateImported(s){
    const obj = s;
    if (!obj.config) obj.config = state.config;
    if (!obj.groups) obj.groups = [{id:'A', name:'Bảng A'}];
    if (!obj.activeGroupId) obj.activeGroupId = 'A';
    if (!obj.roundsByGroup){
        obj.roundsByGroup = {};
        if (obj.rounds && obj.rounds.length>0) obj.roundsByGroup['A'] = obj.rounds;
        delete obj.rounds;
    }
    if (!obj.roundOverridesByGroup){
        obj.roundOverridesByGroup = {};
        if (obj.roundOverrides) obj.roundOverridesByGroup['A'] = obj.roundOverrides;
        delete obj.roundOverrides;
    }
    if (!obj.teams) obj.teams = [];
    obj.teams.forEach(t=>{ if (!t.groupId) t.groupId = 'A'; });
    // Enforce FIFA
    obj.config.tiebreaker = 'fifa';
    return obj;
}

function renderGroupsUI(){
    const sel = el.groupSelect; if (!sel) return;
    sel.innerHTML = '';
    state.groups.forEach(g=>{
        const opt = document.createElement('option');
        opt.value = g.id; opt.textContent = g.name; if (g.id===state.activeGroupId) opt.selected = true; sel.appendChild(opt);
    });
}

el.groupSelect?.addEventListener('change', (e)=>{
    state.activeGroupId = e.target.value;
    renderTeams(); renderFixtures(); renderStandings(); renderH2H(); renderStats(); saveState();
});

el.btnAddGroup?.addEventListener('click', ()=>{
    const id = prompt('Mã bảng (VD: A, B, C, ... hoặc G1):',''); if (!id) return;
    const name = prompt('Tên bảng hiển thị:','Bảng '+id) || ('Bảng '+id);
    if (state.groups.some(g=>g.id===id)) return alert('Mã bảng đã tồn tại.');
    state.groups.push({id, name});
    if (!state.roundsByGroup[id]) state.roundsByGroup[id] = [];
    renderGroupsUI(); el.groupSelect.value = id; state.activeGroupId = id;
    renderTeams(); renderFixtures(); renderStandings(); renderH2H(); renderStats(); saveState();
});

el.btnRenameGroup?.addEventListener('click', ()=>{
    const gid = currentGroupId(); const g = state.groups.find(x=>x.id===gid); if (!g) return;
    const name = prompt('Tên bảng mới:', g.name); if (!name) return;
    g.name = name; renderGroupsUI(); saveState();
});

el.btnDelGroup?.addEventListener('click', ()=>{
    const gid = currentGroupId();
    if (!confirm(`Xoá ${gid}? Tất cả đội và lịch trong bảng này sẽ bị xoá.`)) return;
    state.groups = state.groups.filter(g=>g.id!==gid);
    state.teams = state.teams.filter(t=> (t.groupId||'A')!==gid);
    delete state.roundsByGroup[gid];
    delete state.roundOverridesByGroup[gid];
    if (state.groups.length===0){ state.groups=[{id:'A',name:'Bảng A'}]; }
    state.activeGroupId = state.groups[0].id;
    renderGroupsUI(); renderTeams(); renderFixtures(); renderStandings(); renderH2H(); renderStats(); saveState();
});
