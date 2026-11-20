const CACHE_NAME = 'neryxsvg-shell-v1';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/styles/context-menu.css',
  '/styles/editor.css',
  '/assets/svg/favicon.svg',
  '/js/app/State.js',
  '/js/app/dom.js',
  '/js/app/main.js',
  '/js/app/renderAll.js',
  '/js/app/Storage.js',
  '/js/app/Autosave.js',
  '/js/app/FileSystemIO.js',
  '/js/app/ProjectIO.js',
  '/js/app/PWA.js',
  '/js/canvas/HitTest.js',
  '/js/canvas/Interaction.js',
  '/js/canvas/Navigation.js',
  '/js/canvas/Renderer.js',
  '/js/canvas/Snapping.js',
  '/js/document/Commands.js',
  '/js/document/Document.js',
  '/js/document/Element.js',
  '/js/document/Gradients.js',
  '/js/document/Groups.js',
  '/js/document/History.js',
  '/js/document/Project.js',
  '/js/svg/PathParser.js',
  '/js/svg/Sanitizer.js',
  '/js/svg/Serializer.js',
  '/js/svg/TransformParser.js',
  '/js/ui/CodeEditor.js',
  '/js/ui/ContextMenu.js',
  '/js/ui/Inspector.js',
  '/js/ui/Layers.js',
  '/js/ui/Toolbar.js',
  '/js/utils/ArcMath.js',
  '/js/utils/Geometry.js',
  '/js/utils/Matrix.js',
  '/js/utils/ids.js',
];
self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>
      Promise.allSettled(SHELL_FILES.map(url=>
        fetch(url, { cache: 'no-cache' }).then(res=>{
          if(res && res.ok) return cache.put(url, res);
        }).catch(()=>{})
      ))
    ).then(()=>self.skipWaiting())
  );
});
self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(names=>
      Promise.all(names.filter(n=>n!==CACHE_NAME).map(n=>caches.delete(n)))
    ).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;

  if(req.mode === 'navigate'){
    event.respondWith(
      fetch(req).catch(()=>caches.match('/index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(cached=>{
      if(cached) return cached;
      return fetch(req).then(res=>{
        if(res && res.ok){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache=>cache.put(req, copy));
        }
        return res;
      }).catch(()=>cached);
    })
  );
});
