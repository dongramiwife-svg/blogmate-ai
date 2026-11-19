import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,signInAnonymously,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,doc,setDoc,deleteDoc} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {getMessaging,getToken,deleteToken,isSupported,onMessage} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js';
import './firebase-config.js';
const status=document.getElementById('push-status');
const config=globalThis.BLOGMATE_FIREBASE_CONFIG;
const vapid=globalThis.BLOGMATE_VAPID_PUBLIC_KEY;
let app,auth,db,messaging,sw;
const say=t=>status.textContent=t;
async function init(){
  if(!config?.apiKey||!vapid)throw Error('Firebase 웹 설정 및 VAPID 공개 키를 먼저 입력하세요.');
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!(await isSupported()))throw Error('이 브라우저에서는 웹 푸시를 사용할 수 없습니다.');
  app ||= initializeApp(config);auth ||= getAuth(app);db ||= getFirestore(app);messaging ||= getMessaging(app);
  sw ||= await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;
  if(!auth.currentUser)await signInAnonymously(auth);
  return auth.currentUser.uid;
}
document.getElementById('enable-push').onclick=async()=>{
  try{
    say('설정 중...');
    if(Notification.permission==='denied')throw Error('Chrome 사이트 설정에서 알림 차단을 해제하세요.');
    if((await Notification.requestPermission())!=='granted')throw Error('알림 권한이 허용되지 않았습니다.');
    const uid=await init();
    const token=await getToken(messaging,{vapidKey:vapid,serviceWorkerRegistration:sw});
    if(!token)throw Error('푸시 토큰을 받지 못했습니다.');
    await setDoc(doc(db,'subscriptions',uid),{token,updatedAt:new Date().toISOString()});
    say('이 갤럭시의 새 글 알림이 활성화되었습니다.');
    onMessage(messaging,p=>{if(p?.data?.kind==='new_posts'){new Notification('BlogMate AI · 새 글 도착',{body:`새 게시글 ${p.data.count||1}개가 발견되었습니다.`});}});
  }catch(e){say('알림 설정 실패: '+e.message)}
};
document.getElementById('disable-push').onclick=async()=>{
  try{const uid=await init();await deleteDoc(doc(db,'subscriptions',uid));await deleteToken(messaging);say('이 기기의 알림 구독을 해제했습니다.');}catch(e){say('알림 해제 실패: '+e.message)}
};
if(Notification.permission==='granted')say('알림 권한 허용됨 · 구독 상태는 활성화 버튼으로 갱신할 수 있습니다.');
