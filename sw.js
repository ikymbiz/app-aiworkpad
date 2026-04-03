// ==========================================
// AIWorkPad Service Worker v3.0
// Cache First (App Shell) + Network First (API)
// ==========================================

const CACHE_VERSION = 'aiworkpad-v3.0';
const APP_SHELL_CACHE = CACHE_VERSION + '-shell';
const CDN_CACHE = CACHE_VERSION + '-cdn';

// App Shell — キャッシュ必須
const APP_SHELL_URLS = [
    './',
    './index.html',
];

// CDN リソース — 初回アクセス時にキャッシュ
const CDN_URLS = [
    'https://cdn.tailwindcss.com?plugins=typography',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js',
    'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
];

// FontAwesome webfont パターン (動的キャッシュ)
const FONT_PATTERN = /cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome/;

// API エンドポイント (キャッシュしない — Network Only)
const API_PATTERNS = [
    /generativelanguage\.googleapis\.com/,
    /api\.anthropic\.com/,
];

// ==========================================
// Install — App Shell と CDN をプリキャッシュ
// ==========================================
self.addEventListener('install', (event) => {
    console.log('[SW] Install:', CACHE_VERSION);
    event.waitUntil(
        Promise.all([
            caches.open(APP_SHELL_CACHE).then(cache => {
                return cache.addAll(APP_SHELL_URLS).catch(err => {
                    console.warn('[SW] App shell cache failed (OK on first deploy):', err);
                });
            }),
            caches.open(CDN_CACHE).then(cache => {
                // CDN は best-effort — 失敗しても install は成功させる
                return Promise.allSettled(
                    CDN_URLS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn('[SW] CDN cache skip:', url, err.message);
                        })
                    )
                );
            }),
        ]).then(() => self.skipWaiting())
    );
});

// ==========================================
// Activate — 古いキャッシュを削除
// ==========================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activate:', CACHE_VERSION);
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => !key.startsWith(CACHE_VERSION))
                    .map(key => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ==========================================
// Fetch — ハイブリッド戦略
// ==========================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1) API 呼び出し → Network Only (キャッシュしない)
    if (API_PATTERNS.some(p => p.test(url.href))) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 2) Chrome拡張など非HTTP → スキップ
    if (!url.protocol.startsWith('http')) return;

    // 3) data: URI (manifest) → スキップ
    if (url.protocol === 'data:') return;

    // 4) CDN / フォントリソース → Cache First + Network Fallback
    if (FONT_PATTERN.test(url.href) || CDN_URLS.some(u => url.href.startsWith(u))) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(CDN_CACHE).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => {
                    // オフラインでキャッシュもない場合
                    return new Response('/* offline */', {
                        headers: { 'Content-Type': 'text/css' }
                    });
                });
            })
        );
        return;
    }

    // 5) App Shell (HTML ナビゲーション) → Network First + Cache Fallback
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response && response.ok) {
                        const clone = response.clone();
                        caches.open(APP_SHELL_CACHE).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request)
                        .then(cached => cached || caches.match('./index.html'));
                })
        );
        return;
    }

    // 6) その他の静的リソース → Cache First
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CDN_CACHE).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});

// ==========================================
// Message — クライアントからの制御メッセージ
// ==========================================
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
