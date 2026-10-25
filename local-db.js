// 💾 Local database — replaces Firebase. Everything is stored in THIS browser
// only (localStorage), so each person/group has their own separate data.
// It mimics the small part of the Firestore API the app uses
// (db.collection().doc().get/set/update/delete/onSnapshot) so the rest of the
// code didn't need to change.

(function () {
    const PREFIX = 'LOCALDB_';
    const listeners = {}; // collection name -> [callbacks]

    function readAll(col) {
        try { return JSON.parse(localStorage.getItem(PREFIX + col)) || {}; }
        catch (e) { return {}; }
    }

    function writeAll(col, obj) {
        try {
            localStorage.setItem(PREFIX + col, JSON.stringify(obj));
        } catch (e) {
            alert('❌ พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม (อาจเพราะรูปเยอะเกินไป) — ลองลบรูปหรือข้อมูลเก่าออก');
            throw e;
        }
        notify(col);
    }

    function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

    function makeDocSnap(id, data) {
        return { id: id, exists: data !== undefined, data: () => clone(data) };
    }

    function makeQuerySnap(col) {
        const all = readAll(col);
        const docs = Object.keys(all).map(id => makeDocSnap(id, all[id]));
        return { docs: docs, size: docs.length, empty: docs.length === 0, forEach: fn => docs.forEach(fn) };
    }

    function notify(col) {
        (listeners[col] || []).forEach(fn => fn());
    }

    // Other tabs of the same browser changed the data
    window.addEventListener('storage', e => {
        if (e.key && e.key.indexOf(PREFIX) === 0) notify(e.key.slice(PREFIX.length));
    });

    function subscribe(col, fn) {
        (listeners[col] = listeners[col] || []).push(fn);
        setTimeout(fn, 0); // fire once right away, like Firestore does
        return () => { listeners[col] = listeners[col].filter(f => f !== fn); };
    }

    function doc(col, id) {
        return {
            id: id,
            get: () => Promise.resolve(makeDocSnap(id, readAll(col)[id])),
            set: data => { const all = readAll(col); all[id] = clone(data); writeAll(col, all); return Promise.resolve(); },
            update: data => {
                const all = readAll(col);
                if (all[id] === undefined) return Promise.reject(new Error('Document not found: ' + id));
                all[id] = Object.assign({}, all[id], clone(data));
                writeAll(col, all);
                return Promise.resolve();
            },
            delete: () => { const all = readAll(col); delete all[id]; writeAll(col, all); return Promise.resolve(); },
            onSnapshot: cb => subscribe(col, () => cb(makeDocSnap(id, readAll(col)[id])))
        };
    }

    window.db = {
        collection: col => ({
            doc: id => doc(col, id),
            get: () => Promise.resolve(makeQuerySnap(col)),
            onSnapshot: cb => subscribe(col, () => cb(makeQuerySnap(col)))
        })
    };

    // 📸 Photos: shrunk to a small picture and saved inside the browser
    window.storage = {
        ref: path => {
            let result = null;
            return {
                put: file => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = reject;
                    reader.onload = () => {
                        const img = new Image();
                        img.onerror = reject;
                        img.onload = () => {
                            const MAX = 256;
                            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                            const canvas = document.createElement('canvas');
                            canvas.width = Math.round(img.width * scale);
                            canvas.height = Math.round(img.height * scale);
                            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                            result = canvas.toDataURL('image/jpeg', 0.8);
                            resolve();
                        };
                        img.src = reader.result;
                    };
                    reader.readAsDataURL(file);
                }),
                getDownloadURL: () => Promise.resolve(result)
            };
        }
    };
})();
