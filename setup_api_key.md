# Cara Mendapatkan dan Mengatur API Key untuk Gemini 2.5 Pro

## 1. Mendapatkan API Key dari Google Cloud Console

### Langkah-langkah:
1. Buka Google Cloud Console: https://console.cloud.google.com/apis/credentials
2. Pilih project Anda (atau buat project baru jika belum ada)
3. Klik **"Create Credentials"** > **"API Key"**
4. Copy API key yang dihasilkan
5. (Opsional) Klik **"Restrict Key"** untuk membatasi penggunaan API key

### Catatan:
- API key ini akan digunakan untuk autentikasi ke Vertex AI API
- Pastikan API key memiliki akses ke Vertex AI API

## 2. Mengatur API Key

### Opsi 1: Environment Variable (Sementara - hanya untuk session ini)
```bash
export GOOGLE_API_KEY='your-api-key-here'
```

### Opsi 2: Tambahkan ke Shell Profile (Permanen)
```bash
# Untuk bash
echo 'export GOOGLE_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc

# Untuk zsh
echo 'export GOOGLE_API_KEY="your-api-key-here"' >> ~/.zshrc
source ~/.zshrc
```

### Opsi 3: Tambahkan ke .env File (Rekomendasi)
```bash
# Di project directory
echo 'GOOGLE_API_KEY=your-api-key-here' >> /home/senarokalie/Desktop/claude/src/vtx_cli/.env

# Atau di home directory (untuk semua project)
mkdir -p ~/.gemini
echo 'GOOGLE_API_KEY=your-api-key-here' >> ~/.gemini/.env
```

## 3. Verifikasi API Key

Setelah mengatur API key, verifikasi dengan:
```bash
echo $GOOGLE_API_KEY
# Seharusnya menampilkan API key Anda (atau kosong jika belum di-set)
```

## 4. Alternatif: Menggunakan Bearer Token

Jika tidak ingin menggunakan API key, Anda bisa menggunakan bearer token:
```bash
gcloud auth application-default login
```

Dengan bearer token, aplikasi akan otomatis menggunakan autentikasi OAuth2.
