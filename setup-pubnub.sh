#!/bin/bash

# PubNub Setup Script for Trivia Quiz
# This script helps you create a .env file with your PubNub keys

echo "🎮 Multi-Choice Quiz - PubNub Setup"
echo "===================================="
echo ""
echo "This script will help you set up your PubNub keys for the trivia quiz app."
echo ""
echo "📋 Before starting:"
echo "1. Go to https://admin.pubnub.com"
echo "2. Create an account or log in"
echo "3. Create a new app or select an existing one"
echo "4. Copy your Publish Key and Subscribe Key"
echo ""

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists!"
    echo "Current contents:"
    echo "=================="
    cat .env
    echo "=================="
    echo ""
    read -p "Do you want to overwrite it? (y/N): " overwrite
    if [[ $overwrite != "y" && $overwrite != "Y" ]]; then
        echo "Setup cancelled."
        exit 0
    fi
    echo ""
fi

# Get Publish Key
echo "📤 Enter your PubNub Publish Key:"
echo "(Should start with 'pub-c-')"
read -p "Publish Key: " publish_key

if [[ $publish_key != pub-c-* ]]; then
    echo "⚠️  Warning: Publish key should start with 'pub-c-'"
    read -p "Continue anyway? (y/N): " continue_anyway
    if [[ $continue_anyway != "y" && $continue_anyway != "Y" ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Get Subscribe Key
echo ""
echo "📥 Enter your PubNub Subscribe Key:"
echo "(Should start with 'sub-c-')"
read -p "Subscribe Key: " subscribe_key

if [[ $subscribe_key != sub-c-* ]]; then
    echo "⚠️  Warning: Subscribe key should start with 'sub-c-'"
    read -p "Continue anyway? (y/N): " continue_anyway
    if [[ $continue_anyway != "y" && $continue_anyway != "Y" ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Optional: Custom User ID
echo ""
echo "👤 (Optional) Enter a custom User ID:"
echo "(Leave blank to auto-generate)"
read -p "User ID: " user_id

# Create .env file
echo ""
echo "📝 Creating .env file..."

cat > .env << EOF
# PubNub Configuration for Multi-Choice Quiz
# Generated on $(date)

# Your PubNub Publish Key
VITE_PUBNUB_PUBLISH_KEY=$publish_key

# Your PubNub Subscribe Key  
VITE_PUBNUB_SUBSCRIBE_KEY=$subscribe_key
EOF

# Add user ID if provided
if [ ! -z "$user_id" ]; then
    echo "" >> .env
    echo "# Custom User ID" >> .env
    echo "VITE_PUBNUB_USER_ID=$user_id" >> .env
fi

echo ""
echo "✅ .env file created successfully!"
echo ""
echo "📁 File contents:"
echo "=================="
cat .env
echo "=================="
echo ""
echo "🚀 Next steps:"
echo "1. Run: npm run dev"
echo "2. Open http://localhost:5173"
echo "3. Your app will now use your PubNub keys instead of demo keys"
echo ""
echo "🔒 Security note:"
echo "- Your .env file is already in .gitignore"
echo "- Never commit your keys to version control"
echo ""
echo "Happy quizzing! 🎯"


