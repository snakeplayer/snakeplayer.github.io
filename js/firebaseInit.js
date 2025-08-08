// Firebase init (ESM via CDN) + transactions d'attribution des couleurs
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, onValue, set, update, get, onDisconnect, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from './firebaseConfig.js';

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

// Auth anonyme
export async function ensureAuth(){
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
      else signInAnonymously(auth).catch(reject);
    });
  });
}

// Helpers rooms
function randCode(len=6){
  const A='ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s=''; for(let i=0;i<len;i++) s+=A[Math.floor(Math.random()*A.length)]; return s;
}
export function makeRoomId(){ return randCode(6); }

export async function createRoom(roomId, uid, side){
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (snapshot.exists()) throw new Error('Ce code existe déjà.');
  const players = {};
  // Créateur = white d'office (sauf si côté explicitement black demandé)
  if (side==='black') players.black = uid;
  else players.white = uid;
  await set(roomRef, {
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'lobby',
    players,
    state: null
  });
  // presence
  const presRef = ref(db, `presence/${roomId}/${uid}`);
  await set(presRef, true);
  onDisconnect(presRef).remove();
}

export async function joinRoom(roomId, uid, wantedSide='auto'){
  const base = ref(db, `rooms/${roomId}`);
  const snap = await get(base);
  if (!snap.exists()) throw new Error('Room introuvable');

  let assigned='spectator';
  const playersRef = ref(db, `rooms/${roomId}/players`);
  await runTransaction(playersRef, (players) => {
    players = players || {};
    if (wantedSide==='white'){
      if (!players.white) { players.white = uid; assigned='white'; }
      else if (!players.black) { players.black = uid; assigned='black'; }
      else { assigned='spectator'; }
    } else if (wantedSide==='black'){
      if (!players.black) { players.black = uid; assigned='black'; }
      else if (!players.white) { players.white = uid; assigned='white'; }
      else { assigned='spectator'; }
    } else { // auto
      if (!players.white) { players.white = uid; assigned='white'; }
      else if (!players.black) { players.black = uid; assigned='black'; }
      else { assigned='spectator'; }
    }
    return players;
  });
  // presence
  const presRef = ref(db, `presence/${roomId}/${uid}`);
  await set(presRef, true);
  onDisconnect(presRef).remove();

  // touch updatedAt
  await update(base, { updatedAt: Date.now() });

  return assigned;
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
  updates['updatedAt'] = Date.now();
  await update(base, updates);
}

export async function pushState(roomId, state){
  const roomRef = ref(db, `rooms/${roomId}`);
  await update(roomRef, {
    state,
    updatedAt: Date.now(),
    status: 'live'
  });
}
