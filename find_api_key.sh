#!/bin/bash
echo "=== Script Pencarian API Key ==="
echo ""

# Check environment variables
echo "1. Environment Variables:"
if [ -n "$GOOGLE_API_KEY" ]; then
    echo "   ✓ GOOGLE_API_KEY ditemukan (panjang: ${#GOOGLE_API_KEY} karakter)"
    echo "   Preview: ${GOOGLE_API_KEY:0:10}...${GOOGLE_API_KEY: -4}"
elif [ -n "$GEMINI_API_KEY" ]; then
    echo "   ✓ GEMINI_API_KEY ditemukan (panjang: ${#GEMINI_API_KEY} karakter)"
    echo "   Preview: ${GEMINI_API_KEY:0:10}...${GEMINI_API_KEY: -4}"
else
    echo "   ✗ Tidak ada API key di environment variables"
fi

echo ""
echo "2. .env Files:"
found=0
for env_file in .env ~/.env ~/.gemini/.env; do
    if [ -f "$env_file" ]; then
        echo "   Checking: $env_file"
        if grep -qi "GOOGLE_API_KEY\|GEMINI_API_KEY" "$env_file" 2>/dev/null; then
            echo "   ✓ API key ditemukan di $env_file"
            grep -i "GOOGLE_API_KEY\|GEMINI_API_KEY" "$env_file" | sed 's/=.*/=***REDACTED***/'
            found=1
        fi
    fi
done
if [ $found -eq 0 ]; then
    echo "   ✗ Tidak ada API key di .env files"
fi

echo ""
echo "3. Google Cloud Console:"
echo "   Untuk mendapatkan API key baru:"
echo "   1. Buka: https://console.cloud.google.com/apis/credentials"
echo "   2. Pilih project Anda"
echo "   3. Klik 'Create Credentials' > 'API Key'"
echo "   4. Copy API key yang dihasilkan"

echo ""
echo "4. Cara Menggunakan:"
echo "   export GOOGLE_API_KEY='your-api-key-here'"
echo "   # Atau tambahkan ke ~/.bashrc atau ~/.zshrc untuk persist"
