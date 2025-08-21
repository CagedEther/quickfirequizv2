# PubNub Configuration Setup

## Step 1: Create .env file

Create a `.env` file in the project root with your PubNub keys:

```env
# PubNub Configuration
# Get your keys from https://admin.pubnub.com

# Your PubNub Publish Key
VITE_PUBNUB_PUBLISH_KEY=pub-c-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Your PubNub Subscribe Key  
VITE_PUBNUB_SUBSCRIBE_KEY=sub-c-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Step 2: Replace the x's with your actual keys

1. Go to [PubNub Admin Portal](https://admin.pubnub.com)
2. Select your app or create a new one
3. Copy your Publish Key and Subscribe Key
4. Replace the values in your `.env` file

## Step 3: Restart the dev server

After adding your keys, restart the development server:

```bash
npm run dev
```

## Security Notes

- ✅ The `.env` file is already in `.gitignore`
- ✅ Never commit your actual keys to version control
- ✅ Keys prefixed with `VITE_` are exposed to the browser (safe for client-side use)
- ⚠️  Never put secret keys in client-side environment variables

## Troubleshooting

If you see connection issues:
1. Verify your keys are correct
2. Check that your PubNub app has the required features enabled
3. Ensure you're using the client-side keys (not secret keys)


