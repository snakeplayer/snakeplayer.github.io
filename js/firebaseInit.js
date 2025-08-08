// Firebase init + helpers (ES modules via CDN)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, onValue, set, update, get, serverTimestamp, onDisconnect } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from './firebaseConfig.js';

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Anonymous auth
export async function ensureAuth(){
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
      else signInAnonymously(auth).catch(reject);
    });
  });
}

// Room helpers
function randCode(len=6){
  const A='ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion
  let s=''; for(let i=0;i<len;i++) s+=A[Math.floor(Math.random()*A.length)]; return s;
}
export function makeRoomId(){ return randCode(6); }

export async function createRoom(roomId, uid, side){
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) throw new Error('Ce code existe déjà.');
  const players = {};
  if (side==='white') players.white = uid;
  else if (side==='black') players.black = uid;
  // else auto (none yet)
  const state = null; // filled on first start/move
  await set(roomRef, {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'lobby',
    players,
    state,
    spectators: {}
  });
  return true;
}

export async function joinRoom(roomId, uid, wantedSide='auto'){
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) throw new Error('Room introuvable');
  const data = snapshot.val();
  const players = data.players || {};
  // Assign side
  let side = wantedSide;
  if (wantedSide==='auto'){
    if (!players.white) side='white';
    else if (!players.black) side='black';
    else side='spectator';
  }
  if (side==='white' && players.white && players.white!==uid) side='spectator';
  if (side==='black' && players.black && players.black!==uid) side='spectator';
  const updates = { updatedAt: Date.now() };
  if (side==='white' && !players.white) updates['players/white'] = uid;
  if (side==='black' && !players.black) updates['players/black'] = uid;
  if (side==='spectator') updates[`spectators/${uid}`] = true;
  await update(roomRef, updates);
  return side;
}

export function listenRoom(roomId, cb){
  const roomRef = ref(db, `rooms/${roomId}`);
  return onValue(roomRef, (snap)=> cb(snap.val()));
}

export async function leaveRoom(roomId, uid){
  const base = ref(db, `rooms/${roomId}`);
  const snap = await get(base);
  if (!snap.exists()) return;
  const data = snap.val();
  const updates = {};
  if (data.players?.white===uid) updates['players/white'] = null;
  if (data.players?.black===uid) updates['players/black'] = null;
  if (data.spectators && data.spectators[uid]) updates[`spectators/${uid}`] = null;
  updates['updatedAt'] = Date.now();
  await update(base, updates);
}

export function installPresence(roomId, uid){
  const presRef = ref(db, `presence/${roomId}/${uid}`);
  set(presRef, true);
  onDisconnect(presRef).remove();
}

export async function pushState(roomId, state){
  const roomRef = ref(db, `rooms/${roomId}`);
  await update(roomRef, {
    state,
    updatedAt: Date.now(),
    status: 'live'
  });
}
