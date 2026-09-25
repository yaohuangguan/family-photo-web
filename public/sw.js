const CACHE="family-home-v9";
const SHELL=[
  "/",
  "/style.css?v=9",
  "/app.js?v=9",
  "/manifest.webmanifest?v=9",
  "/assets/family-photo-blur.jpg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const req=event.request;
  const url=new URL(req.url);
  if(req.method!=="GET"||url.origin!==location.origin)return;

  if(url.pathname.startsWith("/api/")){
    event.respondWith(fetch(req));
    return;
  }

  if(req.mode==="navigate"){
    event.respondWith(
      fetch(req).then(res=>{
        const copy=res.clone();
        caches.open(CACHE).then(cache=>cache.put("/",copy));
        return res;
      }).catch(()=>caches.match("/"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached=>cached||fetch(req).then(res=>{
      if(res.ok){
        const copy=res.clone();
        caches.open(CACHE).then(cache=>cache.put(req,copy));
      }
      return res;
    }))
  );
});