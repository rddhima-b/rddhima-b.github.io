// backend proxy that protects apis (nominatim and ORS)
// hides api keys
import express from "express"; // web server framework for node.js
// import fetch from "node-fetch"; // node.js does not have fetch() by default, gives same fetch used in the browser but for backend
import cors from "cors"; // allows frontend and backend to talk bc the browser will block requests otherwise

import dotenv from "dotenv";
dotenv.config();
// loads variables from .env to process.env since the api key should not be hardcoded

const app = express(); // creates server instance
app.use(cors()); // allows cross-origin requests
app.use(express.json()); // lets express read json request bodies, needed for the req. stuff

// USER-AGENT for Nominatim
const USER_AGENT = "CarpoolPWA/1.0 (rddhima.bora@gmail.com)";

let lastGeocodeTime = 0;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

app.get("/geocode", async (req, res) => {
    const address = req.query.address;

    if (!address) {
        return res.status(400).json({ error: "Missing address" });
    }

    try {
        // 1 req/sec throttle (Nominatim-safe)
        const now = Date.now();
        const elapsed = now - lastGeocodeTime;
        if (elapsed < 1000) {
            await sleep(1000 - elapsed);
        }
        lastGeocodeTime = Date.now();

        const url =
            `https://nominatim.openstreetmap.org/search` +
            `?q=${encodeURIComponent(address)}` +
            `&format=json&limit=1`;

        const response = await fetch(url, {
            headers: {
                "User-Agent": "carpool-party/1.0 (school-project)"
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({
                error: "Nominatim error"
            });
        }

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error("Geocode error:", err);
        res.status(500).json({ error: "Geocode failed" });
    }
});


// ors driving distance endpoint
app.post("/route", async (req, res) => {
    const { start, end } = req.body; // sends structured data as coordinates, cleaner than query strings

    if (!start || !end) { // validate input, prevents broken ors calls
        return res.status(400).json({ error: "Missing start/end coordinates" });
    }

    const url = "https://api.openrouteservice.org/v2/directions/driving-car";
    // requests road-based driving routes rather than straigh-line distance (hypothetically)

    const body = {
        coordinates: [
            [start.lon, start.lat], // ORS expects [lon, lat] -- important to have this
            [end.lon, end.lat]
        ]
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": process.env.ORS_KEY, // uses api key securely
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const json = await response.json();
        return res.json(json);
        // returns ors response

    } catch (err) {
        console.error("ORS routing error:", err);
        res.status(500).json({ error: "Routing failed" });
    }
    // error handiling, prevents crashes if ors is down
});

// ------------------------------
app.listen(3000, () => {
    console.log("Backend server running on http://localhost:3000");
    // starts backend server
});