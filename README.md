# ChatWithHistory — pulsuz versiya (Gemini pulsuz kvotası + pulsuz hostinq)

## 1. Pulsuz açar
https://aistudio.google.com saytına Google hesabı ilə girin → **Get API key**. Kart tələb olunmur.
Pulsuz kvota yalnız bir sıra Flash modellər üçündür. Hansı modelin pulsuz olduğunu və limitləri
AI Studio-da layihənizin "Rate limits" bölməsində görürsünüz. Model adı fərqlidirsə, `GEMINI_MODEL` dəyişəni ilə dəyişin.

## 2. Kompüterdə yoxlama
```
npm install
GEMINI_API_KEY=açarınız npm start        # Windows: set GEMINI_API_KEY=açarınız && npm start
```
http://localhost:3000

## 3. Pulsuz hostinq (Render.com)
1. Qovluğu GitHub-a yükləyin.
2. Render → New → Web Service → repo → Free plan. Build: `npm install`, Start: `npm start`.
3. Environment: `GEMINI_API_KEY` əlavə edin.
4. Hazır linkiniz: `https://ad.onrender.com`. Öz domeniniz üçün Settings → Custom Domains (domenin özü pulsuz deyil).

## Bilmək lazım olanlar
- Pulsuz Render xidməti hərəkətsizlikdən sonra yatır, ilk açılış 30–60 san çəkə bilər.
- Gemini pulsuz kvotası **bütün ziyarətçilər üçün ortaqdır**. Çox adam girəndə "çox sorğu" xətası çıxa bilər, bir az sonra düzəlir.
- Google pulsuz səviyyədəki sorğuları məhsullarını yaxşılaşdırmaq üçün istifadə edə bilər. Ziyarətçilərə bunu bildirmək məsləhətdir.
- Açar yalnız serverdə qalır. `RATE_LIMIT` IP başına limiti məhdudlaşdırır.
