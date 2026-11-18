EGYPT CHAT - النسخة المحسّنة
=============================

الميزات:
- تسجيل الدخول وإنشاء الحساب بالبريد الإلكتروني.
- البحث عن الأشخاص بالـ Username والمحادثات الخاصة والمجموعات.
- حالة متصل الآن / آخر ظهور باستخدام Realtime Database Presence.
- علامة ✓ للإرسال، و✓✓ للاستلام، و✓✓ باللون الأزرق للقراءة.
- تسجيل وإرسال رسائل صوتية باستخدام ميكروفون المتصفح.
- إرسال الصور والملفات من خلال Firebase Storage.

إعداد Firebase (مرة واحدة):
1) افتح مشروع Firebase: egypt-956e1
2) Authentication > Sign-in method: فعّل Email/Password.
3) Realtime Database > Rules: الصق محتوى database.rules.json ثم Publish.
4) Storage: اضغط Get started لإنشاء Storage bucket إذا لم يكن موجودًا.
5) Storage > Rules: الصق محتوى storage.rules ثم Publish.
6) تأكد أن storageBucket في firebase-config.js مطابق تمامًا للقيمة في Project settings.

النشر:
- ارفع كل ملفات مجلد EGYPT_CHAT إلى جذر مستودع GitHub Pages.
- افتح الموقع من HTTPS (GitHub Pages يوفر HTTPS).
- بعد النشر حدّث الصفحة تحديثًا كاملًا.

ملاحظات مهمة:
- تسجيل الصوت يحتاج HTTPS وإذن الميكروفون، ويدعم المتصفح MediaRecorder.
- حد الصورة 12MB وحد الملف/الصوت 20MB.
- يتم حفظ الصور والصوت والملفات في Firebase Storage، وليس داخل Realtime Database.
- رسائل القراءة والاستلام تُحدّث من حساب المستلم فقط.
- روابط تنزيل الملفات في Firebase هي روابط حاملة لرمز وصول (download token). لا تشاركها خارج المحادثة.
- قواعد Storage تمنع الوصول المباشر عبر SDK لغير صاحب الملف، بينما رابط التنزيل المخزّن في الرسالة يعمل للطرف الآخر. للحصول على تحقق عضوية أقوى على مستوى Storage نفسه يلزم إضافة Firestore أو Cloud Functions كطبقة تفويض.

الحفاظ على البيانات:
- لا تحذف قاعدة البيانات الحالية.
- لا تغيّر Project ID أو databaseURL أو بيانات Firebase Authentication.
- نشر القواعد لا يمسح الرسائل أو الحسابات، لكنه يغيّر من يستطيع قراءتها وكتابتها.
