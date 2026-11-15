import {initializeApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,createUserWithEmailAndPassword,signInWithEmailAndPassword,onAuthStateChanged,signOut,updateProfile} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getDatabase,ref,set,get,push,onValue,query,orderByChild,limitToLast,runTransaction} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";
import {firebaseConfig} from "./firebase-config.js";
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getDatabase(app);
const $=id=>document.getElementById(id);
let mode="login",me=null,chatMap={},activeId=null,activeChat=null,stopChats=null,stopMsgs=null;
const clean=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const keyOf=s=>s.trim().toLowerCase();
const usernameOK=s=>/^[a-zA-Z0-9_.]{3,20}$/.test(s);
function toast(s){$("toast").textContent=s;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2500)}
function authMsg(s,bad=true){$("authMsg").textContent=s;$("authMsg").style.color=bad?"#ffb9c2":"#8de7c5"}
function setMode(v){mode=v;$("loginTab").classList.toggle("active",v==="login");$("registerTab").classList.toggle("active",v==="register");$("nameWrap").classList.toggle("hidden",v!=="register");$("usernameWrap").classList.toggle("hidden",v!=="register");$("authBtn").textContent=v==="login"?"تسجيل الدخول":"إنشاء حساب";authMsg("")}
$("loginTab").onclick=()=>setMode("login");$("registerTab").onclick=()=>setMode("register");
function friendly(e){const m={"auth/email-already-in-use":"البريد مستخدم بالفعل.","auth/invalid-email":"البريد الإلكتروني غير صحيح.","auth/weak-password":"كلمة المرور يجب أن تكون 6 أحرف على الأقل.","auth/user-not-found":"لا يوجد حساب بهذا البريد.","auth/wrong-password":"كلمة المرور غير صحيحة.","auth/invalid-credential":"البريد أو كلمة المرور غير صحيحة.","auth/operation-not-allowed":"فعّل Email/Password من Firebase Authentication.","auth/unauthorized-domain":"أضف دومين الموقع إلى Authorized domains.","auth/too-many-requests":"محاولات كثيرة، حاول لاحقًا."};return (m[e.code]||"حدث خطأ أثناء تسجيل الدخول.")+"\n"+e.code}
async function claimUsername(username,uid){
 const k=keyOf(username),r=ref(db,"usernameIndex/"+k);
 const result=await runTransaction(r,current=>current===null?uid:undefined);
 return result.committed;
}
$("authBtn").onclick=async()=>{
 const email=$("emailInput").value.trim().toLowerCase(),pass=$("passwordInput").value;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return authMsg("اكتب بريدًا إلكترونيًا صحيحًا");
 if(pass.length<6)return authMsg("كلمة المرور لازم تكون 6 أحرف على الأقل");
 $("authBtn").disabled=true;authMsg("جاري تنفيذ الطلب...",false);
 try{
  if(mode==="register"){
   const name=$("nameInput").value.trim(),username=$("usernameInput").value.trim();
   if(!name)throw new Error("اكتب اسم العرض.");
   if(!usernameOK(username))throw new Error("اسم المستخدم لازم يكون 3-20 حرفًا إنجليزيًا أو رقمًا أو _ أو .");
   const cred=await createUserWithEmailAndPassword(auth,email,pass);
   const claimed=await claimUsername(username,cred.user.uid);
   if(!claimed){await signOut(auth);throw new Error("اسم المستخدم محجوز. اختار اسمًا آخر.");}
   await updateProfile(cred.user,{displayName:name});
   await set(ref(db,"users/"+cred.user.uid),{uid:cred.user.uid,name,username,createdAt:Date.now()});
   authMsg("تم إنشاء حسابك بنجاح!",false);
  }else{await signInWithEmailAndPassword(auth,email,pass);authMsg("تم تسجيل الدخول",false)}
 }catch(e){console.error(e);authMsg(e.code?friendly(e):e.message)}
 finally{$("authBtn").disabled=false}
};
onAuthStateChanged(auth,async user=>{
 me=user;
 if(user){
  $("authView").classList.add("hidden");$("chatApp").classList.remove("hidden");
  let snap=await get(ref(db,"users/"+user.uid));
  if(!snap.exists()){await set(ref(db,"users/"+user.uid),{uid:user.uid,name:user.displayName||"مستخدم",username:"user_"+user.uid.slice(0,8).toLowerCase(),createdAt:Date.now()});snap=await get(ref(db,"users/"+user.uid))}
  paintMe(snap.val());listenChats();
 }else{$("chatApp").classList.add("hidden");$("authView").classList.remove("hidden")}
});
function paintMe(u){$("myName").textContent=u.name||"مستخدم";$("myHandle").textContent="@"+(u.username||"");$("myAvatar").textContent=(u.name||"E").slice(0,1)}
$("logout").onclick=()=>signOut(auth);
function listenChats(){if(stopChats)stopChats();stopChats=onValue(ref(db,"userChats/"+me.uid),async s=>{chatMap={};const ids=Object.keys(s.val()||{});for(const id of ids){const c=await get(ref(db,"chats/"+id));if(c.exists())chatMap[id]=c.val()}renderChats()})}
function renderChats(){const q=$("filterChats").value.toLowerCase();const arr=Object.entries(chatMap).filter(([id,c])=>(c.title||"").toLowerCase().includes(q));$("chatCount").textContent=arr.length;$("chatList").innerHTML=arr.length?arr.map(([id,c])=>`<div class="chat-item ${id===activeId?"selected":""}" data-id="${clean(id)}"><div class="avatar">${clean((c.title||"?").slice(0,1))}</div><div class="chat-meta"><b>${clean(c.title||"محادثة")}</b><small>${clean(c.lastMessage||"ابدأ المحادثة")}</small></div></div>`).join(""):`<div class="empty">لسه مفيش محادثات<br>ابحث عن أصحابك ✨</div>`;$("chatList").querySelectorAll("[data-id]").forEach(x=>x.onclick=()=>openRoom(x.dataset.id))}
$("filterChats").oninput=renderChats;
async function openRoom(id){activeId=id;activeChat=chatMap[id];$("welcome").classList.add("hidden");$("room").classList.remove("hidden");$("chatApp").classList.add("mobile-room");$("roomName").textContent=activeChat.title||"محادثة";$("roomHandle").textContent=activeChat.handle||"";$("roomAvatar").textContent=(activeChat.title||"?").slice(0,1);renderChats();if(stopMsgs)stopMsgs();stopMsgs=onValue(query(ref(db,"messages/"+id),orderByChild("createdAt"),limitToLast(100)),s=>{const data=s.val()||{};$("messages").innerHTML=Object.values(data).map(m=>`<div class="bubble ${m.sender===me.uid?"mine":""}">${clean(m.text)}<small>${m.createdAt?new Date(m.createdAt).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"}):"الآن"}</small></div>`).join("");$("messages").scrollTop=$("messages").scrollHeight})}
$("backMobile").onclick=()=>{$("chatApp").classList.remove("mobile-room");$("room").classList.add("hidden");$("welcome").classList.remove("hidden")};
$("sendForm").onsubmit=async e=>{e.preventDefault();const text=$("messageText").value.trim();if(!text||!activeId)return;try{await set(push(ref(db,"messages/"+activeId)),{text,sender:me.uid,createdAt:Date.now()});await set(ref(db,"chats/"+activeId+"/lastMessage"),text);$("messageText").value=""}catch(e){toast("تعذر الإرسال. راجع قواعد قاعدة البيانات.")}};
function modal(html,callback){$("modalBody").innerHTML=html;$("modal").classList.remove("hidden");callback?.()}
function closeModal(){$("modal").classList.add("hidden")}
$("closeModal").onclick=closeModal;$("modal").onclick=e=>{if(e.target===$("modal"))closeModal()};
$("findUser").onclick=()=>modal(`<h3>ابحث عن شخص</h3><label>اسم المستخدم المميز</label><input id="lookupUsername" placeholder="@username" dir="ltr"><button id="lookupBtn" class="action">بحث وبدء محادثة</button><p class="help">اكتب اليوزر فقط، من غير ما تحتاج رقم هاتف أو بريد الشخص.</p>`,()=>{$("lookupBtn").onclick=async()=>{let username=$("lookupUsername").value.trim().replace(/^@/,"");if(!usernameOK(username))return toast("اكتب يوزر صحيح من 3 إلى 20 حرفًا");const idx=await get(ref(db,"usernameIndex/"+keyOf(username)));if(!idx.exists())return toast("اليوزر غير موجود");const us=await get(ref(db,"users/"+idx.val()));if(!us.exists())return toast("تعذر العثور على الحساب");const u=us.val();if(u.uid===me.uid)return toast("ده اليوزر بتاعك");const ids=[me.uid,u.uid].sort(),id="dm_"+ids.join("_");const cr=ref(db,"chats/"+id),exists=await get(cr);if(!exists.exists())await set(cr,{type:"direct",members:{[ids[0]]:true,[ids[1]]:true},title:u.name,handle:"@"+u.username,createdAt:Date.now()});await set(ref(db,`userChats/${ids[0]}/${id}`),true);await set(ref(db,`userChats/${ids[1]}/${id}`),true);closeModal();toast("تم فتح المحادثة");setTimeout(()=>openRoom(id),300)}}});
$("newGroup").onclick=()=>modal(`<h3>إنشاء مجموعة</h3><label>اسم المجموعة</label><input id="groupName" placeholder="اسم المجموعة"><button id="makeGroup" class="action">إنشاء</button>`,()=>{$("makeGroup").onclick=async()=>{const title=$("groupName").value.trim();if(!title)return toast("اكتب اسم المجموعة");const id=push(ref(db,"chats")).key;await set(ref(db,"chats/"+id),{type:"group",title,members:{[me.uid]:true},createdAt:Date.now()});await set(ref(db,`userChats/${me.uid}/${id}`),true);closeModal();toast("تم إنشاء المجموعة");setTimeout(()=>openRoom(id),300)}});
$("editProfile").onclick=()=>modal(`<h3>ملفي الشخصي</h3><label>اسم العرض</label><input id="editName" value="${clean($("myName").textContent)}"><p class="help">اليوزر المميز ثابت ولا يمكن تغييره في هذه النسخة.</p><button id="saveProfile" class="action">حفظ</button>`,()=>{$("saveProfile").onclick=async()=>{const name=$("editName").value.trim();if(!name)return toast("اكتب اسمك");await set(ref(db,`users/${me.uid}/name`),name);await updateProfile(me,{displayName:name});$("myName").textContent=name;closeModal();toast("تم تحديث الاسم")}});
