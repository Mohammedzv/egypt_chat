import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, runTransaction, remove,
  serverTimestamp, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const $ = id => document.getElementById(id);
let me = null, activeChatId = null, activeChat = null, stopMessages = null, stopChats = null, stopPresence = null, stopConnection = null, stopSearchedPresence = null;
let chatsCache = [], recorder = null, recordChunks = [], recordStartedAt = 0, recordTimer = null;

const show = (el, yes=true) => el.classList.toggle("hidden", !yes);
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2800);
}
function safeText(value="") { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function initials(name="؟") { return [...name.trim()].slice(0,1).join("").toUpperCase() || "؟"; }
function prettyError(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use":"البريد الإلكتروني مستخدم بالفعل.",
    "auth/invalid-email":"البريد الإلكتروني غير صحيح.",
    "auth/weak-password":"كلمة المرور ضعيفة؛ استخدم 6 أحرف على الأقل.",
    "auth/invalid-credential":"البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    "auth/user-not-found":"الحساب غير موجود.",
    "auth/network-request-failed":"تأكد من اتصال الإنترنت.",
    "PERMISSION_DENIED":"Firebase رفض العملية بسبب قواعد قاعدة البيانات. انشر ملف database.rules.json الصحيح.",
    "database/permission-denied":"رفضت Realtime Database العملية. انشر قواعد database.rules.json من تبويب Rules واضغط Publish، وتأكد من databaseURL.",
    "permission_denied":"رفضت Realtime Database العملية. انشر قواعد database.rules.json من تبويب Rules واضغط Publish، وتأكد من databaseURL.",
    "auth/operation-not-allowed":"فعّل Email/Password من Firebase Authentication > Sign-in method.",
    "auth/too-many-requests":"محاولات كثيرة؛ انتظر قليلًا ثم جرّب مرة أخرى."
  };
  return map[code] || error?.message || "حصل خطأ غير متوقع.";
}
function setAuthMessage(message) { $("authMessage").textContent = message; show($("authMessage"), true); }
function hideAuthMessage() { show($("authMessage"), false); }

$("loginTab").onclick = () => { $("loginTab").classList.add("active"); $("signupTab").classList.remove("active"); show($("loginForm")); show($("signupForm"),false); hideAuthMessage(); };
$("signupTab").onclick = () => { $("signupTab").classList.add("active"); $("loginTab").classList.remove("active"); show($("signupForm")); show($("loginForm"),false); hideAuthMessage(); };

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault(); hideAuthMessage();
  try { await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value); }
  catch (err) { setAuthMessage(prettyError(err)); }
});

$("signupForm").addEventListener("submit", async e => {
  e.preventDefault(); hideAuthMessage();
  const name = $("signupName").value.trim();
  const username = $("signupUsername").value.trim().toLowerCase().replace(/^@/,"");
  const email = $("signupEmail").value.trim();
  const password = $("signupPassword").value;
  if (name.length < 2) return setAuthMessage("اكتب اسم عرض صحيح.");
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return setAuthMessage("اليوزر لازم يكون 3-20 حرفًا إنجليزيًا أو رقمًا أو _");
  const submitButton = $("signupForm").querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "جاري إنشاء الحساب...";
  let credential = null;
  let usernameReserved = false;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    const reservation = await runTransaction(ref(db, `usernameIndex/${username}`), current => current === null ? uid : undefined);
    if (!reservation.committed) {
      await deleteNewAccount(credential.user);
      credential = null;
      return setAuthMessage("اليوزر ده محجوز بالفعل. اختار يوزر تاني.");
    }
    usernameReserved = true;
    await updateProfile(credential.user, { displayName: name });
    await set(ref(db, `users/${uid}`), { name, username, createdAt: Date.now() });
    await activateUser(credential.user);
    toast("أهلاً بيك في EGYPT CHAT 🎉");
  } catch (err) {
    if (usernameReserved && credential?.user) {
      try { await remove(ref(db, `usernameIndex/${username}`)); } catch {}
    }
    if (credential?.user) {
      try { await deleteNewAccount(credential.user); } catch {}
    }
    setAuthMessage(prettyError(err));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
});
async function deleteNewAccount(user) {
  const { deleteUser } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
  await deleteUser(user);
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    me = null; cleanupListeners(); show($("authScreen")); show($("appScreen"),false); return;
  }
  me = user;
  await activateUser(user);
});

async function activateUser(user) {
  try {
    const snap = await get(ref(db, `users/${user.uid}`));
    if (!snap.exists()) {
      // During sign-up, the Auth event can arrive a moment before the profile write.
      return;
    }
    const profile = snap.val();
    $("myName").textContent = profile.name || user.displayName || "مستخدم";
    $("myUsername").textContent = "@" + (profile.username || "");
    $("myAvatar").textContent = initials(profile.name || user.displayName);
    show($("authScreen"),false); show($("appScreen"));
    startPresence();
    loadChats();
  } catch (err) { toast(prettyError(err)); }
}

async function startPresence() {
  if (!me) return;
  const connectedRef = ref(db, ".info/connected");
  if (stopConnection) stopConnection();
  stopConnection = onValue(connectedRef, async snap => {
    if (snap.val() !== true || !me) return;
    const statusRef = ref(db, `status/${me.uid}`);
    try {
      await onDisconnect(statusRef).set({ state: "offline", lastChanged: serverTimestamp() });
      await set(statusRef, { state: "online", lastChanged: serverTimestamp() });
    } catch (err) { console.warn("Presence update failed:", err); }
  });
}
function watchChatPresence(chat) {
  if (stopPresence) stopPresence();
  stopPresence = null;
  if (!chat || chat.type === "group") {
    $("chatSubtitle").textContent = "مجموعة";
    $("chatSubtitle").classList.remove("online");
    return;
  }
  const otherUid = Object.keys(chat.members || {}).find(uid => uid !== me.uid);
  if (!otherUid) return;
  stopPresence = onValue(ref(db, `status/${otherUid}`), snap => {
    const status = snap.val();
    const online = status?.state === "online";
    $("chatSubtitle").textContent = online ? "متصل الآن" : "غير متصل";
    $("chatSubtitle").classList.toggle("online", online);
  }, () => { $("chatSubtitle").textContent = "حالة الاتصال غير متاحة"; });
}

function cleanupListeners() {
  if (stopMessages) stopMessages();
  if (stopChats) stopChats();
  if (stopPresence) stopPresence();
  if (stopConnection) stopConnection();
  if (stopSearchedPresence) stopSearchedPresence();
  stopMessages = stopChats = stopPresence = stopConnection = stopSearchedPresence = null;
  if (recordTimer) clearTimeout(recordTimer);
  recorder = null; recordChunks = [];
  activeChatId = activeChat = null;
}
function switchView(view) {
  show($("welcomeView"), view === "home");
  show($("peopleView"), view === "people");
  show($("groupsView"), view === "groups");
  show($("chatView"), view === "chat");
  document.querySelectorAll(".side-action").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("listTitle").textContent = view === "people" ? "البحث عن أشخاص" : view === "groups" ? "مجموعاتك" : "رسائلك الأخيرة";
  if (window.innerWidth <= 900) $("sidebar").classList.remove("open");
}
function loadChats() {
  if (stopChats) stopChats();
  stopChats = onValue(ref(db, `userChats/${me.uid}`), async snap => {
    const ids = Object.keys(snap.val() || {});
    const items = await Promise.all(ids.map(async id => {
      const chatSnap = await get(ref(db, `chats/${id}`));
      return chatSnap.exists() ? { id, ...chatSnap.val() } : null;
    }));
    chatsCache = items.filter(Boolean).sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
    renderChats();
  }, err => toast(prettyError(err)));
}
function chatName(chat) {
  if (chat.type === "group") return chat.title || "مجموعة";
  const otherUid = Object.keys(chat.members || {}).find(uid => uid !== me.uid);
  return chat.memberNames?.[otherUid] || "محادثة";
}
function renderChats() {
  const q = $("globalSearch").value.trim().toLowerCase();
  const filtered = chatsCache.filter(c => chatName(c).toLowerCase().includes(q));
  $("conversationList").innerHTML = filtered.length ? filtered.map(c => `
    <div class="conversation-item ${c.id===activeChatId?"selected":""}" data-chat="${safeText(c.id)}">
      <div class="avatar">${safeText(initials(chatName(c)))}</div>
      <div class="conversation-copy"><strong>${safeText(chatName(c))}</strong><small>${safeText(c.lastMessage || (c.type==="group"?"مجموعة جديدة":"ابدأ المحادثة"))}</small></div>
      <span class="conversation-time">${c.type==="group"?"مجموعة":" "}</span>
    </div>`).join("") : '<div class="empty-mini">مفيش محادثات لسه</div>';
  document.querySelectorAll("[data-chat]").forEach(el => el.onclick = () => openChat(el.dataset.chat));
  $("groupsResults").innerHTML = chatsCache.filter(c=>c.type==="group").map(c=>`
    <div class="person-card"><div class="avatar">${safeText(initials(c.title||"م"))}</div><div class="person-info"><strong>${safeText(c.title||"مجموعة")}</strong><small>مجموعة على EGYPT CHAT</small></div><button class="primary" data-group="${safeText(c.id)}">فتح المجموعة</button></div>`).join("") || '<div class="empty-state">لسه مفيش مجموعات. أنشئ أول مجموعة ليك.</div>';
  document.querySelectorAll("[data-group]").forEach(b=>b.onclick=()=>openChat(b.dataset.group));
}
function makeDirectId(uidA, uidB) { return "dm_" + [uidA,uidB].sort().map(encodeURIComponent).join("_"); }
async function startDirectChat(person) {
  if (person.uid === me.uid) return toast("ده حسابك أنت 😊");
  const id = makeDirectId(me.uid, person.uid);
  const chatRef = ref(db, `chats/${id}`);

  try {
    // الخطوة 1: تأكد أن سجل المحادثة موجود وصحيح.
    const existing = await get(chatRef);
    if (!existing.exists()) {
      const now = Date.now();
      const payload = {
        type: "direct",
        members: { [me.uid]: true, [person.uid]: true },
        memberNames: {
          [me.uid]: $("myName").textContent,
          [person.uid]: person.name
        },
        createdAt: now,
        updatedAt: now,
        lastMessage: "ابدأ المحادثة"
      };
      try {
        await set(chatRef, payload);
      } catch (err) {
        console.error("EGYPT CHAT: failed creating chats record", err);
        throw new Error("رفض Firebase إنشاء سجل المحادثة (chats). راجع صلاحية chats/$chatId.");
      }
    } else {
      const currentChat = existing.val();
      if (currentChat.members?.[me.uid] !== true ||
          currentChat.members?.[person.uid] !== true) {
        console.error("EGYPT CHAT: existing chat has incomplete members", currentChat);
        throw new Error("يوجد سجل محادثة قديم ناقص العضوية. لم أغيّر بياناته حفاظًا على الخصوصية.");
      }
    }

    // الخطوة 2: أضف المحادثة لقائمة الحساب الحالي.
    try {
      await set(ref(db, `userChats/${me.uid}/${id}`), true);
    } catch (err) {
      console.error("EGYPT CHAT: failed adding current user's chat index", err);
      throw new Error("تم إنشاء المحادثة، لكن Firebase رفض إضافتها لقائمة حسابك (userChats/حسابك).");
    }

    // الخطوة 3: أضف المحادثة لقائمة الطرف الآخر.
    try {
      await set(ref(db, `userChats/${person.uid}/${id}`), true);
    } catch (err) {
      console.error("EGYPT CHAT: failed adding recipient's chat index", err);
      throw new Error("المحادثة اتعملت، لكن Firebase رفض إضافتها لقائمة الطرف الآخر. راجع قاعدة userChats.");
    }

    await openChat(id);
  } catch (err) {
    console.error("EGYPT CHAT: startDirectChat failed", err);
    toast(err.message || prettyError(err));
  }
}
async function openChat(id) {
  try {
    const snap = await get(ref(db, `chats/${id}`));
    if (!snap.exists()) return toast("المحادثة غير موجودة.");
    const chat = snap.val();
    if (!chat.members?.[me.uid]) return toast("مش مسموح لك تدخل المحادثة.");
    activeChatId = id; activeChat = chat;
    $("chatTitle").textContent = chatName(chat);
    $("chatSubtitle").textContent = chat.type === "group" ? "مجموعة" : "جارٍ معرفة الحالة...";
    watchChatPresence(chat);
    $("chatAvatar").textContent = initials(chatName(chat));
    switchView("chat"); renderChats();
    if (stopMessages) stopMessages();
    stopMessages = onValue(ref(db, `messages/${id}`), msgSnap => renderMessages(msgSnap.val() || {}), err => {
      toast("مش قادرين نحمّل الرسائل: " + prettyError(err));
      $("messagesArea").innerHTML = `<div class="empty-state">تعذر تحميل الرسائل. راجع صلاحيات قاعدة البيانات.</div>`;
    });
  } catch (err) { toast(prettyError(err)); }
}
function renderMessages(messages) {
  const list = Object.entries(messages).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));
  $("messagesArea").innerHTML = list.length ? list.map(([id,m]) => {
    const time = new Date(m.createdAt||Date.now()).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"});
    let body = "";
    if (m.audioData && /^audio\/(webm|ogg|mp4|mpeg|wav)$/.test(m.mimeType || "")) {
      body = `<div class="voice-message"><span class="voice-icon">🎙️</span><audio controls preload="metadata" src="data:${m.mimeType};base64,${m.audioData}"></audio><small>${Math.max(1,Number(m.duration)||1)} ثانية</small></div>`;
    } else body = `<p>${safeText(m.text||"")}</p>`;
    return `<article class="message ${m.sender===me.uid?"mine":""}" data-id="${safeText(id)}">${body}<time>${m.sender===me.uid?"أنت":" "} · ${time}</time></article>`;
  }).join("") : '<div class="empty-state">ابدأ أول رسالة 👋</div>';
  $("messagesArea").scrollTop = $("messagesArea").scrollHeight;
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("تعذر قراءة التسجيل."));
    reader.readAsDataURL(blob);
  });
}
async function toggleVoiceRecording() {
  if (recorder && recorder.state === "recording") { recorder.stop(); return; }
  if (!activeChatId || !activeChat?.members?.[me.uid]) return toast("افتح محادثة الأول.");
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("المتصفح لا يدعم تسجيل الصوت. افتح الموقع عبر HTTPS وحدّث المتصفح.");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const preferred = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];
    const mimeType = preferred.find(t => MediaRecorder.isTypeSupported(t)) || "";
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recordChunks = []; recordStartedAt = Date.now();
    recorder.ondataavailable = event => { if (event.data?.size) recordChunks.push(event.data); };
    recorder.onerror = () => toast("حصل خطأ أثناء التسجيل.");
    recorder.onstop = async () => {
      if (recordTimer) clearTimeout(recordTimer);
      const duration = Math.max(1, Math.round((Date.now()-recordStartedAt)/1000));
      stream.getTracks().forEach(track => track.stop());
      $("voiceRecordBtn").classList.remove("recording"); $("voiceRecordBtn").textContent = "🎙";
      const blob = new Blob(recordChunks, { type: recorder?.mimeType || mimeType || "audio/webm" }); recordChunks=[];
      if (!blob.size) return toast("التسجيل فارغ.");
      if (blob.size > 850000) return toast("التسجيل كبير جدًا. سجّل مقطعًا أقصر.");
      try {
        const audioData = await blobToBase64(blob); const msgRef = push(ref(db, `messages/${activeChatId}`)); const now=Date.now();
        await set(msgRef, { sender:me.uid, audioData, mimeType:blob.type.split(";")[0] || "audio/webm", duration:Math.min(duration,60), createdAt:now });
        await update(ref(db, `chats/${activeChatId}`), { lastMessage:"🎙️ رسالة صوتية", updatedAt:now });
        toast("تم إرسال التسجيل الصوتي.");
      } catch(err) { toast("لم يتم إرسال التسجيل: "+prettyError(err)); }
    };
    recorder.start(); $("voiceRecordBtn").classList.add("recording"); $("voiceRecordBtn").textContent="■";
    toast("جاري التسجيل... اضغط ■ للإرسال (حد أقصى 60 ثانية).");
    recordTimer=setTimeout(()=>{ if(recorder?.state==="recording") recorder.stop(); },60000);
  } catch(err) { toast(err.name==="NotAllowedError" ? "اسمح للموقع باستخدام الميكروفون من إعدادات المتصفح." : "تعذر تشغيل الميكروفون."); }
}
$("voiceRecordBtn").addEventListener("click", toggleVoiceRecording);

$("messageForm").addEventListener("submit", async e => {
  e.preventDefault();
  const text = $("messageInput").value.trim();
  if (!text || !activeChatId || !activeChat?.members?.[me.uid]) return;
  $("messageInput").value = "";
  try {
    const msgRef = push(ref(db, `messages/${activeChatId}`));
    const now = Date.now();
    await set(msgRef, { sender:me.uid, text, createdAt:now });
    await update(ref(db, `chats/${activeChatId}`), { lastMessage:text.slice(0,90), updatedAt:now });
  } catch (err) {
    toast("لم يتم إرسال الرسالة: " + prettyError(err));
    $("messageInput").value = text;
  }
});

async function searchPeople() {
  const username = $("peopleSearchInput").value.trim().toLowerCase().replace(/^@/,"");
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return toast("اكتب يوزر صحيح من 3 إلى 20 حرفًا.");
  $("peopleResults").innerHTML = '<div class="empty-state">جاري البحث...</div>';
  try {
    const index = await get(ref(db, `usernameIndex/${username}`));
    if (!index.exists()) { $("peopleResults").innerHTML = '<div class="empty-state">ملقيناش حد باليوزر ده.</div>'; return; }
    const uid = index.val();
    const userSnap = await get(ref(db, `users/${uid}`));
    if (!userSnap.exists()) { $("peopleResults").innerHTML = '<div class="empty-state">الحساب غير متاح حاليًا.</div>'; return; }
    const person = { uid, ...userSnap.val() };
    if (stopSearchedPresence) stopSearchedPresence();
    $("peopleResults").innerHTML = `<div class="person-card"><div class="avatar">${safeText(initials(person.name))}</div><div class="person-info"><strong>${safeText(person.name)}</strong><small>@${safeText(person.username)}</small><small id="searchedPersonStatus">جارٍ معرفة الحالة...</small></div><button id="startChatBtn" class="primary">إرسال رسالة</button></div>`;
    stopSearchedPresence = onValue(ref(db, `status/${uid}`), statusSnap => {
      const online = statusSnap.val()?.state === "online";
      const statusEl = $("searchedPersonStatus");
      if (statusEl) { statusEl.textContent = online ? "● متصل الآن" : "○ غير متصل"; statusEl.classList.toggle("online", online); }
    });
    $("startChatBtn").onclick = async () => { try { await startDirectChat(person); } catch(err) { toast(prettyError(err)); } };
  } catch (err) { $("peopleResults").innerHTML = `<div class="empty-state">${safeText(prettyError(err))}</div>`; }
}
$("peopleSearchBtn").onclick = searchPeople;
$("peopleSearchInput").addEventListener("keydown", e => { if(e.key==="Enter") searchPeople(); });
$("welcomeSearch").onclick = () => switchView("people");
$("globalSearch").addEventListener("input", renderChats);
document.querySelectorAll(".side-action").forEach(b => b.onclick = () => switchView(b.dataset.view));
$("newGroupBtn").onclick = $("groupsCreateBtn").onclick = createGroup;
async function createGroup() {
  const title = prompt("اكتب اسم المجموعة:");
  if (!title?.trim()) return;
  try {
    const newRef = push(ref(db,"chats"));
    const id = newRef.key, now = Date.now();
    const payload = { type:"group", title:title.trim().slice(0,40), owner:me.uid, members:{[me.uid]:true}, memberNames:{[me.uid]:$("myName").textContent}, createdAt:now, updatedAt:now, lastMessage:"تم إنشاء المجموعة" };
    // أنشئ سجل المجموعة أولاً ثم أضفه لقائمة المستخدم.
    await set(newRef, payload);
    await set(ref(db, `userChats/${me.uid}/${id}`), true);
    await openChat(id);
  } catch(err) { toast(prettyError(err)); }
}
$("profileBtn").onclick = () => {
  $("modalContent").innerHTML = `<h2>الملف الشخصي</h2><label>اسم العرض</label><input id="editName" maxlength="30" value="${safeText($("myName").textContent)}"><label>اسم المستخدم</label><input disabled value="${safeText($("myUsername").textContent)}"><small>اليوزر ثابت في النسخة دي لتجنب تغيير روابط المحادثات.</small><button id="saveProfile" class="primary wide">حفظ التعديلات</button>`;
  show($("modalLayer"));
  $("saveProfile").onclick = async () => {
    const name = $("editName").value.trim();
    if(name.length<2) return toast("اكتب اسم صحيح.");
    try {
      await update(ref(db,`users/${me.uid}`),{name});
      await updateProfile(me,{displayName:name});
      $("myName").textContent=name; $("myAvatar").textContent=initials(name);
      show($("modalLayer"),false); toast("تم تحديث بياناتك.");
    } catch(err) { toast(prettyError(err)); }
  };
};
$("modalClose").onclick = () => show($("modalLayer"),false);
$("modalLayer").onclick = e => { if(e.target === $("modalLayer")) show($("modalLayer"),false); };
$("logoutBtn").onclick = () => signOut(auth);
$("mobileMenu").onclick = () => $("sidebar").classList.add("open");
$("mobileClose").onclick = () => $("sidebar").classList.remove("open");
$("mobileSearch").onclick = () => { $("sidebar").classList.add("open"); $("globalSearch").focus(); };
$("chatBack").onclick = () => switchView("home");
$("emojiBtn").onclick = () => { $("messageInput").value += " 😊"; $("messageInput").focus(); };
