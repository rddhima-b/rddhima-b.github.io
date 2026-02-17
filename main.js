import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { Request } from "./Request.js";

// firebase setup

const firebaseConfig = {
    apiKey: "AIzaSyAoH-r85ybXVvw6Klt_vPXPy0HgbnT7Oq0",
    authDomain: "carpool-party-5bf47.firebaseapp.com",
    projectId: "carpool-party-5bf47",
    storageBucket: "carpool-party-5bf47",
    messagingSenderId: "224912194414",
    appId: "1:224912194414:web:75a1c4ffb86a3966d8df7f",
    measurementId: "G-7KJLFX0PK4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
console.log("Firebase app:", app);
console.log("Firestore db:", db);

// firestore connection

async function loadRequestsFromDB() {
    const snap = await getDocs(collection(db, "requests"));
    let arr = [];
    snap.forEach(doc => {
        const d = doc.data();
        const req = new Request(d.origin, d.dest, d.day, d.time, d.name, d.email);
        req.id = doc.id;
        arr.push(req);
    });
    return arr;
}

async function saveRequestToDB(req) {
    const docRef = await addDoc(collection(db, "requests"), {
        name: req.getName(),
        email: req.getEmail(),
        origin: req.getOrigin(),
        dest: req.getDest(),
        day: req.getDay(),
        time: req.getTime()
    });
    req.id = docRef.id;
}

// geocoding and backend

async function getLatLon(address) {
    const url = `http://localhost:3000/geocode?address=${encodeURIComponent(address)}`;

    let res;
    try {
        res = await fetch(url);
    } catch (err) {
        console.error("Network error calling backend:", err);
        throw err;
    }

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Geocoding failed ${res.status}: ${text}`);
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
        throw new Error("Address not found: " + address);
    }

    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
}

// cache geocoding so we do not call ORS too many times
const geoCache = new Map();
async function getLatLonCached(address) {
    if (geoCache.has(address)) {
        return geoCache.get(address);
    }

    const coords = await getLatLon(address);
    geoCache.set(address, coords);
    return coords;
}

async function getDrivingDistance(lat1, lon1, lat2, lon2) {
    const res = await fetch("http://localhost:3000/route", {
        method: "POST", //POST- sending JSON data to API
        headers: { "Content-Type": "application/json" }, //sending JSON data to server
        body: JSON.stringify({
            start: { lat: lat1, lon: lon1 },
            end: { lat: lat2, lon: lon2 }
        })
    });

    if (!res.ok) {
        throw new Error("Driving route failed: " + res.status);
    }

    const data = await res.json();

    // ORS can use summary.distance or segments[0].distance, we don't know
    const meters =
        data.routes?.[0]?.summary?.distance ?? //? tells code to stop if it DNE but not crash or throw error
        data.routes?.[0]?.segments?.[0]?.distance;

    if (meters == null) {
        console.error("ORS bad formatting:", data);
        throw new Error("ORS missing distance");
    }
    console.log("distance:", meters / 1609.34);
    return meters / 1609.34; // meters converted to miles
}

// matching algorithm
async function findMatches(requests, userReq) {
    // only consider requests on the same day and within 1 hour before/after, with wrap-around at midnight
    function hourDiff(a, b) {
        let diff = Math.abs(a - b);
        return Math.min(diff, 24 - diff);
    }
    const candidates = requests.filter(r =>
        r.id !== userReq.id &&
        r.getDay() === userReq.getDay() &&
        hourDiff(r.getTime(), userReq.getTime()) <= 1
    );
    const [uLatO, uLonO] = await getLatLonCached(userReq.getOrigin());
    const [uLatD, uLonD] = await getLatLonCached(userReq.getDest());
    const matches = [];
    for (const r of candidates) {
        try {
            const [rLatO, rLonO] = await getLatLonCached(r.getOrigin());
            const [rLatD, rLonD] = await getLatLonCached(r.getDest());
            let originDist = await getDrivingDistance(uLatO, uLonO, rLatO, rLonO);
            let destDist = await getDrivingDistance(uLatD, uLonD, rLatD, rLonD);
            originDist = originDist < 0.01 ? '< 0.1' : originDist.toFixed(2);
            destDist = destDist < 0.01 ? '< 0.1' : destDist.toFixed(2);
            // only match if both are within 5 mi
            const originOk = originDist === '< 0.1' || parseFloat(originDist) <= 5;
            const destOk = destDist === '< 0.1' || parseFloat(destDist) <= 5;
            if (originOk && destOk) {
                matches.push({
                    id: r.id,
                    name: r.getName(),
                    email: r.getEmail(),
                    day: r.getDay(),
                    time: r.getTime(),
                    originDist,
                    destDist
                });
            }
        } catch (err) {
            console.error("Error checking match:", err);
        }
    }
    // Sort matches by sum of originDist and destDist (least to most)
    matches.sort((a, b) => {
        function distSum(m) {
            const o = m.originDist === '< 0.1' ? 0 : parseFloat(m.originDist);
            const d = m.destDist === '< 0.1' ? 0 : parseFloat(m.destDist);
            return o + d;
        }
        return distSum(a) - distSum(b);
    });
    return matches;
}

function showPage(pageNum) {
    document.querySelectorAll('.form-page').forEach((el, i) => {
        if (i === pageNum - 1) {
            el.classList.remove('noDisplay');
        } else {
            el.classList.add('noDisplay');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    showPage(1);
    setTimeout(() => {
        const next1 = document.getElementById('next1');
        const back2 = document.getElementById('back2');
        const next2 = document.getElementById('next2');
        const back3 = document.getElementById('back3');
        if (next1) next1.onclick = function () {
            const name = document.getElementById('name');
            const email = document.getElementById('email');
            if (!name.value.trim()) { name.focus(); return; }
            if (!email.value.trim()) { email.focus(); return; }
            showPage(2);
        };
        if (back2) back2.onclick = function () { showPage(1); };

        if (back3) back3.onclick = function () { showPage(2); };
    }, 0);
    // Address validation for page 2
    const next2Btn = document.getElementById('next2');
    const back2Btn = document.getElementById('back2');
    const output = document.getElementById('output');
    if (next2Btn) {
        next2Btn.addEventListener('click', async () => {
            output.textContent = '';
            // First check if all fields are non-empty
            const fields = [
                'originAddress', 'originCity', 'originState', 'originZip',
                'destAddress', 'destCity', 'destState', 'destZip'
            ];
            for (const id of fields) {
                const el = document.getElementById(id);
                if (!el.value.trim()) {
                    el.focus();
                    return;
                }
            }
            // Compose full addresses
            const origin = [
                document.getElementById('originAddress').value,
                document.getElementById('originCity').value,
                document.getElementById('originState').value,
                document.getElementById('originZip').value
            ].map(s => s.trim()).filter(Boolean).join(', ');
            const dest = [
                document.getElementById('destAddress').value,
                document.getElementById('destCity').value,
                document.getElementById('destState').value,
                document.getElementById('destZip').value
            ].map(s => s.trim()).filter(Boolean).join(', ');
            let valid = true;
            next2Btn.disabled = true;
            try {
                await getLatLon(origin);
            } catch (e) {
                output.textContent = 'Invalid address. Please enter a real address.';
                valid = false;
            }
            if (valid) {
                try {
                    await getLatLon(dest);
                } catch (e) {
                    output.textContent = 'Invalid destination address. Please enter a real address.';
                    valid = false;
                }
            }
            next2Btn.disabled = false;
            if (valid) {
                showPage(3);
            }
        });
    }
    if (back2Btn) {
        back2Btn.addEventListener('click', () => {
            showPage(1);
        });
    }
});
// form handling - attach after DOM is ready to avoid null selector errors (DOM - document object model)
document.addEventListener('DOMContentLoaded', () => {
    const rideForm = document.querySelector('#rideForm');
    if (!rideForm) return;

    rideForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        document.querySelector('#loading').style.display = 'block';
        // Ccear previous output
        document.querySelector('#output').innerHTML = '';

        try {
            const name = document.querySelector('#name').value;
            const email = document.querySelector('#email').value;
            const origin = `${document.getElementById('originAddress').value}, ${document.getElementById('originCity').value}, ${document.getElementById('originState').value} ${document.getElementById('originZip').value}`;
            const dest = `${document.getElementById('destAddress').value}, ${document.getElementById('destCity').value}, ${document.getElementById('destState').value} ${document.getElementById('destZip').value}`;
            const day = document.querySelector('#day').value;
            let hour = parseInt(document.querySelector('#time').value);
            const ampm = document.querySelector('#ampm') ? document.querySelector('#ampm').value : 'AM';

            // convert to military time
            if (ampm === 'AM') {
                if (hour === 12) hour = 0;
            } else if (ampm === 'PM') {
                if (hour !== 12) hour += 12;
            }
            const time = hour;

            const newReq = new Request(origin, dest, day, time, name, email);
            await saveRequestToDB(newReq);

            const requests = await loadRequestsFromDB();
            const matches = await findMatches(requests, newReq);

            // create matches as clickable links with better formatting
            const output = document.querySelector('#output');
            if (matches.length) {
                function formatTime(hour) {
                    let ampm = hour >= 12 ? 'PM' : 'AM';
                    let h = hour % 12;
                    if (h === 0) h = 12;
                    return `${h} ${ampm}`;
                }
                output.innerHTML = `
                    <div style="margin-top:1em;text-align:left;max-width:500px;margin-left:auto;margin-right:auto;">
                        <h2 style="font-size:1.2em;margin-bottom:0.5em;">Good matches:</h2>
                        <ul style="list-style:none;padding:0;">
                            ${matches.map(m => `
                                <li style="background:#f2f2f2;border-radius:8px;padding:1em;margin-bottom:1em;box-shadow:0 1px 4px #0001;">
                                    <a href="match.html?matchId=${m.id}&name=${encodeURIComponent(m.name)}&email=${encodeURIComponent(m.email)}&day=${encodeURIComponent(m.day)}&time=${encodeURIComponent(m.time)}&originDist=${encodeURIComponent(m.originDist)}&destDist=${encodeURIComponent(m.destDist)}" target="_blank" style="text-decoration:none;color:#0078d7;font-weight:600;">
                                        ${m.name} (${m.email})<br>
                                        <span style='font-size:0.95em;color:#333;'>Origin distance: ${m.originDist} mi, Destination distance: ${m.destDist} mi<br>Time: ${formatTime(m.time)}</span>
                                    </a>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            } else {
                output.innerHTML = `No matches found.<br><a href='index.html' style='color:#68B0AB;font-weight:600;text-decoration:underline;display:inline-block;margin-top:1.5em;'>Back to search</a>`;
            }
        } catch (err) {
            console.error("Submission failed:", err);
            document.querySelector('#output').innerText =
                "Something went wrong. Please try again.";
        } finally {
            document.querySelector('#loading').style.display = 'none';
        }
    });
});
