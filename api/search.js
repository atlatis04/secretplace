/**
 * Google Places API Search Proxy (Serverless Function)
 * Securely handles API requests without exposing the API key to the client.
 */

export default async function handler(req, res) {
    // CORS configuration
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    const apiKey = process.env.VITE_GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
        console.error('❌ Missing GOOGLE_PLACES_API_KEY in environment variables');
        return res.status(500).json({ error: 'System configuration error' });
    }

    try {
        // Using Places API (New) - v1
        const googleApiUrl = 'https://places.googleapis.com/v1/places:searchText';

        const response = await fetch(googleApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.types'
            },
            body: JSON.stringify({
                textQuery: query,
                languageCode: 'ko'
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error('❌ Google API Error:', data.error);
            return res.status(500).json({ error: data.error.message });
        }

        // Standardize response for frontend
        const standardizedResults = (data.places || []).map(place => ({
            display_name: place.displayName?.text || '알 수 없는 장소',
            address: place.formattedAddress,
            lat: place.location?.latitude,
            lon: place.location?.longitude,
            type: place.types && place.types.length > 0 ? place.types[0] : 'place',
            types_full: place.types
        }));

        return res.status(200).json({ results: standardizedResults });
    } catch (error) {
        console.error('❌ Proxy Server Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
