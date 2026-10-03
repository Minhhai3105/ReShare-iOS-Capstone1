# ReShare Image API

Node.js API for signed Cloudinary uploads. The iOS client calls the three routes in `image-api.cjs`; no Cloudinary secret is embedded in the app.

## Local verification

```sh
cd backend
npm ci
npm test
```

Tests use in-memory Firebase/Cloudinary fakes. They do not prove a live Cloudinary upload or Firebase deployment. The app cannot upload until this API is deployed and `RESHARE_IMAGE_API_BASE_URL` is set in the Xcode project.

## Render Free setup

1. Push the reviewed code to a Git remote. In Render, create **New > Web Service**, select that repository, set **Root Directory** to `backend`, **Build Command** to `npm ci`, **Start Command** to `npm start`, **Instance Type** to Free, and **Health Check Path** to `/health`. Use Node 22 or newer.
2. In Cloudinary Console **Settings > API Keys**, find the API key and secret for cloud `c9ide1cv`. Put them only in Render's **Environment** settings, never in Git or an iOS file.
3. In Firebase Console for `reshare-13234`, open **Project settings > Service accounts > Generate new private key**. Upload that JSON to Render as a **Secret File** named `firebase-service-account.json`. Do not place it in the repository.
4. Add these Render environment variables:

| Name | Value |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | `c9ide1cv` |
| `CLOUDINARY_API_KEY` | From Cloudinary Settings > API Keys |
| `CLOUDINARY_API_SECRET` | From Cloudinary Settings > API Keys |
| `FIREBASE_PROJECT_ID` | `reshare-13234` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/firebase-service-account.json` |

5. Verify `https://<your-service>.onrender.com/health` returns `{ "status": "ok" }`. Set that HTTPS origin as `RESHARE_IMAGE_API_BASE_URL` in both Debug and Release settings of `ReShare.xcodeproj/project.pbxproj`; no Cloudinary key goes in Xcode.

Render Free may sleep after 15 minutes idle and take roughly a minute to start on the next request. Plan to wake the service before a live demo. Do not treat `/health` as proof that Cloudinary or Firebase credentials are valid; perform an authenticated image upload on a test account too.

## Security boundary

- Every API request except `/health` verifies a Firebase ID token with revocation check.
- A signed intent is scoped to one UID, one record, one image ID and one delivery type. At most six intents are issued per record and 60 new intents per UID per UTC day.
- Catalog images use public `upload` delivery. Donation images use `authenticated` delivery and a five-minute read URL. `warehouse_admin` cannot read donation images until trusted warehouse assignment is implemented.
- The backend keeps intent/limit records in Firestore collections `image_upload_batches` and `image_upload_quotas`; these are server-only under the current Rules.
- Cleanup checks that the caller owns the intent and that the image is not attached to a published document. A scheduled orphan cleanup and an atomic image finalization workflow are still needed before production use at scale.
