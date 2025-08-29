const STORAGE_KEY = "tournament_state_v1";
const SESSION_KEY = "tournament_session";

const el = {
  groupQualifiers: document.getElementById('group-qualifiers'),
  includeBestThirds: document.getElementById('include-best-thirds'),
  numBestThirds: document.getElementById('num-best-thirds'),
  btnGenBracket: document.getElementById('btn-generate-bracket'),
  btnClearBracket: document.getElementById('btn-clear-bracket'),
  groupSummary: document.getElementById('group-summary'),
  bracket: document.getElementById('bracket'),
  champion: document.getElementById('champion'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomReset: document.getElementById('zoom-reset')
};

let state = loadState();
guardAuth();
migrateToGroupsIfNeeded();
saveState();
renderGroupInputs();
renderBracket();
renderGroupSummary(getDefaultQ());
initZoom();

el.btnGenBracket?.addEventListener('click', ()=>{
  const qByGroup = getQByGroup();
  const best3 = el.includeBestThirds?.checked ? Math.max(0, parseInt(el.numBestThirds.value||'0',10)) : 0;
  const seeds = collectQualifiersFlexible(qByGroup, best3);
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
  saveState();
  renderBracket();
  renderGroupSummary(Math.max(...Object.values(qByGroup))||0);
});

el.btnClearBracket?.addEventListener('click', ()=>{
  state.bracket = [];
  saveState();
  renderBracket();
});

function guardAuth(){
  try{
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      alert('Vui lòng đăng nhập ở trang chính.');
      location.href = 'index.html';
    }
  }catch{}
}

function loadState(){
  try{ const raw = localStorage.getItem(STORAGE_KEY); return raw? JSON.parse(raw):{groups:[{id:'A',name:'Bảng A'}], activeGroupId:'A', roundsByGroup:{}, teams:[], bracket:[], roundOverridesByGroup:{}}; }catch{return {groups:[{id:'A',name:'Bảng A'}], activeGroupId:'A', roundsByGroup:{}, teams:[], bracket:[], roundOverridesByGroup:{}}}
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function teamLabel(id){ if (id==='__BYE__' || id==='__TBD__') return id; const t = state.teams.find(x=>x.id===id); return t? t.name : 'Đội?'; }

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

function renderGroupInputs(){
  if (!el.groupQualifiers) return;
  el.groupQualifiers.innerHTML = '';
  (state.groups||[{id:'A',name:'Bảng A'}]).forEach(g=>{
    const w = document.createElement('label');
    w.innerHTML = `${g.name}: <input data-group="${g.id}" type="number" min="0" value="2" style="width:70px"> đội`;
    el.groupQualifiers.appendChild(w);
  });
}

function getQByGroup(){
  const map = {};
  const inputs = el.groupQualifiers.querySelectorAll('input[data-group]');
  inputs.forEach(inp=>{ const gid = inp.getAttribute('data-group'); map[gid]=Math.max(0, parseInt(inp.value||'0',10)); });
  return map;
}

function getDefaultQ(){
  const q = getQByGroup();
  return Math.max(...Object.values(q)) || 2;
}

function standingsForGroup(groupId){
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
      const hh = computeHeadToHeadMiniLeague(group.map(g=>g.team.id), gid);
      const groupSorted = group.slice().sort((a,b)=>{
          const A=hh.get(a.team.id), B=hh.get(b.team.id);
          if (B.PTS!==A.PTS) return B.PTS-A.PTS;
          if (B.GD!==A.GD) return B.GD-A.GD;
          if (B.GF!==A.GF) return B.GF-A.GF;
          return a.team.name.localeCompare(b.team.name);
      });
      final.push(...groupSorted);
  }
  return final;
}

function computeHeadToHeadMiniLeague(teamIds, gid){
    const set = new Set(teamIds);
    const table = new Map();
    for (const id of teamIds) table.set(id, {PTS:0,GD:0,GF:0});
    const rounds = state.roundsByGroup[gid] || [];
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

function stableSort(arr, comparators){
  return arr
      .map((v,i)=>({v,i}))
      .sort((A,B)=>{
          for (const cmp of comparators){
              const c = cmp(A.v,B.v);
              if (c!==0) return c;
          }
          return A.i - B.i;
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

function renderBracket(){
  const container = el.bracket; if (!container) return; container.innerHTML='';
  const rounds = state.bracket || [];
  const wrap = document.createElement('div'); wrap.className='bracket';
  rounds.forEach((round,ri)=>{
      const col = document.createElement('div'); col.className='bracket-round';
      const title = document.createElement('h3'); title.className='round-title'; title.textContent = ri===rounds.length-1? 'Chung kết' : (ri===rounds.length-2? 'Bán kết' : 'Vòng '+(ri+1)); col.appendChild(title);
      round.forEach((m,mi)=>{
          const card = document.createElement('div'); card.className='bracket-match';
          const h4 = document.createElement('h4'); h4.textContent = `Trận ${mi+1}`; card.appendChild(h4);
          const rowA = document.createElement('div'); rowA.className='team-row';
          const rowB = document.createElement('div'); rowB.className='team-row';
          const aName = document.createElement('div'); aName.className='team-name'; aName.textContent = teamLabel(m.homeId);
          const bName = document.createElement('div'); bName.className='team-name'; bName.textContent = teamLabel(m.awayId);
          const aScore = document.createElement('div'); aScore.className='team-score';
          const bScore = document.createElement('div'); bScore.className='team-score';
          const sA = document.createElement('input'); sA.type='number'; sA.min='0'; sA.placeholder='Nhà'; sA.value = m.homeScore==null?'' : String(m.homeScore);
          const sB = document.createElement('input'); sB.type='number'; sB.min='0'; sB.placeholder='Khách'; sB.value = m.awayScore==null?'' : String(m.awayScore);
          sA.addEventListener('input', ()=>{ m.homeScore = sA.value===''?null:parseInt(sA.value,10); m.played = m.homeScore!=null && m.awayScore!=null; if(m.played) advanceBracket(ri,mi); saveState(); highlightWinners(rowA,rowB,m); });
          sB.addEventListener('input', ()=>{ m.awayScore = sB.value===''?null:parseInt(sB.value,10); m.played = m.homeScore!=null && m.awayScore!=null; if(m.played) advanceBracket(ri,mi); saveState(); highlightWinners(rowA,rowB,m); });
          aScore.appendChild(sA); bScore.appendChild(sB);
          rowA.append(aName, aScore); rowB.append(bName, bScore);
          // styling states
          if (m.homeId==='__TBD__' || m.awayId==='__TBD__') { rowA.classList.add('tbd'); rowB.classList.add('tbd'); }
          if (m.homeId==='__BYE__') rowA.classList.add('bye');
          if (m.awayId==='__BYE__') rowB.classList.add('bye');
          highlightWinners(rowA,rowB,m);
          card.append(rowA,rowB);
          col.appendChild(card);
      });
      wrap.appendChild(col);
  });
  container.appendChild(wrap);
  renderChampion();
}

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
  if (!state.teams) state.teams = [];
  state.teams.forEach(t=>{ if (!t.groupId) t.groupId = 'A'; });
  if (state.config && state.config.tiebreaker!=='fifa') state.config.tiebreaker='fifa';
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
  saveState();
  renderBracket();
}

function collectQualifiersFlexible(qByGroup, numBestThirds){
  const out = [];
  const thirdCandidates = [];
  for (const g of state.groups||[{id:'A',name:'Bảng A'}]){
      const rows = standingsForGroup(g.id);
      const q = qByGroup[g.id] ?? 0;
      rows.slice(0,q).forEach(r=> out.push(r.team.id));
      if (numBestThirds>0 && rows.length>=3){
        const third = rows[2];
        if (third) thirdCandidates.push({gid:g.id, row:third});
      }
  }
  if (numBestThirds>0 && thirdCandidates.length>0){
      thirdCandidates.sort((a,b)=>{
          if (b.row.PTS!==a.row.PTS) return b.row.PTS-a.row.PTS;
          if (b.row.GD!==a.row.GD) return b.row.GD-a.row.GD;
          if (b.row.GF!==a.row.GF) return b.row.GF-a.row.GF;
          return a.row.team.name.localeCompare(b.row.team.name);
      });
      thirdCandidates.slice(0,numBestThirds).forEach(t=> out.push(t.row.team.id));
  }
  return out;
}

function getWinnerId(m){
  if (!m.played) return null;
  if (m.homeId==='__BYE__') return m.awayId;
  if (m.awayId==='__BYE__') return m.homeId;
  if (m.homeScore > m.awayScore) return m.homeId;
  if (m.awayScore > m.homeScore) return m.awayId;
  const pick = confirm('Hoà. Chọn OK nếu đội Nhà đi tiếp, Cancel nếu đội Khách.');
  return pick? m.homeId : m.awayId;
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
    if (final.homeId && final.homeId!=='__TBD__' && final.awayId==='__TBD__') winnerId = final.homeId;
    else if (final.awayId && final.awayId!=='__TBD__' && final.homeId==='__TBD__') winnerId = final.awayId;
    else if (final.homeId==='__BYE__' && final.awayId && final.awayId!=='__TBD__') winnerId = final.awayId;
    else if (final.awayId==='__BYE__' && final.homeId && final.homeId!=='__TBD__') winnerId = final.homeId;
  }
  if (!winnerId) { el.champion.textContent=''; return; }
  const name = teamLabel(winnerId);
  el.champion.innerHTML = `<strong>Vô địch:</strong> ${name}`;
}

function highlightWinners(rowA,rowB,m){
  rowA.classList.remove('winner');
  rowB.classList.remove('winner');
  if (m.homeScore==null || m.awayScore==null) return;
  if (m.homeScore>m.awayScore) rowA.classList.add('winner');
  else if (m.awayScore>m.homeScore) rowB.classList.add('winner');
}

function initZoom(){
  let scale = 1;
  const apply = ()=>{
    if (el.bracket) el.bracket.style.transform = `scale(${scale})`;
    if (el.zoomReset) el.zoomReset.textContent = Math.round(scale*100)+"%";
  };
  el.zoomIn?.addEventListener('click', ()=>{ scale = Math.min(2, scale+0.1); apply(); });
  el.zoomOut?.addEventListener('click', ()=>{ scale = Math.max(0.6, scale-0.1); apply(); });
  el.zoomReset?.addEventListener('click', ()=>{ scale = 1; apply(); });
  apply();
}


