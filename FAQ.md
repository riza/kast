# FAQ

## Listen pages keep requesting `:8080` even after I changed the public URL

The dashboard caches the server's `public_url` setting in your browser's localStorage under the key `kast_api_url`. This cached value takes priority over the `NEXT_PUBLIC_API_URL` environment variable.

If you previously ran the server without a public URL configured (or with a wrong one), the dashboard may have cached an empty or stale value and will keep sending requests to the wrong address in listen pages.

**Fix:**

1. Open your browser's DevTools (F12) → Application → Local Storage → delete the `kast_api_url` key.
2. Set `NEXT_PUBLIC_API_URL` in your dashboard `.env` file to the correct server address.
3. Restart the dashboard service.

The next time the dashboard loads, it will fetch the correct URL from the server and cache it properly.
