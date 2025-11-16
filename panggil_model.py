import os
import json
import requests
import google.auth
import google.auth.transport.requests

def panggil_model_vertex():
    """
    Mengimplementasikan panggilan API Vertex AI menggunakan Python,
    setara dengan perintah curl yang diberikan.
    """
    try:
        # --- 1. Konfigurasi ---
        # Variabel ini bisa Anda ubah atau ambil dari file konfigurasi
        PROJECT_ID = "protean-tooling-476420-i8"
        REGION = "us-south1" # Menggunakan region yang lebih umum
        ENDPOINT = f"{REGION}-aiplatform.googleapis.com"
        MODEL_ID = "gemini-1.0-pro"
        PROMPT = "What is the capital of Texas?"

        print(f"Mencoba memanggil model: {MODEL_ID}\n")

        # --- 2. Autentikasi ---
        # Secara otomatis mendapatkan kredensial dari lingkungan gcloud Anda
        print("Mengambil token autentikasi dari gcloud...")
        credentials, project = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        token = credentials.token
        print("✅ Token berhasil didapatkan.\n")

        # --- 3. Mempersiapkan Request ---
        # Membangun URL endpoint
        url = f"https://{ENDPOINT}/v1/projects/{PROJECT_ID}/locations/{REGION}/endpoints/openapi/chat/completions"

        # Mempersiapkan header
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        # Mempersiapkan data/payload
        data = {
            "model": MODEL_ID,
            "stream": False, # Diubah ke False agar lebih mudah menangani respons
            "messages": [{"role": "user", "content": PROMPT}]
        }
        
        print(f"Mengirim permintaan ke: {url}")
        print(f"Dengan prompt: \"{PROMPT}\"\n")

        # --- 4. Mengirim Request ---
        response = requests.post(url, headers=headers, json=data)
        
        # Memeriksa apakah ada error HTTP
        response.raise_for_status()

        # --- 5. Menampilkan Hasil ---
        print("--- Respons dari Model ---")
        print(json.dumps(response.json(), indent=2))
        print("\n✅ Permintaan berhasil diproses.")

    except google.auth.exceptions.DefaultCredentialsError:
        print("❌ GAGAL: Kredensial tidak ditemukan.")
        print("Pastikan Anda sudah menjalankan 'gcloud auth application-default login'.")
    except requests.exceptions.HTTPError as e:
        print(f"❌ GAGAL: Terjadi error HTTP {e.response.status_code}")
        print("--- Pesan Error dari Server ---")
        # Mencoba menampilkan pesan error dari Google
        print(json.dumps(e.response.json(), indent=2))
        print("\nSeperti yang diduga, ini kemungkinan besar karena proyek Anda belum memiliki akses ke model ini di Model Garden.")
        print("Silakan aktifkan model di Google Cloud Console terlebih dahulu.")
    except Exception as e:
        print(f"❌ GAGAL: Terjadi error yang tidak terduga: {e}")

if __name__ == "__main__":
    panggil_model_vertex()
