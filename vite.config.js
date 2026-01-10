import { resolve } from 'path'
import { defineConfig, loadEnv } from 'vite'
import zlib from 'zlib'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')
    const googleApiKey = env.VITE_GOOGLE_PLACES_API_KEY

    return {
        build: {
            rollupOptions: {
                input: {
                    main: resolve(__dirname, 'index.html'),
                    map: resolve(__dirname, 'map.html'),
                },
            },
        },
        server: {
            proxy: {
                '/api/search': {
                    target: 'https://places.googleapis.com',
                    changeOrigin: true,
                    rewrite: (path) => {
                        return '/v1/places:searchText'
                    },
                    configure: (proxy, options) => {
                        proxy.on('proxyReq', (proxyReq, req, res) => {
                            // Extract query from ORIGINAL request URL (before rewrite)
                            const originalUrl = req.originalUrl || req.url;
                            const url = new URL(originalUrl, 'http://localhost')
                            const query = url.searchParams.get('query')

                            console.log('🔍 Original URL:', originalUrl);
                            console.log('🔍 Proxy received query:', query);

                            const bodyData = JSON.stringify({
                                textQuery: query,
                                languageCode: 'ko'
                            });

                            proxyReq.setHeader('Content-Type', 'application/json');
                            proxyReq.setHeader('X-Goog-Api-Key', googleApiKey);
                            proxyReq.setHeader('X-Goog-FieldMask', 'places.displayName,places.formattedAddress,places.location,places.types');
                            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                            proxyReq.method = 'POST';

                            // Write body and end request
                            proxyReq.write(bodyData);
                            proxyReq.end();
                        });

                        proxy.on('proxyRes', (proxyRes, req, res) => {
                            let body = []
                            proxyRes.on('data', chunk => {
                                body.push(chunk)
                            })
                            proxyRes.on('end', () => {
                                let responseBuffer = Buffer.concat(body);

                                // Check if response is GZIP compressed
                                const encoding = proxyRes.headers['content-encoding'];
                                if (encoding === 'gzip') {
                                    try {
                                        responseBuffer = zlib.gunzipSync(responseBuffer);
                                    } catch (e) {
                                        console.error('❌ GZIP Decompression Error:', e.message);
                                    }
                                }

                                const responseString = responseBuffer.toString();
                                console.log('🔍 Google API Response:', responseString.substring(0, 500));

                                try {
                                    const data = JSON.parse(responseString)
                                    if (data.error) {
                                        console.error('❌ Google API Error:', data.error);
                                        res.writeHead(500, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ error: data.error.message || 'API Error' }));
                                        return;
                                    }

                                    const standardized = {
                                        results: (data.places || []).map(place => ({
                                            display_name: place.displayName?.text || '알 수 없는 장소',
                                            address: place.formattedAddress,
                                            lat: place.location?.latitude,
                                            lon: place.location?.longitude,
                                            type: place.types && place.types.length > 0 ? place.types[0] : 'place'
                                        }))
                                    }
                                    res.writeHead(200, { 'Content-Type': 'application/json' })
                                    res.end(JSON.stringify(standardized))
                                } catch (e) {
                                    console.error('❌ Proxy Parsing Error:', e.message);
                                    console.error('Raw response:', responseString);
                                    res.writeHead(500, { 'Content-Type': 'application/json' })
                                    res.end(JSON.stringify({ error: 'Proxy failed to parse Google API response' }))
                                }
                            })
                        })
                    },
                    selfHandleResponse: true
                }
            }
        }
    }
})

