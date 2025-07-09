// api/index.js

const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcryptjs'); // لتشفير كلمات المرور
const jwt = require('jsonwebtoken'); // لإنشاء رموز الجلسات (Tokens)
const dotenv = require('dotenv'); // لتحميل متغيرات البيئة (مثل رابط MongoDB السري)

dotenv.config(); // تحميل متغيرات البيئة من ملف .env (ستحتاج لإنشاء ملف .env في المجلد الرئيسي)

const app = express();
app.use(express.json()); // لتمكين Express من قراءة بيانات JSON المرسلة في الطلبات

// **إعدادات MongoDB:**
// **هام جداً: هذا الرابط يجب أن يكون متغير بيئة (Environment Variable) في Vercel وليس هنا مباشرة.**
// **في Vercel Dashboard، اذهب إلى Project Settings -> Environment Variables وأضف MONGODB_URI.**
const MONGODB_URI = process.env.MONGODB_URI; 
const DB_NAME = "mr_mahmoud_hamad_db"; // اسم قاعدة البيانات بتاعتك في MongoDB
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key_please_change_this_in_production"; // مفتاح سري للتشفير، يجب تغييره

// إنشاء عميل MongoDB
const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let dbInstance; // لتخزين كائن قاعدة البيانات بعد الاتصال

// دالة للاتصال بقاعدة البيانات لمرة واحدة
async function connectToMongo() {
  if (dbInstance) {
    return dbInstance; // لو متصلين بالفعل، رجع الاتصال الموجود
  }
  try {
    await client.connect();
    console.log("تم الاتصال بـ MongoDB بنجاح!");
    dbInstance = client.db(DB_NAME);
    return dbInstance;
  } catch (error) {
    console.error("خطأ في الاتصال بـ MongoDB:", error);
    throw new Error("فشل الاتصال بقاعدة البيانات.");
  }
}

// **هنا ستبدأ بكتابة المسارات (Routes) والمنطق البرمجي لكل وظيفة من وظائف تطبيقك.**
// **تذكر: هذا الجزء هو هيكل، وليس كوداً كاملاً وآمناً.**

// ************************************************
// 1. مسار اختبار بسيط للتأكد أن السيرفر يعمل
// ************************************************
app.get('/api', (req, res) => {
  res.status(200).json({ message: "مرحباً بك في سيرفر منصة مستر محمود حمد على Vercel! السيرفر يعمل." });
});

// ************************************************
// 2. مسار تسجيل طالب جديد (هيكل)
// ************************************************
app.post('/api/student/register', async (req, res) => {
  const { fullName, studentNumber, parentNumber, password, confirmPassword, grade } = req.body;

  // ⚠️⚠️⚠️ هذا التحقق الأولي بسيط جداً، يجب إضافة تحقق كامل من البيانات، مثل:
  // - التحقق من صيغة البريد الإلكتروني (إذا استخدمت بريد بدلاً من رقم الطالب)
  // - التحقق من طول أرقام الهواتف
  // - التحقق من أن الصف الدراسي موجود
  if (!fullName || !studentNumber || !parentNumber || !password || !confirmPassword || !grade) {
    return res.status(400).json({ message: "الرجاء ملء جميع الحقول المطلوبة." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ message: "كلمة المرور وتأكيدها غير متطابقين." });
  }
  if (password.length < 6) { // مثال بسيط لقوة كلمة المرور
    return res.status(400).json({ message: "كلمة المرور يجب أن لا تقل عن 6 أحرف." });
  }

  try {
    const db = await connectToMongo();
    const studentsCollection = db.collection('students');

    // **التحقق إذا كان الطالب مسجلاً من قبل**
    const existingStudent = await studentsCollection.findOne({ studentNumber: studentNumber });
    if (existingStudent) {
      return res.status(409).json({ message: "رقم الطالب هذا مسجل بالفعل." });
    }

    // **تشفير كلمة المرور قبل حفظها (مهم جداً للأمان!)**
    const hashedPassword = await bcrypt.hash(password, 10); // 10 هو Salt rounds، قيمة آمنة

    const studentData = {
      fullName,
      studentNumber,
      parentNumber,
      password: hashedPassword, // حفظ كلمة المرور المشفرة
      grade,
      role: 'student', // تحديد دور المستخدم
      createdAt: new Date(),
      balance: 0 // رصيد المحفظة يبدأ من صفر
    };

    const result = await studentsCollection.insertOne(studentData);
    console.log("تم تسجيل الطالب:", result.insertedId);

    // ⚠️⚠️⚠️ في التطبيق الحقيقي، هنا ستقوم بإنشاء رمز (JWT Token) وإرساله للطالب لتسجيل الدخول تلقائياً
    // const token = jwt.sign({ userId: result.insertedId, role: 'student' }, JWT_SECRET, { expiresIn: '1h' });
    // res.status(201).json({ message: "تم التسجيل بنجاح.", token });

    res.status(201).json({ message: "تم التسجيل بنجاح. يمكنك الآن تسجيل الدخول." });

  } catch (error) {
    console.error("خطأ في تسجيل الطالب (API):", error);
    res.status(500).json({ message: "حدث خطأ غير معروف أثناء التسجيل." });
  }
});

// ************************************************
// 3. مسار تسجيل دخول المستخدم (طالب/دعم/مدرس) (هيكل)
// ************************************************
app.post('/api/auth/login', async (req, res) => {
  const { loginIdentifier, password, userType } = req.body; // loginIdentifier ممكن يكون رقم طالب، اسم دعم، اسم مدرس

  if (!loginIdentifier || !password || !userType) {
    return res.status(400).json({ message: "الرجاء ملء جميع الحقول المطلوبة وتسجيل نوع المستخدم." });
  }

  try {
    const db = await connectToMongo();
    let collection;
    let identifierField;
    let requiredRole;

    // تحديد المجموعة وحقل التعريف بناءً على نوع المستخدم
    if (userType === 'student') {
      collection = db.collection('students');
      identifierField = 'studentNumber'; // أو fullName حسب واجهة الدخول
      requiredRole = 'student';
    } else if (userType === 'support') {
      collection = db.collection('support_staff'); // ستحتاج لإنشاء هذه المجموعة في MongoDB
      identifierField = 'username'; // أو الاسم الثلاثي كما وصفته
      requiredRole = 'support';
    } else if (userType === 'teacher') {
      collection = db.collection('teachers'); // ستحتاج لإنشاء هذه المجموعة في MongoDB
      identifierField = 'username'; // أو الاسم 'Mahmoud only'
      requiredRole = 'teacher';
    } else {
      return res.status(400).json({ message: "نوع مستخدم غير صالح." });
    }

    const user = await collection.findOne({ [identifierField]: loginIdentifier });

    if (!user) {
      return res.status(401).json({ message: "بيانات الدخول غير صحيحة." });
    }

    // **التحقق من كلمة المرور المشفرة**
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "بيانات الدخول غير صحيحة." });
    }

    // **التحقق من الدور المطلوب (خاصة للمدرس والدعم)**
    if (user.role !== requiredRole) {
      return res.status(403).json({ message: "ليس لديك صلاحية الوصول لهذه الواجهة." });
    }

    // **إنشاء رمز (JWT Token) للجلسة الآمنة**
    const token = jwt.sign(
      { userId: user._id, role: user.role, studentNumber: user.studentNumber }, // البيانات التي ستوضع في التوكن
      JWT_SECRET,
      { expiresIn: '8h' } // صلاحية التوكن لمدة 8 ساعات
    );

    res.status(200).json({ message: "تم تسجيل الدخول بنجاح.", token, userRole: user.role });

  } catch (error) {
    console.error("خطأ في تسجيل الدخول (API):", error);
    res.status(500).json({ message: "حدث خطأ غير معروف أثناء تسجيل الدخول." });
  }
});


// ************************************************
// 4. مسار لرفع فيديو حصة (للمدرس فقط) (هيكل)
// ************************************************
// ⚠️⚠️⚠️ ملاحظة: رفع الملفات الكبيرة (مثل الفيديو) مباشرةً من Vercel Serverless Function قد يكون غير فعال.
// ⚠️⚠️⚠️ الأفضل استخدام خدمة تخزين سحابية مثل AWS S3 أو Cloudinary أو Firebase Storage
// ⚠️⚠️⚠️ وهذا يتطلب مكتبات إضافية ومنطقاً برمجياً معقداً هنا.
app.post('/api/teacher/upload-lesson', async (req, res) => {
  // ⚠️⚠️⚠️ هنا يجب إضافة التحقق من صلاحية المدرس (عن طريق JWT Token المرسل في الـ Header)
  // ⚠️⚠️⚠️ هذا يتطلب Middleware للتحقق من التوكن
  // const token = req.headers.authorization.split(' ')[1];
  // const decoded = jwt.verify(token, JWT_SECRET);
  // if (decoded.role !== 'teacher') return res.status(403).json({ message: 'غير مصرح لك برفع الفيديوهات.' });

  const { title, price, description, grade, videoUrl, pdfUrl, homeworkUrl, homeworkSolutionUrl, examQuestions } = req.body;

  if (!title || !price || !videoUrl || !grade || !examQuestions) {
    return res.status(400).json({ message: "الرجاء توفير البيانات الأساسية للحصة." });
  }

  try {
    const db = await connectToMongo();
    const lessonsCollection = db.collection('lessons'); // مجموعة للحصص

    const newLesson = {
      title,
      price,
      description,
      grade,
      videoUrl,
      pdfUrl,
      homeworkUrl,
      homeworkSolutionUrl,
      examQuestions, // هنا ستحتاج لتخزين الأسئلة بالصيارات والإجابات الصحيحة
      uploadedBy: "معرف_المدرس", // يجب ربطها بمعرف المدرس الذي يرفعها
      uploadedAt: new Date()
    };

    const result = await lessonsCollection.insertOne(newLesson);
    res.status(201).json({ message: "تم رفع الحصة بنجاح.", lessonId: result.insertedId });

  } catch (error) {
    console.error("خطأ في رفع الحصة (API):", error);
    res.status(500).json({ message: "حدث خطأ غير معروف أثناء رفع الحصة." });
  }
});

// ************************************************
// 5. مسار جلب الفيديوهات/الحصص للطلاب (هيكل)
// ************************************************
app.get('/api/student/lessons', async (req, res) => {
  const { grade } = req.query; // ممكن تجلب الحصص حسب الصف الدراسي

  try {
    const db = await connectToMongo();
    const lessonsCollection = db.collection('lessons');

    let query = {};
    if (grade) {
      query.grade = grade;
    }

    const lessons = await lessonsCollection.find(query).toArray();
    res.status(200).json(lessons);

  } catch (error) {
    console.error("خطأ في جلب الحصص (API):", error);
    res.status(500).json({ message: "حدث خطأ غير معروف أثناء جلب الحصص." });
  }
});


// ⚠️⚠️⚠️ تحتاج لإضافة المزيد من المسارات لكل وظيفة أخرى في تطبيقك، مثل:
// - /api/student/wallet/charge (شحن المحفظة)
// - /api/student/wallet/history (سجل المحفظة)
// - /api/student/submit-exam (تسليم الامتحان وتصحيحه)
// - /api/student/chat/send (إرسال رسائل دعم)
// - /api/support/payments/confirm (تأكيد الدفع من الدعم)
// - /api/teacher/manage-subscriptions (إدارة الاشتراكات)
// - وهكذا...

// تصدير التطبيق عشان Vercel يقدر يشغله كدالة سحابية
module.exports = app;
