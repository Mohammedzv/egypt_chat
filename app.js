import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, set, get, push, onValue, query, orderByChild, limitToLast, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getDatabase(app);
const $=id=>document.getElementById(id);
let confirmation=null, verifier=null, currentUser=null, activeChatId=null, activeChat=null, stopMessages=null, stopChats=null, chatsCache={};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2600)}
function showAuthMessage(s,error=true){$("authMessage").textContent=s;$("authMessage").style.color=error?"#ffb9c2":"#8de7c5"}
function makeVerifier(){if(verifier) return verifier;verifier=new RecaptchaVerifier(auth,"recaptcha-container",{size:"normal",callback:()=>{}});return verifier}
$("sendCodeBtn").onclick=async()=>{
 const phone=$("phoneInput").value.trim();
 if(!/^\+[1-9]\d{7,14}$/.test(phone)){showAuthMessage("اكتب رقم الهاتف بصيغة دولية، مثال +201012345678");return}
 $("sendCodeBtn").disabled=true;showAuthMessage("جاري إرسال كود التحقق...",false);
 try{confirmation=await signInWithPhoneNumber(auth,phone,makeVerifier());$("otpPanel").classList.remove("hidden");showAuthMessage("تم إرسال الكود. راجع رسائلك.",false)}
 catch(e){showAuthMessage(authError(e));if(verifier){verifier.clear();verifier=null}}
 finally{$("sendCodeBtn").disabled=false}
};
$("verifyCodeBtn").onclick=async()=>{const code=$("otpInput").value.trim();if(!confirmation||!/^\d{6}$/.test(code)){showAuthMessage("اكتب كود التحقق المكوّن من 6 أرقام");return}try{await confirmation.confirm(code);showAuthMessage("تم التحقق بنجاح",false)}catch(e){showAuthMessage(authError(e))}};
function authError(e){const map={"auth/invalid-phone-number":"رقم الهاتف غير صحيح.","auth/too-many-requests":"محاولات كثيرة. حاول لاحقًا.","auth/invalid-verification-code":"كود التحقق غير صحيح.","auth/code-expired":"انتهت صلاحية الكود. اطلب كودًا جديدًا.","auth/operation-not-allowed":"فعّل Phone في Firebase Authentication.","auth/unauthorized-domain":"أضف نطاق الموقع إلى Authorized domains في Firebase."};return map[e.code]||("حصل خطأ: "+e.message)}
onAuthStateChanged(auth,async user=>{
 currentUser=user;
 if(user){$("authView").classList.add("hidden");$("chatView").classList.remove("hidden");await ensureUser(user);renderMe();listenChats()}
 else{$("chatView").classList.add("hidden");$("authView").classList.remove("hidden");}
});
async function ensureUser(user){const r=ref(db,`users/${user.uid}`),s=await get(r);if(!s.exists())await set(r,{uid:user.uid,phone:user.phoneNumber||"",name:"مستخدم جديد",createdAt:serverTimestamp(),lastSeen:serverTimestamp()});
 if(user.phoneNumber){const key=user.phoneNumber.replace(/[^0-9]/g,"");await set(ref(db,`phoneIndex/${key}`),user.uid);}}
async function renderMe(){const s=await get(ref(db,`users/${currentUser.uid}`)),u=s.val()||{};$("myName").textContent=u.name||"مستخدم";$("myPhone").textContent=currentUser.phoneNumber||"";$("myAvatar").textContent=(u.name||"م").slice(0,1)}
$("logoutBtn").onclick=()=>signOut(auth);
$("editProfileBtn").onclick=()=>openModal(`<h3>تعديل الاسم</h3><input id="profileName" maxlength="30" placeholder="اكتب اسمك"><button class="action" id="saveProfile">حفظ الاسم</button>`,async()=>{const name=$("profileName").value.trim();if(!name)return toast("اكتب اسمًا أولًا");await set(ref(db,`users/${currentUser.uid}/name`),name);await renderMe();toast("تم تحديث الاسم")});
function openModal(html,bind){$("modalContent").innerHTML=html;$("modal").classList.remove("hidden");bind?.()}
function closeModal(){$("modal").classList.add("hidden")}
$("closeModal").onclick=closeModal;$("modal").onclick=e=>{if(e.target===$("modal"))closeModal()};
function listenChats(){if(stopChats)stopChats();stopChats=onValue(ref(db,`userChats/${currentUser.uid}`),async snap=>{const entries=snap.val()||{};chatsCache={};const ids=Object.keys(entries);for(const id of ids){const c=await get(ref(db,`chats/${id}`));if(c.exists())chatsCache[id]=c.val()}renderChatList()})}
function renderChatList(){const q=$("searchInput").value.trim().toLowerCase(),items=Object.entries(chatsCache).filter(([id,c])=>(c.title||c.name||"").toLowerCase().includes(q));$("chatCount").textContent=items.length;$("conversationList").innerHTML=items.length?items.map(([id,c])=>`<div class="conversation-item ${id===activeChatId?"selected":""}" data-id="${esc(id)}"><div class="avatar">${esc((c.title||c.name||"؟").slice(0,1))}</div><div class="conversation-meta"><strong>${esc(c.title||c.name||"محادثة")}</strong><small>${esc(c.lastMessage||"ابدأ المحادثة")}</small></div></div>`).join(""):`<div class="empty-side">لسه مفيش محادثات<br>ابدأ محادثة جديدة ✨</div>`;$("conversationList").querySelectorAll("[data-id]").forEach(el=>el.onclick=()=>openChat(el.dataset.id))}
$("searchInput").oninput=renderChatList;
async function openChat(id){activeChatId=id;activeChat=chatsCache[id];$("welcomePanel").classList.add("hidden");$("activeChat").classList.remove("hidden");$("chatView").classList.add("mobile-chat");$("chatTitle").textContent=activeChat.title||activeChat.name||"محادثة";$("chatSubtitle").textContent=activeChat.type==="group"?"مجموعة":"محادثة خاصة";$("chatAvatar").textContent=(activeChat.title||activeChat.name||"؟").slice(0,1);renderChatList();if(stopMessages)stopMessages();stopMessages=onValue(query(ref(db,`messages/${id}`),orderByChild("createdAt"),limitToLast(150)),snap=>{const vals=snap.val()||{};$("messages").innerHTML=Object.entries(vals).map(([mid,m])=>`<div class="message-bubble ${m.sender===currentUser.uid?"mine":"theirs"}">${esc(m.text)}<span class="message-time">${m.createdAt?new Date(m.createdAt).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"}):"الآن"}</span></div>`).join("");$("messages").scrollTop=$("messages").scrollHeight})}
$("messageForm").onsubmit=async e=>{e.preventDefault();const text=$("messageInput").value.trim();if(!text||!activeChatId)return;const msgRef=push(ref(db,`messages/${activeChatId}`));try{await set(msgRef,{text,sender:currentUser.uid,senderName:$("myName").textContent,createdAt:Date.now()});await set(ref(db,`chats/${activeChatId}/lastMessage`),text);$("messageInput").value=""}catch(e){toast("تعذر إرسال الرسالة. راجع صلاحيات قاعدة البيانات.")}};
$("newChatBtn").onclick=()=>openModal(`<h3>محادثة جديدة</h3><label>رقم هاتف الشخص بكود الدولة</label><input id="targetPhone" placeholder="+2010xxxxxxxx" dir="ltr"><button class="action" id="startChat">البحث وبدء المحادثة</button>`,async()=>{$("startChat").onclick=async()=>{const phone=$("targetPhone").value.trim();if(!phone.startsWith("+"))return toast("اكتب الرقم بكود الدولة");const key=phone.replace(/[^0-9]/g,"");const indexSnap=await get(ref(db,`phoneIndex/${key}`));if(!indexSnap.exists())return toast("المستخدم غير موجود. لازم يسجل في الموقع أولًا.");const userSnap=await get(ref(db,`users/${indexSnap.val()}`));const found=userSnap.val();if(!found)return toast("تعذر العثور على بيانات المستخدم.");if(found.uid===currentUser.uid)return toast("ده رقم حسابك");const ids=[currentUser.uid,found.uid].sort(),id="dm_"+ids.join("_");const c=ref(db,`chats/${id}`),exists=await get(c);if(!exists.exists())await set(c,{type:"direct",members:{[ids[0]]:true,[ids[1]]:true},title:found.name||phone,createdAt:Date.now()});await set(ref(db,`userChats/${ids[0]}/${id}`),true);await set(ref(db,`userChats/${ids[1]}/${id}`),true);closeModal();toast("تم إنشاء المحادثة");setTimeout(()=>openChat(id),400)}});
$("newGroupBtn").onclick=()=>openModal(`<h3>إنشاء مجموعة</h3><label>اسم المجموعة</label><input id="groupName" placeholder="مثال: صحاب العمر"><button class="action" id="createGroup">إنشاء المجموعة</button>`,async()=>{$("createGroup").onclick=async()=>{const name=$("groupName").value.trim();if(!name)return toast("اكتب اسم المجموعة");const id=push(ref(db,"chats")).key;await set(ref(db,`chats/${id}`),{type:"group",title:name,members:{[currentUser.uid]:true},createdAt:Date.now()});await set(ref(db,`userChats/${currentUser.uid}/${id}`),true);closeModal();toast("تم إنشاء المجموعة");setTimeout(()=>openChat(id),400)}});
$("chatInfoBtn").onclick=()=>toast(activeChat?.type==="group"?"مجموعة دردشة":"محادثة خاصة");
$("emojiBtn").onclick=()=>{$("messageInput").value+=" 😊";$("messageInput").focus()};
