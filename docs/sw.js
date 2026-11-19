const CACHE='blogmate-v9';
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./icon.svg']))));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.pathname.includes('/data/'))return;if(e.request.method==='GET'&&u.origin===location.origin)e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))});
try {
  importScripts('./firebase-config.js');
  if(self.BLOGMATE_FIREBASE_CONFIG?.apiKey){
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
    firebase.initializeApp(self.BLOGMATE_FIREBASE_CONFIG);
    firebase.messaging().onBackgroundMessage(payload=>{
      if(payload?.data?.kind!=='new_posts')return;
      const count=Number(payload.data.count)||1;
      self.registration.showNotification('BlogMate AI · 새 글 도착',{body:`새 게시글 ${count}개가 발견되었습니다. 눌러서 확인하세요.`,icon:'./icon.svg',tag:'blogmate-new-posts',data:{url:'./index.html'}});
    });
  }
}catch(err){console.warn('Push worker not configured:',err)}
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.openWindow(e.notification.data?.url||'./index.html'))});
