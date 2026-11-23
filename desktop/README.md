# sosyalmedya — Windows masaüstü uygulaması

Postiz'i hiçbir şey kurmadan, tek bir kurulum dosyasıyla Windows'ta çalıştırır.
Docker, Node.js, veritabanı vb. gerekmez; hepsi kurulumun içindedir.

## Kullanıcı için

1. [Releases](../../releases) sayfasından `sosyalmedya-kurulum-x.y.z.exe` dosyasını indirin.
2. Çift tıklayın. Windows "Bilgisayarınız korundu" derse **Ek bilgi → Yine de çalıştır**'a basın
   (dosya imzalı olmadığı için bu uyarı çıkar).
3. Kurulum bitince sosyalmedya açılır, ilk açılış birkaç dakika sürebilir.
   Hazır olunca tarayıcınızda `http://localhost:4007` açılır; orada hesap oluşturun.
4. Sosyal ağ hesaplarını bağlamak için sağ alttaki simgeye sağ tıklayın →
   **Sosyal ağ anahtarları**. Her ağın geliştirici sayfasına giden bir düğme ve
   kopyalanacak yönlendirme adresi orada.

Zamanlanmış gönderiler, bilgisayar açık ve sosyalmedya çalışırken paylaşılır.
Varsayılan olarak Windows açılınca arka planda kendiliğinden başlar.

Veriler `%LOCALAPPDATA%\sosyalmedya\data` klasöründe durur; programı kaldırmak verileri silmez.

## Nasıl çalışır

`sosyalmedya.exe` (Electron) şunları kendi başlatır ve kapatır:

| Parça | Ne işe yarar | Port (yalnızca bu bilgisayar) |
|---|---|---|
| PostgreSQL | veritabanı | 54329 |
| Redis | önbellek | 63799 |
| Temporal (`temporal server start-dev`) | gönderi zamanlayıcı | 17233 |
| Postiz backend / orchestrator / frontend | uygulamanın kendisi | 13000 / 13002 / 14200 |
| Dahili proxy (nginx yerine) | tarayıcının açtığı adres | 4007 |

Hiçbir port dışarıya açılmaz (`src/loopback.js`), bu yüzden Windows güvenlik duvarı uyarısı çıkmaz.

## Derleme

Her şey GitHub Actions'ta Windows üzerinde derlenir: `.github/workflows/desktop-windows.yml`.

- `desktop` dalına gönderilen her değişiklik kurulum dosyasını derler, temiz bir Windows'a kurar,
  uygulamayı iki kez açıp kayıt, giriş, medya yükleme ve zamanlayıcı bağlantısını dener, sonra kaldırır.
  Kurulum dosyası işin "Artifacts" bölümünden indirilebilir.
- `desktop-v1.2.3` biçiminde bir etiket gönderilirse aynı işlem yapılır ve dosya bir Release olarak yayınlanır.

Arayüzdeki "Postiz" adı ve logosu derleme sırasında `scripts/rebrand.mjs` ile değiştirilir;
kaynak koddaki asıl metinlere dokunulmaz, böylece Postiz güncellemeleri kolayca alınabilir.

## Lisans

Postiz (gitroomhq/postiz-app) üzerine kuruludur ve AGPL-3.0 ile dağıtılır.
