/* v4.1.2 — Multiplayer polish + logs */
import { ensureAuth, makeRoomId, createRoom, joinRoom, leaveRoom, listenRoom, pushState } from './firebaseInit.js';

// DOM refs
const boardEl = document.getElementById('board');
const boardOuter = document.getElementById('boardOuter');
const boardWrap = document.querySelector('.boardWrap');
const statusBar = document.getElementById('statusBar');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const resetBtn = document.getElementById('resetBtn');
const flipBtn = document.getElementById('flipBtn');
const exportBtn = document.getElementById('exportBtn');
const moveList = document.getElementById('moveList');
const filesTop = document.getElementById('filesTop');
const filesBottom = document.getElementById('filesBottom');
const ranksEl = document.getElementById('ranks');

// Online controls
const modeSel = document.getElementById('modeSel');
const chooseSideSel = document.getElementById('chooseSide');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const roomInput = document.getElementById('roomInput');
const roomInfo = document.getElementById('roomInfo');
const copyLinkBtn = document.getElementById('copyLink');
const leaveRoomBtn = document.getElementById('leaveRoom');

const PIECES = {'P':'♙','N':'♘','B':'♗','R':'♖','Q':'♕','K':'♔','p':'♟','n':'♞','b':'♝','r':'♜','q':'♛','k':'♚'};
const FILES = 'abcdefgh'.split('');

let startPos = [
  ['r','n','b','q','k','b','n','r'],
  ['p','p','p','p','p','p','p','p'],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['','','','','','','',''],
  ['P','P','P','P','P','P','P','P'],
  ['R','N','B','Q','K','B','N','R'],
];

// Game state
let S = JSON.parse(JSON.stringify(startPos));
let whiteToMove = true;
let selected = null;
let legalTargets = [];
let lastMove = null;
let history = [];
let redoStack = [];
let movesNotation = [];
let castleRights = {K:true, Q:true, k:true, q:true};
let epTarget = null;

// Online state
let mode = 'online'; // 'local' or 'online'
let uid = null;
let roomId = null;
let role = 'spectator'; // 'white'|'black'|'spectator'
let roomUnsub = null;

// Helpers
function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function isWhite(p){ return p && p === p.toUpperCase(); }
function isBlack(p){ return p && p === p.toLowerCase(); }
function sameColor(p1,p2){ if(!p1||!p2) return false; return (isWhite(p1)&&isWhite(p2))||(isBlack(p1)&&isBlack(p2)); }
function idxToSquare(r,c){ return FILES[c] + (8 - r); }

function buildLegends(){
  filesTop.innerHTML = FILES.map(f=>`<div>${f}</div>`).join('');
  filesBottom.innerHTML = FILES.map(f=>`<div>${f}</div>`).join('');
  ranksEl.innerHTML = ''; const tl=document.createElement('div'); tl.textContent='8'; ranksEl.appendChild(tl);
  const br=document.createElement('div'); br.textContent='1'; br.className='br'; ranksEl.appendChild(br);
}

function buildBoard(){
  boardEl.innerHTML='';
  for(let r=0;r<8;r++){
    for(let c=0;c<8;c++){
      const cell = document.createElement('div');
      cell.className = 'cell ' + (((r+c)%2===0)?'light':'dark');
      cell.dataset.r = r; cell.dataset.c = c;
      const p = S[r][c];
      if (p){
        const span = document.createElement('div');
        span.className = 'piece';
        span.textContent = PIECES[p];
        cell.appendChild(span);
      }
      boardEl.appendChild(cell);
    }
  }
  if (lastMove) squareEl(lastMove.to.r,lastMove.to.c)?.classList.add('last');
  updateStatusUI();
  markCheckSquares();
}

function setStatus(text, kind){
  statusBar.textContent = text;
  statusBar.className = 'status ' + (kind||'');
}

function updateStatusUI(){
  const end = endStatus();
  if (end){
    setStatus(end, 'ok');
    boardWrap.classList.remove('turnMe','turnOpp');
    return;
  }
  if (mode==='online'){
    if (role==='spectator'){
      setStatus('👀 Spectateur — partie en cours.', 'wait');
      boardWrap.classList.remove('turnMe','turnOpp');
    } else if ((whiteToMove && role==='white') || (!whiteToMove && role==='black')){
      setStatus('🎯 Votre tour — jouez un coup.', 'me');
      boardWrap.classList.add('turnMe'); boardWrap.classList.remove('turnOpp');
    } else {
      setStatus('⌛ Tour de l’adversaire…', 'wait');
      boardWrap.classList.add('turnOpp'); boardWrap.classList.remove('turnMe');
    }
  } else {
    setStatus('Mode local : 2 joueurs sur le même écran.', 'ok');
    boardWrap.classList.remove('turnMe','turnOpp');
  }
}

function squareEl(r,c){ return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`); }

function clearHints(){
  boardEl.querySelectorAll('.cell').forEach(el=>{
    el.classList.remove('sel','cap','inCheck');
    const dot = el.querySelector('.dot'); if (dot) el.removeChild(dot);
  });
}

function showHints(moves, r, c){
  clearHints();
  const fromEl = squareEl(r,c); if (fromEl) fromEl.classList.add('sel');
  for(const m of moves){
    const el = squareEl(m.r, m.c); if(!el) continue;
    if(m.capture) el.classList.add('cap');
    else { const d = document.createElement('div'); d.className='dot'; el.appendChild(d); }
  }
  markCheckSquares();
}

// --- Move generation ---
function genPseudoMoves(r,c){
  const p = S[r][c]; if(!p) return [];
  const moves = []; const colorWhite = isWhite(p);
  const add=(rr,cc,capOnly=false,quietOnly=false)=>{
    if(!inBounds(rr,cc)) return;
    const t=S[rr][cc];
    if(capOnly && !t) return;
    if(quietOnly && t) return;
    if(t && sameColor(p,t)) return;
    moves.push({r:rr,c:cc,capture:!!t});
  };
  const line=(dr,dc)=>{ let rr=r+dr,cc=c+dc; while(inBounds(rr,cc)){ if(S[rr][cc]){ if(!sameColor(p,S[rr][cc])) moves.push({r:rr,c:cc,capture:true}); break; } else moves.push({r:rr,c:cc,capture:false}); rr+=dr; cc+=dc; } };
  switch(p.toLowerCase()){
    case 'p': {
      const dir = colorWhite ? -1 : 1;
      const startRank = colorWhite ? 6 : 1;
      add(r+dir,c,false,true);
      if (r===startRank && !S[r+dir][c]) add(r+2*dir,c,false,true);
      add(r+dir,c-1,true,false);
      add(r+dir,c+1,true,false);
      if (epTarget && r+dir===epTarget.r && Math.abs(c-epTarget.c)===1) moves.push({r:epTarget.r,c:epTarget.c,capture:true,enPassant:true});
      break;
    }
    case 'n': [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc])=>add(r+dr,c+dc)); break;
    case 'b': line(-1,-1); line(-1,1); line(1,-1); line(1,1); break;
    case 'r': line(-1,0); line(1,0); line(0,-1); line(0,1); break;
    case 'q': line(-1,-1); line(-1,1); line(1,-1); line(1,1); line(-1,0); line(1,0); line(0,-1); line(0,1); break;
    case 'k': {
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ if(dr||dc) add(r+dr,c+dc); }
      if (colorWhite && r===7 && c===4){
        if (castleRights.K && !S[7][5] && !S[7][6]) moves.push({r:7,c:6,castle:'K'});
        if (castleRights.Q && !S[7][1] && !S[7][2] && !S[7][3]) moves.push({r:7,c:2,castle:'Q'});
      }
      if (!colorWhite && r===0 && c===4){
        if (castleRights.k && !S[0][5] && !S[0][6]) moves.push({r:0,c:6,castle:'k'});
        if (castleRights.q && !S[0][1] && !S[0][2] && !S[0][3]) moves.push({r:0,c:2,castle:'q'});
      }
      break;
    }
  }
  return moves;
}

function squaresAttackedBy(white){
  const set = new Set();
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=S[r][c]; if(!p) continue;
    if (white && !isWhite(p)) continue;
    if (!white && !isBlack(p)) continue;
    const mvs = genPseudoMoves(r,c);
    for(const m of mvs){
      const piece = p.toLowerCase();
      if (piece==='p' && !m.capture) continue;
      set.add(`${m.r},${m.c}`);
    }
  }
  return set;
}

function findKing(white){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){ const p=S[r][c]; if(p){ if(white && p==='K') return {r,c}; if(!white && p==='k') return {r,c}; } }
  return null;
}

function isInCheck(white){
  const k=findKing(white); if(!k) return false;
  const enemy = squaresAttackedBy(!white);
  return enemy.has(`${k.r},${k.c}`);
}

function markCheckSquares(){
  const wk=findKing(true), bk=findKing(false);
  if (wk && isInCheck(true)) squareEl(wk.r,wk.c)?.classList.add('inCheck');
  if (bk && isInCheck(false)) squareEl(bk.r,bk.c)?.classList.add('inCheck');
}

function genLegalMoves(r,c){
  const p=S[r][c]; if(!p) return [];
  const colorWhite=isWhite(p);
  const pseudo=genPseudoMoves(r,c);
  const legal=[];
  for(const m of pseudo){
    const backup = snapshot();
    doMove(fromRC(r,c), m, {noUI:true});
    let ok=true;
    if (m.castle){
      const path=[];
      if (m.castle==='K') path.push({r:7,c:4},{r:7,c:5},{r:7,c:6});
      if (m.castle==='Q') path.push({r:7,c:4},{r:7,c:3},{r:7,c:2});
      if (m.castle==='k') path.push({r:0,c:4},{r:0,c:5},{r:0,c:6});
      if (m.castle==='q') path.push({r:0,c:4},{r:0,c:3},{r:0,c:2});
      const enemy = squaresAttackedBy(!colorWhite);
      for(const sq of path){ if (enemy.has(`${sq.r},${sq.c}`)) { ok=false; break; } }
    }
    if (ok && isInCheck(colorWhite)) ok=false;
    restore(backup);
    if (ok) legal.push(m);
  }
  return legal;
}

function fromRC(r,c){ return {r,c}; }

function doMove(from, to, opts={record:true, noUI:false, promoChoice:null}){
  const moving=S[from.r][from.c]; const white=isWhite(moving);
  let captured=S[to.r][to.c]||''; let promo=false; let castle=null; let enPassant=false;
  if (opts.record) redoStack=[];
  let newEp=null;
  const pseudo=genPseudoMoves(from.r,from.c);
  const m=pseudo.find(x=>x.r===to.r&&x.c===to.c);
  if (m && m.castle) castle=m.castle;
  if (m && m.enPassant) enPassant=true;

  if (castle){
    S[to.r][to.c]=moving; S[from.r][from.c]='';
    if (castle==='K'){ S[7][5]='R'; S[7][7]=''; }
    if (castle==='Q'){ S[7][3]='R'; S[7][0]=''; }
    if (castle==='k'){ S[0][5]='r'; S[0][7]=''; }
    if (castle==='q'){ S[0][3]='r'; S[0][0]=''; }
  } else if (enPassant){
    S[to.r][to.c]=moving; S[from.r][from.c]='';
    const dir=white?-1:1; const capR=to.r - dir, capC=to.c;
    captured = S[capR][capC] || captured; S[capR][capC]='';
  } else {
    S[to.r][to.c]=moving; S[from.r][from.c]='';
  }

  if (moving.toLowerCase()==='p' && Math.abs(to.r-from.r)===2){ newEp={r:(from.r+to.r)/2, c:from.c}; }

  if (moving==='P' && to.r===0){ S[to.r][to.c] = opts.promoChoice || 'Q'; promo=true; }
  if (moving==='p' && to.r===7){ S[to.r][to.c] = opts.promoChoice || 'q'; promo=true; }

  if (moving==='K'){ castleRights.K=false; castleRights.Q=false; }
  if (moving==='k'){ castleRights.k=false; castleRights.q=false; }
  if (moving==='R'){ if (from.r===7&&from.c===0) castleRights.Q=false; if (from.r===7&&from.c===7) castleRights.K=false; }
  if (moving==='r'){ if (from.r===0&&from.c===0) castleRights.q=false; if (from.r===0&&from.c===7) castleRights.k=false; }
  if (captured==='R'){ if (to.r===7&&to.c===0) castleRights.Q=false; if (to.r===7&&to.c===7) castleRights.K=false; }
  if (captured==='r'){ if (to.r===0&&to.c===0) castleRights.q=false; if (to.r===0&&to.c===7) castleRights.k=false; }

  lastMove={from,to,piece:S[to.r][to.c],captured,promo,castle,enPassant};
  epTarget=newEp;
  whiteToMove = !whiteToMove;

  if (!opts.noUI){
    if (opts.record){
      history.push(JSON.stringify({
        S: JSON.parse(JSON.stringify(S)),
        whiteToMove, lastMove,
        movesNotation: [...movesNotation],
        castleRights: {...castleRights},
        epTarget: epTarget ? {r:epTarget.r, c:epTarget.c} : null
      }));
      redoStack = [];
    }
    const pieceLetter = moving.toUpperCase()==='P' ? '' : moving.toUpperCase();
    const captureMark = captured ? 'x' : '';
    const note = `${pieceLetter}${captureMark}${idxToSquare(to.r,to.c)}${promo?'='+S[to.r][to.c].toUpperCase():''}${castle?(castle.toLowerCase()==='k'?' O-O':' O-O-O'):''}`.trim();
    movesNotation.push(note);
    buildBoard(); clearHints(); renderMoves();
  }
}

function snapshot(){ return JSON.stringify({S,whiteToMove,lastMove,castleRights,epTarget}); }
function restore(s){ const st=JSON.parse(s); S=JSON.parse(JSON.stringify(st.S)); whiteToMove=st.whiteToMove; lastMove=st.lastMove; castleRights=st.castleRights; epTarget=st.epTarget; }

function renderMoves(){
  moveList.innerHTML='';
  for(let i=0;i<movesNotation.length;i+=2){
    const li=document.createElement('li');
    const w=movesNotation[i]||''; const b=movesNotation[i+1]||'';
    li.textContent = w + (b ? '   ' + b : '');
    moveList.appendChild(li);
  }
  moveList.parentElement.scrollTop = moveList.parentElement.scrollHeight;
}

function endStatus(){
  const moves=allMoves(whiteToMove);
  if (moves.length>0) return "";
  if (isInCheck(whiteToMove)) return whiteToMove ? "Échec et mat — noir gagne" : "Échec et mat — blanc gagne";
  return "Pat — match nul";
}

function allMoves(white){
  const res=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=S[r][c]; if(!p) continue;
    if (white && !isWhite(p)) continue;
    if (!white && !isBlack(p)) continue;
    const mvs=genLegalMoves(r,c);
    for(const m of mvs) res.push({from:{r,c}, to:{r:m.r,c:m.c}});
  }
  return res;
}

// --- Online logic ---
function canMoveOnline(){
  if (mode!=='online') return true;
  if (role==='spectator') return false;
  return (whiteToMove && role==='white') || (!whiteToMove && role==='black');
}

function applyServerState(state){
  if (!state) return;
  S = JSON.parse(JSON.stringify(state.S));
  whiteToMove = state.whiteToMove;
  lastMove = state.lastMove || null;
  movesNotation = state.movesNotation || [];
  castleRights = state.castleRights || {K:true, Q:true, k:true, q:true};
  epTarget = state.epTarget || null;
  selected=null; legalTargets=[];
  document.getElementById('boardOuter').classList.toggle('flipped', role==='black');
  buildBoard(); clearHints(); renderMoves(); updateStatusUI();
}

let syncTimer=null;
function syncToServer(){
  if (mode!=='online' || !roomId) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=>{
    pushState(roomId, { S, whiteToMove, lastMove, movesNotation, castleRights, epTarget });
  }, 30);
}

// --- UI interactions ---
function onCellTap(e){
  if (!canMoveOnline()) { console.log('[MOVE] Ignored: not your turn or spectator'); return; }
  const cell = e.target.closest('.cell'); if(!cell) return;
  const r=+cell.dataset.r, c=+cell.dataset.c;
  const p=S[r][c];

  if (selected){
    const ok = legalTargets.some(m=>m.r===r&&m.c===c);
    if (ok){
      const moving=S[selected.r][selected.c];
      const isPawn = moving && (moving==='P'||moving==='p');
      const willPromote = isPawn && ((moving==='P' && r===0) || (moving==='p' && r===7));
      const promoChoice = (mode==='online' && willPromote) ? (isWhite(moving)?'Q':'q') : null;
      doMove(selected,{r,c},{record:true,noUI:false,promoChoice});
      selected=null; legalTargets=[];
      syncToServer();
      return;
    }
    if (p && ((whiteToMove && isWhite(p)) || (!whiteToMove && isBlack(p)))){
      selected={r,c};
      legalTargets=genLegalMoves(r,c).filter(m=>{
        const piece=S[selected.r][selected.c];
        if (whiteToMove && !isWhite(piece)) return false;
        if (!whiteToMove && !isBlack(piece)) return false;
        return true;
      });
      showHints(legalTargets,r,c);
      return;
    }
    selected=null; legalTargets=[]; clearHints();
  } else {
    if (p && ((whiteToMove && isWhite(p)) || (!whiteToMove && isBlack(p)))){
      selected={r,c};
      legalTargets=genLegalMoves(r,c).filter(m=>{
        const piece=S[selected.r][selected.c];
        if (whiteToMove && !isWhite(piece)) return false;
        if (!whiteToMove && !isBlack(piece)) return false;
        return true;
      });
      showHints(legalTargets,r,c);
    }
  }
}

boardEl.addEventListener('click', onCellTap);

undoBtn.addEventListener('click', ()=>{
  if (mode==='online') return;
  if(history.length<1) return;
  redoStack.push(JSON.stringify({
    S, whiteToMove, lastMove,
    movesNotation:[...movesNotation],
    castleRights:{...castleRights},
    epTarget: epTarget ? {r:epTarget.r,c:epTarget.c} : null
  }));
  const prev=JSON.parse(history.pop());
  S=JSON.parse(JSON.stringify(prev.S));
  whiteToMove=prev.whiteToMove;
  lastMove=prev.lastMove||null;
  movesNotation=prev.movesNotation||[];
  castleRights=prev.castleRights||castleRights;
  epTarget=prev.epTarget||null;
  selected=null; legalTargets=[];
  buildBoard(); clearHints(); renderMoves(); updateStatusUI();
});

redoBtn.addEventListener('click', ()=>{
  if (mode==='online') return;
  if(redoStack.length<1) return;
  history.push(JSON.stringify({
    S, whiteToMove, lastMove,
    movesNotation:[...movesNotation],
    castleRights:{...castleRights},
    epTarget: epTarget ? {r:epTarget.r,c:epTarget.c} : null
  }));
  const st=JSON.parse(redoStack.pop());
  S=JSON.parse(JSON.stringify(st.S));
  whiteToMove=st.whiteToMove;
  lastMove=st.lastMove||null;
  movesNotation=st.movesNotation||[];
  castleRights=st.castleRights||castleRights;
  epTarget=st.epTarget||null;
  selected=null; legalTargets=[];
  buildBoard(); clearHints(); renderMoves(); updateStatusUI();
});

resetBtn.addEventListener('click', ()=>{
  S=JSON.parse(JSON.stringify(startPos));
  whiteToMove=true;
  selected=null; legalTargets=[]; lastMove=null; history=[]; redoStack=[]; movesNotation=[];
  castleRights={K:true,Q:true,k:true,q:true}; epTarget=null;
  buildBoard(); clearHints(); renderMoves(); updateStatusUI();
  syncToServer();
});

flipBtn.addEventListener('click', ()=>{
  document.getElementById('boardOuter').classList.toggle('flipped');
});

exportBtn.addEventListener('click', ()=>{
  let txt='';
  for(let i=0;i<movesNotation.length;i+=2){
    const n=Math.floor(i/2)+1;
    const w=movesNotation[i]||''; const b=movesNotation[i+1]||'';
    txt+=`${n}. ${w} ${b}\n`;
  }
  const blob=new Blob([txt],{type:'text/plain'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='partie.txt'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});

// Local promotion (online = auto-queen)
function askPromotion(white){
  return new Promise(resolve => {
    const mask=document.createElement('div'); mask.className='promoMask';
    const box=document.createElement('div'); box.className='promoBox';
    const title=document.createElement('div'); title.textContent='Promotion du pion';
    const row=document.createElement('div'); row.className='promoRow';
    const opts = white ? ['Q','R','B','N'] : ['q','r','b','n'];
    opts.forEach(sym=>{
      const btn=document.createElement('button'); btn.className='promoBtn'; btn.textContent=PIECES[sym];
      btn.addEventListener('click',()=>{ document.body.removeChild(mask); resolve(sym); });
      row.appendChild(btn);
    });
    box.appendChild(title); box.appendChild(row); mask.appendChild(box); document.body.appendChild(mask);
  });
}

const _doMove = doMove;
doMove = function(from,to,opts={record:true,noUI:false}){
  const moving=S[from.r]?.[from.c];
  const isPawn = moving && (moving==='P' || moving==='p');
  const willPromote = isPawn && ((moving==='P' && to.r===0) || (moving==='p' && to.r===7));
  if (mode==='local' && willPromote && !opts.promoChoice){
    const white = isWhite(moving);
    return askPromotion(white).then(choice => _doMove(from,to,{...opts,promoChoice:choice}));
  } else {
    const res = _doMove(from,to,opts);
    if (mode==='online') syncToServer();
    return res;
  }
};

// Create / Join
createRoomBtn.addEventListener('click', async ()=>{
  setStatus('Création de room…','wait');
  const side = chooseSideSel.value; // auto/white/black
  uid = (await ensureAuth()).uid;
  const id = makeRoomId();
  await createRoom(id, uid, side==='black'?'black':'white');
  roomId = id;
  startListening();
});

joinRoomBtn.addEventListener('click', async ()=>{
  setStatus('Connexion à la room…','wait');
  const id = (roomInput.value || '').trim().toUpperCase();
  if (id.length!==6) { alert('Code 6 lettres'); return; }
  uid = (await ensureAuth()).uid;
  await joinRoom(id, uid, chooseSideSel.value);
  roomId = id;
  startListening();
});

function startListening(){
  copyLinkBtn.disabled = false;
  leaveRoomBtn.disabled = false;
  if (roomUnsub) roomUnsub();
  roomUnsub = listenRoom(roomId, (data)=>{ try {
    if (!data) return;
    const players = data.players || {};
    role = (players.white===uid) ? 'white' : (players.black===uid ? 'black' : 'spectator');
    roomInfo.textContent = `Room ${roomId} — Vous êtes ${role}`;
    // init if empty and I'm white
    if (!data.state && role==='white'){
      S=JSON.parse(JSON.stringify(startPos));
      whiteToMove=true; movesNotation=[]; castleRights={K:true,Q:true,k:true,q:true}; epTarget=null; lastMove=null; history=[]; redoStack=[];
      pushState(roomId, {S,whiteToMove,lastMove,movesNotation,castleRights,epTarget});
    } else if (data.state){
      applyServerState(data.state);
    } else {
      // No state yet and I'm not white: just update UI
      buildBoard(); renderMoves(); updateStatusUI();
    }
  } catch(e){ console.error('[ROOM] onValue handler error', e); }
  });
  setStatus('Connecté — en attente des joueurs…','ok');
}

// Mode switch
modeSel.addEventListener('change', ()=>{
  mode = modeSel.value;
  const online = (mode==='online');
  undoBtn.disabled = online; redoBtn.disabled = online;
  updateStatusUI();
});

copyLinkBtn.addEventListener('click', ()=>{
  if (!roomId) return;
  const url = `${location.origin}${location.pathname}?room=${roomId}`;
  navigator.clipboard.writeText(url);
  roomInfo.textContent = `Lien copié : ${url}`;
});

leaveRoomBtn.addEventListener('click', async ()=>{
  if (!roomId) return;
  await leaveRoom(roomId, uid);
  if (roomUnsub) roomUnsub();
  roomUnsub = null;
  roomId=null; role='spectator';
  setStatus('Hors ligne','');
  updateStatusUI();
});

// Init
function init(){
  buildLegends();
  buildBoard();
  renderMoves();
  updateStatusUI();
  const params = new URLSearchParams(location.search);
  if (params.get('room')) roomInput.value = params.get('room').toUpperCase();
}
init();
