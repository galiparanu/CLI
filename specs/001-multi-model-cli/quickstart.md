# Quickstart: Multi-Model CLI

Panduan ini menjelaskan cara mengonfigurasi dan menjalankan Multi-Model CLI.

## Prerequisites

1. **Node.js**: Pastikan Node.js versi 20.0.0 atau lebih baru terinstal
2. **Google Cloud SDK**: Install `gcloud` CLI dan lakukan autentikasi:
   ```bash
   gcloud auth application-default login
   ```
3. **Google Cloud Project**: Project GCP dengan Vertex AI API yang sudah diaktifkan

## Instalasi

1. **Clone Repository**:
   ```bash
   cd /home/senarokalie/Desktop/claude/src/vtx_cli
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build Project**:
   ```bash
   npm run build
   ```

## Konfigurasi

### 1. Environment Variables

Set environment variables yang diperlukan:

```bash
# Project ID Google Cloud Anda
export GOOGLE_CLOUD_PROJECT="your-project-id"

# Region Vertex AI (opsional, default: us-central1)
export GOOGLE_CLOUD_LOCATION="us-central1"

# Aktifkan model router untuk multi-model support
# Set di file konfigurasi CLI atau via flag
```

### 2. Model Configuration (configs/models.yaml)

File `configs/models.yaml` sudah dibuat dengan konfigurasi default:

```yaml
gemini:
  name: "Gemini 2.5 Pro"
  endpoint_id: "gemini-2.5-pro"
  adapter: "gemini"

claude:
  name: "Claude Sonnet 4.5"
  endpoint_id: "claude-3-5-sonnet-v2@20241022"
  adapter: "claude"

qwen-coder:
  name: "Qwen2.5-Coder-32B"
  endpoint_id: "qwen2.5-coder-32b-instruct"
  adapter: "gemini"

deepseek:
  name: "DeepSeek-V3"
  endpoint_id: "deepseek-v3"
  adapter: "gemini"
```

**Penjelasan Field**:
- `name`: Nama lengkap model untuk display
- `endpoint_id`: ID endpoint Vertex AI yang sebenarnya
- `adapter`: Adapter yang digunakan (`gemini` atau `claude`)

**Cara Menambah Model Baru**:
```yaml
model-alias:
  name: "Display Name"
  endpoint_id: "vertex-ai-endpoint-id"
  adapter: "gemini"  # atau "claude"
```

### 3. Persona Configuration (persona.txt)

File `persona.txt` berisi system prompt JARVIS yang akan diinjeksi ke semua API call:

```text
You are JARVIS, the AI assistant to 'Sir' (the user).
Core Directives (Non-negotiable):
 * Language: You MUST respond only in English...
 * Conciseness: Your responses must be "concise-first"...
```

**Untuk Mengubah Persona**:
Edit file `/home/senarokalie/Desktop/claude/persona.txt` sesuai kebutuhan.

### 4. Mengaktifkan Model Router

Untuk mengaktifkan multi-model support, Anda perlu mengaktifkan model router di konfigurasi CLI.

**Cara 1 - Via Settings File** (Recommended):

Buat atau edit file konfigurasi CLI di `~/.gemini/settings.json`:
```json
{
  "useModelRouter": true
}
```

**Cara 2 - Via Flag** (saat menjalankan CLI):
```bash
npm start -- --use-model-router
```

## Menjalankan CLI

### 1. Start Interactive Mode

```bash
cd /home/senarokalie/Desktop/claude/src/vtx_cli
npm start
```

Anda akan melihat prompt `>>>`.

### 2. Menggunakan Multi-Model Features

#### a. Melihat/Memilih Model (Dialog)

```bash
>>> /model
```
Ini akan membuka dialog interaktif untuk memilih model.

#### b. Switch Model Langsung (Command Line)

```bash
>>> /model claude
Active model is now: claude (Claude Sonnet 4.5).
```

#### c. Cek Model yang Tersedia

Jika Anda mencoba model yang tidak valid:
```bash
>>> /model invalid
Error: Model 'invalid' not found. Available models are: gemini, claude, qwen-coder, deepseek.
```

### 3. Mengirim Prompt

Setelah memilih model, kirim prompt seperti biasa:

```bash
>>> Create a TypeScript function for fibonacci
```

CLI akan menampilkan respons dari model yang aktif saat ini.

## Troubleshooting

### Error: Failed to load models configuration

**Penyebab**: File `configs/models.yaml` tidak ditemukan atau format salah.

**Solusi**:
1. Pastikan file ada di `/home/senarokalie/Desktop/claude/configs/models.yaml`
2. Periksa format YAML valid (gunakan YAML validator)
3. Pastikan path relative benar dari direktori kerja CLI

### Error: GOOGLE_CLOUD_PROJECT not set

**Penyebab**: Environment variable untuk GCP project belum di-set.

**Solusi**:
```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
```

Atau tambahkan di file `.bashrc` / `.zshrc` untuk permanen.

### Model tidak muncul di dialog

**Penyebab**: Model router belum diaktifkan.

**Solusi**: Aktifkan `useModelRouter: true` di settings atau gunakan flag `--use-model-router`.

### Authentication Error

**Penyebab**: Belum login ke Google Cloud.

**Solusi**:
```bash
gcloud auth application-default login
gcloud config set project your-project-id
```

## Struktur File Konfigurasi

```
/home/senarokalie/Desktop/claude/
├── configs/
│   └── models.yaml          # Konfigurasi model
├── persona.txt              # System prompt JARVIS
└── src/vtx_cli/
    ├── package.json
    └── packages/
        ├── core/
        │   └── src/
        │       ├── models/state.ts
        │       ├── services/
        │       │   ├── modelService.ts
        │       │   └── modelDispatcher.ts
        │       └── utils/persona.ts
        └── cli/
            └── src/ui/commands/modelCommand.ts
```

## Tips Penggunaan

1. **Model Default**: Tanpa konfigurasi router, CLI menggunakan Gemini by default
2. **Persona Opsional**: Jika `persona.txt` tidak ada, CLI tetap berjalan tanpa custom system prompt
3. **Hot Reload**: Perubahan di `models.yaml` memerlukan restart CLI
4. **Testing**: Gunakan model `gemini` terlebih dahulu untuk memastikan setup benar

## Contoh Workflow

```bash
# 1. Set environment
export GOOGLE_CLOUD_PROJECT="my-gcp-project"

# 2. Start CLI
cd /home/senarokalie/Desktop/claude/src/vtx_cli
npm start

# 3. Di dalam CLI
>>> /model claude                    # Switch ke Claude
>>> Explain quantum computing        # Kirim prompt
>>> /model gemini                    # Switch ke Gemini
>>> Write a React component         # Kirim prompt lain
```

## Next Steps

- Lihat [PHASE3_SUMMARY.md](PHASE3_SUMMARY.md) untuk detail implementasi
- Lihat [PHASE4_SUMMARY.md](PHASE4_SUMMARY.md) untuk fitur validasi
- Baca spec lengkap di [spec.md](spec.md)

