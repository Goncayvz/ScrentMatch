# ScentMatch

Parfüm kataloğu CSV dosyasından ve MAD Parfüm’ün herkese açık indirimli ürün
listesinden yüklenir. MAD ürün görselleri, bağlantıları ve fiyatları yerel
`data/mad-perfumes.json` kataloğundan sunulur; bu nedenle her ziyaretçide MAD
sayfalarına istek atılmaz. MAD ürünlerinin nota, cinsiyet ve koku ailesi
bilgileri de bu yerel kataloğa dahildir. CSV parfümlerinde eksik bilgiler
Fragrantica.fr’den alınmaya çalışılır; bulunamayan mevcut görseller için
Parfumo yedek kaynağı kullanılmaya devam eder.

MAD kataloğunu güncellemek için `npm run sync:mad` komutunu çalıştırın. Komut
MAD’in herkese açık kampanya sayfalarını sırayla okur ve dosyayı tamamlandıktan
sonra güvenli biçimde yeniler; erişim engeli veya istek sınırı oluşursa hata
verir ve mevcut katalog dosyasını korur.

Fragrantica ve Parfumo sayfalarına canlı erişim Jina Reader üzerinden
sağlandığından bu kaynaklardan eksik bilgi aramak için internet bağlantısı
gerekir.
