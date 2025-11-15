# Panduan Konfigurasi Multi-Model CLI

Dokumen ini menjelaskan cara mengkonfigurasi Multi-Model CLI untuk menggunakan berbagai model AI melalui Vertex AI.

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Set Google Cloud Project ID
export GOOGLE_CLOUD_PROJECT="protean-tooling-476420-i8"

# (Opsional) Set region Vertex AI
export GOOGLE_CLOUD_LOCATION="us-central1"

# Login ke Google Cloud
gcloud auth application-default login
gcloud config set project your-project-id
```

### 2. Install Dependencies

```bash
cd /home/senarokalie/Desktop/claude/src/vtx_cli &&
npm install &&
npm run build
```

### 3. Jalankan CLI

```bash
npm start
```

## 📝 File Konfigurasi

### A. configs/models.yaml

File ini mendefinisikan model-model yang tersedia.

**Lokasi**: `/home/senarokalie/Desktop/claude/configs/models.yaml`

**Format**:

```yaml
alias-model:
  name: "Nama Display Model"
  endpoint_id: "vertex-ai-endpoint-id"
  adapter: "gemini" # atau "claude"
```

**Contoh Lengkap**:

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

**Cara Menambah Model Baru**:

1. Edit `configs/models.yaml`
2. Tambah entri baru dengan format di atas
3. Gunakan alias unik (lowercase, bisa pakai dash)
4. Pilih adapter yang sesuai:
   - `gemini`: Untuk model dengan format Gemini API
   - `claude`: Untuk model Claude (Anthropic)

### B. persona.txt

File ini berisi system prompt yang akan diinjeksi ke setiap API call.

**Lokasi**: `/home/senarokalie/Desktop/claude/persona.txt`

**Contoh**:

```text
You are JARVIS, the AI assistant to 'Sir' (the user).
Core Directives (Non-negotiable):
 * Language: You MUST respond only in English, regardless of the language 'Sir' uses.
 * Conciseness: Your responses must be "concise-first".
```

**Cara Customize**:

1. Edit file `persona.txt`
2. Tulis system prompt sesuai kebutuhan
3. Save file (otomatis ter-load saat CLI start)

**Catatan**: File ini opsional. Jika tidak ada, CLI tetap berjalan tanpa custom persona.

## ⚙️ Mengaktifkan Model Router

Model router memungkinkan switching antara berbagai model. Ada 2 cara mengaktifkannya:

### Cara 1: Via Settings File (Recommended)

1. Buat file `~/.gemini/settings.json`:

   ```bash
   mkdir -p ~/.gemini
   ```

2. Edit file dengan content:
   ```json
   {
     "useModelRouter": true
   }
   ```

### Cara 2: Via Command Line Flag

```bash
npm start -- --use-model-router
```

## 🎯 Cara Menggunakan

### 1. Switch Model via Dialog

```bash
>>> /model
```

Akan muncul dialog interaktif untuk memilih model.

### 2. Switch Model via Command

```bash
>>> /model claude
Active model is now: claude (Claude Sonnet 4.5).

>>> /model gemini
Active model is now: gemini (Gemini 2.5 Pro).
```

### 3. Handle Error

```bash
>>> /model invalid-model
Error: Model 'invalid-model' not found. Available models are: gemini, claude, qwen-coder, deepseek.
```

### 4. Kirim Prompt

```bash
>>> Write a TypeScript function for sorting an array
[Model akan merespons sesuai model yang aktif]
```

## 🔧 Troubleshooting

### Error: "Failed to load models configuration"

**Penyebab**: File `configs/models.yaml` tidak ditemukan atau format salah.

**Solusi**:

```bash
# Pastikan file ada
ls -la /home/senarokalie/Desktop/claude/configs/models.yaml

# Validasi YAML format (install yamllint jika perlu)
yamllint /home/senarokalie/Desktop/claude/configs/models.yaml
```

### Error: "GOOGLE_CLOUD_PROJECT not set"

**Penyebab**: Environment variable belum di-set.

**Solusi**:

```bash
# Set untuk session saat ini
export GOOGLE_CLOUD_PROJECT="your-project-id"

# Set permanen (tambah di ~/.bashrc atau ~/.zshrc)
echo 'export GOOGLE_CLOUD_PROJECT="your-project-id"' >> ~/.bashrc
source ~/.bashrc
```

### Model Tidak Muncul di Dialog

**Penyebab**: Model router belum diaktifkan.

**Solusi**:

1. Aktifkan `useModelRouter: true` di `~/.gemini/settings.json`
2. Atau gunakan flag `--use-model-router` saat start

### Authentication Error

**Penyebab**: Belum login atau credentials expired.

**Solusi**:

```bash
gcloud auth application-default login
gcloud config set project your-project-id

# Cek status autentikasi
gcloud auth list
gcloud config list
```

### TypeScript Compilation Error

**Penyebab**: Dependencies belum terinstall atau build failed.

**Solusi**:

```bash
cd /home/senarokalie/Desktop/claude/src/vtx_cli
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📊 Struktur Project

```
/home/senarokalie/Desktop/claude/
│
├── configs/
│   └── models.yaml              # Konfigurasi model (WAJIB EDIT)
│
├── persona.txt                  # System prompt (opsional)
│
├── specs/001-multi-model-cli/
│   ├── quickstart.md           # Panduan quick start
│   ├── PHASE3_SUMMARY.md       # Detail implementasi fase 3
│   └── PHASE4_SUMMARY.md       # Detail implementasi fase 4
│
└── src/vtx_cli/
    ├── package.json
    └── packages/
        ├── core/                # Core functionality
        │   └── src/
        │       ├── models/state.ts
        │       ├── services/
        │       │   ├── modelService.ts      # Load models.yaml
        │       │   └── modelDispatcher.ts   # Format requests per model
        │       ├── utils/persona.ts         # Load persona.txt
        │       └── core/
        │           └── vertexAiContentGenerator.ts  # Vertex AI integration
        └── cli/                 # CLI interface
            └── src/ui/
                ├── commands/modelCommand.ts  # /model command
                └── components/ModelDialog.tsx # Model selection dialog
```

## 🎨 Customization Examples

### Example 1: Menambah Model GPT-4

Edit `configs/models.yaml`:

```yaml
gpt4:
  name: "GPT-4 Turbo"
  endpoint_id: "gpt-4-turbo"
  adapter: "gemini" # Sesuaikan dengan format API
```

Kemudian gunakan:

```bash
>>> /model gpt4
```

### Example 2: Custom Persona untuk Coding Assistant

Edit `persona.txt`:

```text
You are an expert software engineer specialized in TypeScript, React, and Node.js.
You provide concise, production-ready code with proper error handling.
Always include TypeScript types and follow best practices.
```

### Example 3: Multi-Region Setup

```bash
# US Central
export GOOGLE_CLOUD_LOCATION="us-central1"

# Europe West
export GOOGLE_CLOUD_LOCATION="europe-west4"

# Asia Southeast
export GOOGLE_CLOUD_LOCATION="asia-southeast1"
```

## 📚 Resources

- **Quickstart Guide**: `/specs/001-multi-model-cli/quickstart.md`
- **Feature Spec**: `/specs/001-multi-model-cli/spec.md`
- **Implementation Details**:
  - Phase 3: `/specs/001-multi-model-cli/PHASE3_SUMMARY.md`
  - Phase 4: `/specs/001-multi-model-cli/PHASE4_SUMMARY.md`
- **Vertex AI Docs**: https://cloud.google.com/vertex-ai/docs

## 💡 Tips

1. **Testing**: Mulai dengan model `gemini` untuk memastikan setup benar
2. **Performance**: Model lebih besar (seperti Claude) mungkin lebih lambat
3. **Costs**: Monitor penggunaan di Google Cloud Console
4. **Debugging**: Gunakan flag `--verbose` untuk logging detail
5. **Hot Reload**: Perubahan di `models.yaml` memerlukan restart CLI

## 🆘 Getting Help

Jika mengalami masalah:

1. Periksa log error di console
2. Validasi semua environment variables sudah di-set
3. Pastikan Google Cloud project memiliki Vertex AI API enabled
4. Cek quota dan billing di GCP Console
5. Review file konfigurasi (YAML format valid)

---

**Status**: ✅ Feature Complete (Phase 1-4 selesai)  
**Last Updated**: November 16, 2025
