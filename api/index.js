require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For password hashing
// const multer = require('multer'); // سيتم إضافته لاحقاً لرفع الملفات
// const admin = require('firebase-admin'); // سيتم إضافته لاحقاً لرفع الملفات إلى Firebase

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

// ----------------------------------------------------
// MongoDB Connection
// ----------------------------------------------------
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not defined in environment variables.');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit process if cannot connect to DB
    });

// ----------------------------------------------------
// Firebase Admin SDK Initialization (سيتم تفعيله لاحقاً عند دمج رفع الملفات)
// ----------------------------------------------------
/*
// تأكد من وجود ملف serviceAccountKey.json في نفس مسار server.js
// يجب أن تحصل على هذا الملف من إعدادات مشروعك في Firebase -> Project settings -> Service accounts
// قم بتنزيله وتسميته serviceAccountKey.json
const serviceAccount = require('./serviceAccountKey.json'); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET // أضف هذا المتغير في Vercel (your-project-id.appspot.com)
});
const bucket = admin.storage().bucket();

// إعداد Multer لاستقبال الملفات (يخزنها مؤقتاً في الذاكرة)
const upload = multer({ storage: multer.memoryStorage() });

// دالة مساعدة لرفع الملف إلى Firebase Storage
async function uploadFileToFirebase(file) {
    const fileName = `${Date.now()}_${file.originalname.replace(/ /g, '_')}`;
    const fileUpload = bucket.file(fileName);
    const blobStream = fileUpload.createWriteStream({
        metadata: {
            contentType: file.mimetype
        }
    });

    return new Promise((resolve, reject) => {
        blobStream.on('error', (err) => {
            console.error('Firebase upload stream error:', err);
            reject(new Error('Firebase upload failed: ' + err.message));
        });
        blobStream.on('finish', () => {
            // جعل الملف متاحاً للقراءة العامة
            fileUpload.makePublic().then(() => {
                const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media`;
                resolve(publicUrl);
            }).catch(err => {
                console.error('Failed to make file public:', err);
                reject(new Error('Failed to get public URL: ' + err.message));
            });
        });
        blobStream.end(file.buffer);
    });
}
*/


// ----------------------------------------------------
// Mongoose Schemas & Models
// ----------------------------------------------------

// User Schema (Base for Student, Teacher, Support)
const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    password: { type: String, required: true },
    type: { type: String, enum: ['student', 'teacher', 'support'], required: true },
    createdAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now },
});

// Student Specific Fields
const studentSchema = new mongoose.Schema({
    studentNumber: { type: String, unique: true, sparse: true }, // sparse allows null values to not violate unique constraint
    parentNumber: { type: String },
    gradeLevel: { type: String, enum: ['first', 'second', 'third', 'all'], default: 'all' },
    balance: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String },
    bannedAt: { type: Date },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'bannedByType' }, // Reference to teacher/support who banned
    bannedByType: { type: String, enum: ['Teacher', 'SupportStaff'] }
}, { discriminatorKey: 'type' });

// Teacher Specific Fields (can be extended)
const teacherSchema = new mongoose.Schema({
    teacherCode: { type: String, unique: true, required: true },
    phoneNumber: { type: String, unique: true, required: true },
}, { discriminatorKey: 'type' });

// Support Staff Specific Fields
const supportStaffSchema = new mongoose.Schema({
    supportCode: { type: String, unique: true, required: true },
    isOnline: { type: Boolean, default: false },
    lastLogout: { type: Date },
}, { discriminatorKey: 'type' });

const User = mongoose.model('User', userSchema);
const Student = User.discriminator('student', studentSchema);
const Teacher = User.discriminator('teacher', teacherSchema);
const SupportStaff = User.discriminator('support', supportStaffSchema);


// Lesson Schema
const lessonSchema = new mongoose.Schema({
    title: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    grade: { type: String, enum: ['first', 'second', 'third', 'all'], required: true },
    coverImage: { type: String }, // Now storing URL
    videoFile: { type: String },  // Now storing URL
    pdfFile: { type: String },     // Now storing URL
    homeworkFile: { type: String }, // Now storing URL
    solutionFile: { type: String }, // Now storing URL
    homeworkSolutionVideo: { type: String }, // Now storing URL
    examQuestions: [{
        question: String,
        choices: [String],
        correctAnswer: Number
    }],
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});
const Lesson = mongoose.model('Lesson', lessonSchema);

// Subscription Schema
const subscriptionSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String }, // Now storing URL
    duration: { type: Number, required: true }, // in days
    includedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }], // Array of Lesson IDs
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
const Subscription = mongoose.model('Subscription', subscriptionSchema);

// Purchased Lesson/Subscription Schema
const purchasedItemSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'itemType' }, // Reference to Lesson or Subscription
    itemType: { type: String, required: true, enum: ['Lesson', 'Subscription'] },
    purchaseDate: { type: Date, default: Date.now },
    price: { type: Number, required: true },
    expiryDate: { type: Date } // For subscriptions
});
const PurchasedItem = mongoose.model('PurchasedItem', purchasedItemSchema);

// Transfer Request Schema (for Wallet)
const transferRequestSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, required: true },
    amount: { type: Number, required: true },
    paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', required: true },
    transactionNumber: { type: String, required: true },
    transferTime: { type: Date, required: true },
    message: { type: String },
    receiptImageKey: { type: String }, // Now storing URL
    status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending' },
    timestamp: { type: Date, default: Date.now },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportStaff' },
    confirmationDate: { type: Date }
});
const TransferRequest = mongoose.model('TransferRequest', transferRequestSchema);

// Payment Method Schema (for Teacher)
const paymentMethodSchema = new mongoose.Schema({
    name: { type: String, required: true },
    number: { type: String, required: true },
    password: { type: String, required: true }, // This will be hashed as well
    createdAt: { type: Date, default: Date.now }
});
const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);

// General Message Schema (from Teacher)
const generalMessageSchema = new mongoose.Schema({
    target: { type: String, enum: ['all', 'first', 'second', 'third'], required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    duration: { type: Number, required: true }, // in days
    priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
    createdAt: { type: Date, default: Date.now },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true }
});
const GeneralMessage = mongoose.model('GeneralMessage', generalMessageSchema);

// Book Schema
const bookSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    grade: { type: String, enum: ['first', 'second', 'third', 'all'], required: true },
    imageKey: { type: String }, // Now storing URL
    availability: { type: String, enum: ['available', 'limited', 'unavailable'], default: 'available' },
    createdAt: { type: Date, default: Date.now }
});
const Book = mongoose.model('Book', bookSchema);

// Book Order Schema
const bookOrderSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, required: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    bookName: { type: String, required: true },
    price: { type: Number, required: true },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    preferredBookstore: { type: String },
    status: { type: String, enum: ['pending', 'confirmed', 'shipped', 'cancelled'], default: 'pending' },
    timestamp: { type: Date, default: Date.now }
});
const BookOrder = mongoose.model('BookOrder', bookOrderSchema);

// Exam Result Schema
const examResultSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, required: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', required: true },
    lessonTitle: { type: String, required: true },
    score: { type: Number, required: true },
    correctAnswers: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    answers: [Number], // Storing choice index
    passed: { type: Boolean, required: true },
    timestamp: { type: Date, default: Date.now }
});
const ExamResult = mongoose.model('ExamResult', examResultSchema);

// Student Message (Question to Teacher) Schema
const studentMessageSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: { type: String, required: true },
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }, // Optional, if question not tied to specific lesson
    subject: { type: String, required: true },
    text: { type: String, required: true },
    imageKey: { type: String }, // Key for the image file in IndexedDB (frontend)
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    status: { type: String, enum: ['unread', 'read', 'replied'], default: 'unread' },
    replies: [{
        teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
        supportId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportStaff' },
        replyText: String,
        replyImageKey: String,
        replyAudioKey: String,
        timestamp: { type: Date, default: Date.now }
    }]
});
const StudentMessage = mongoose.model('StudentMessage', studentMessageSchema);

// Notification Schema (for Students)
const notificationSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    type: { type: String, enum: ['support', 'teacher', 'system', 'payment', 'exam', 'general'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isRead: { type: Boolean, default: false },
    canReply: { type: Boolean, default: false },
    relatedId: { type: mongoose.Schema.Types.ObjectId } // Optional: ID of related lesson, exam, etc.
});
const StudentNotification = mongoose.model('StudentNotification', notificationSchema);

// Reward History Schema
const rewardHistorySchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    points: { type: Number, required: true },
    reason: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const RewardHistory = mongoose.model('RewardHistory', rewardHistorySchema);

// Redeemed Reward Schema
const redeemedRewardSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    rewardId: { type: Number, required: true }, // e.g., 1 for free lesson, 2 for discount
    rewardName: { type: String, required: true },
    cost: { type: Number, required: true }, // points cost
    timestamp: { type: Date, default: Date.now }
});
const RedeemedReward = mongoose.model('RedeemedReward', redeemedRewardSchema);

// Support Activity Log Schema
const supportActivityLogSchema = new mongoose.Schema({
    supportId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportStaff', required: true },
    supportName: { type: String, required: true },
    action: { type: String, required: true }, // e.g., 'confirmed_payment', 'banned_student', 'replied_to_chat'
    details: mongoose.Schema.Types.Mixed, // Flexible field for any additional details
    timestamp: { type: Date, default: Date.now }
});
const SupportActivityLog = mongoose.model('SupportActivityLog', supportActivityLogSchema);

// ----------------------------------------------------
// API Endpoints
// ----------------------------------------------------

// Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is healthy' });
});

// Authentication
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, studentNumber, parentNumber, password, gradeLevel } = req.body;

        // Basic validation
        if (!fullName || !studentNumber || !parentNumber || !password || !gradeLevel) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        // Check if studentNumber or fullName already exists
        const existingStudent = await Student.findOne({ $or: [{ studentNumber: studentNumber }, { fullName: fullName }] });
        if (existingStudent) {
            return res.status(409).json({ message: 'Student with this number or name already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newStudent = new Student({
            fullName,
            studentNumber,
            parentNumber,
            password: hashedPassword,
            gradeLevel,
            type: 'student',
            balance: 0,
            points: 0,
            isBanned: false,
            createdAt: new Date(),
            lastActivity: new Date()
        });
        await newStudent.save();
        res.status(201).json({ message: 'Student registered successfully', studentId: newStudent._id }); // Returning _id as studentId
    } catch (error) {
        console.error('Student registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});

// START: NEW STUDENT LOGIN ENDPOINT
app.post('/api/auth/student-login', async (req, res) => {
    try {
        const { name, password } = req.body;

        const student = await Student.findOne({ fullName: name });

        if (!student) {
            return res.status(401).json({ message: 'Student not found.' });
        }

        const isMatch = await bcrypt.compare(password, student.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect password.' });
        }

        if (student.isBanned) {
            return res.status(403).json({ message: 'Your account has been banned.', banReason: student.banReason, bannedAt: student.bannedAt });
        }
        
        student.lastActivity = new Date();
        await student.save();

        res.status(200).json({ 
            message: 'Login successful', 
            user: { 
                id: student._id, // Send _id as id for frontend compatibility
                name: student.fullName, 
                type: 'student',
                gradeLevel: student.gradeLevel, // Ensure this matches frontend's expectation
                studentNumber: student.studentNumber,
                parentPhone: student.parentNumber, // Ensure this matches frontend's expectation
                balance: student.balance,
                points: student.points,
                isBanned: student.isBanned,
                banReason: student.banReason,
                bannedAt: student.bannedAt,
                createdAt: student.createdAt // Frontend uses registrationDate
            } 
        });
    } catch (error) {
        console.error('Student login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});
// END: NEW STUDENT LOGIN ENDPOINT

// For Teacher Login (Hardcoded for now as per your app.js)
app.post('/api/auth/teacher-login', async (req, res) => {
    const { name, code, phone } = req.body;

    // In a real application, you'd fetch teacher from DB and hash password
    const correctTeacher = {
        fullName: 'Mahmoud only',
        code: 'HHDV/58HR',
        phoneNumber: '01050747978'
    };

    if (name === correctTeacher.fullName && code === correctTeacher.code && phone === correctTeacher.phoneNumber) {
        // Find or create teacher in DB
        let teacher = await Teacher.findOne({ teacherCode: code });
        if (!teacher) {
            teacher = new Teacher({
                fullName: name,
                teacherCode: code,
                phoneNumber: phone,
                password: await bcrypt.hash('teacher_default_password', 10), // Dummy password for now
                type: 'teacher'
            });
            await teacher.save();
        }
        res.status(200).json({ message: 'Teacher login successful', user: { id: teacher._id, name: teacher.fullName, type: 'teacher' } });
    } else {
        res.status(401).json({ message: 'Invalid teacher credentials.' });
    }
});


app.post('/api/auth/support-login', async (req, res) => {
    try {
        const { name, code } = req.body;
        const supportUser = await SupportStaff.findOne({ fullName: name, supportCode: code });

        if (!supportUser) {
            return res.status(401).json({ message: 'Invalid support credentials.' });
        }
        
        // Update last login time and set online status
        supportUser.isOnline = true;
        supportUser.lastActivity = new Date();
        await supportUser.save();

        res.status(200).json({ message: 'Support login successful', user: { id: supportUser._id, name: supportUser.fullName, type: 'support' } });
    } catch (error) {
        console.error('Support login error:', error);
        res.status(500).json({ message: 'Server error during support login.' });
    }
});

// Lessons Endpoints
app.post('/api/lessons', async (req, res) => {
    try {
        const lessonData = req.body;
        const newLesson = new Lesson(lessonData);
        await newLesson.save();
        res.status(201).json({ message: 'Lesson saved successfully', lesson: newLesson }); // Returning newLesson including _id
    } catch (error) {
        console.error('Error saving lesson:', error);
        res.status(500).json({ message: 'Error saving lesson to database.' });
    }
});

app.get('/api/lessons', async (req, res) => {
    try {
        const lessons = await Lesson.find({});
        res.status(200).json(lessons);
    } catch (error) {
        console.error('Error fetching lessons:', error);
        res.status(500).json({ message: 'Error fetching lessons from database.' });
    }
});

app.put('/api/lessons/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updatedLesson = await Lesson.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedLesson) {
            return res.status(404).json({ message: 'Lesson not found.' });
        }
        res.status(200).json({ message: 'Lesson updated successfully', lesson: updatedLesson }); // Returning updatedLesson including _id
    } === '0') { // 204 No Content أو لا يوجد محتوى
            return null;
        }

        return await response.json();
        ```

6.  **بعد الانتهاء من هذه العملية:**
    * **احفظ ملف `app.js` على جهازك.**
    * **أعد تشغيل تطبيقك على التابلت/الهاتف بالكامل.**
    * **تأكد أن التطبيق يفتح بشكل طبيعي.**
    * **لا تنتقل إلى العملية التالية قبل التأكد من تطبيق هذه العملية.**

---

### **العملية 1.3: تحديث دوال جلب البيانات (`load...()`) - الجزء الأول (جعلها `async` وتسحب من السيرفر)**

* **الهدف من هذه العملية:** جعل التطبيق يجلب أحدث البيانات من السيرفر (Vercel) عند فتح الصفحات، بدلاً من جلبها فقط من التخزين المحلي. هذا يضمن ظهور أي محتوى جديد يرفع على السيرفر.
* **ما الذي سيحدث:** سيقوم التطبيق بمحاولة الاتصال بالسيرفر أولاً لجلب البيانات. إذا نجح، سيحفظ البيانات في التخزين المحلي. إذا فشل الاتصال، سيعود لاستخدام البيانات المخزنة محلياً.

**تنبيه مهم:** في هذه العمليات، ستحتاج إلى إضافة كلمة `async` قبل اسم الدالة إذا لم تكن موجودة بالفعل.

**1.3.1: دالة `loadPaidLessons()`:**

1.  **اذهب إلى ملف `app.js` على جهازك.**
2.  **ابحث عن الدالة `loadPaidLessons() { ... }`.**
3.  **أمر التعديل (الجزء أ - إضافة `async`):**
    * **شيل السطر الذي يبدأ بتعريف الدالة `loadPaidLessons`:**
        ```javascript
        loadPaidLessons() { // شيل هذا السطر
        ```
    * **وحط مكانه هذا السطر الجديد بالضبط:**
        ```javascript
        async loadPaidLessons() { // حط هذا السطر (تم إضافة async)
        ```
4.  **أمر التعديل (الجزء ب - تحديث الجلب):**
    * **داخل هذه الدالة، ابحث عن السطر الذي يبدأ بـ `const lessons = this.getStoredData('lessons') || [];`.** يجب أن يكون هذا هو السطر الأول بعد الأسطر الخاصة بالتحقق من `currentUser`.
    * **شيل هذا السطر بالكامل:**
        ```javascript
        const lessons = this.getStoredData('lessons') || []; // شيل هذا السطر
        ```
    * **وحط مكانه هذا الكود الجديد بالضبط:**
        ```javascript
        // حط هذا الكود الجديد
        let lessons = [];
        if (this.syncEnabled) { // إذا كان الاتصال بالسيرفر متاحاً
            try {
                lessons = await this.sendRequest('/lessons', 'GET');
                if (lessons) { // تأكد من أن السيرفر أرجع بيانات
                    this.saveStoredData('lessons', lessons); // حفظ في التخزين المحلي
                } else {
                    lessons = this.getStoredData('lessons') || []; // الرجوع للتخزين المحلي إذا لم يرجع السيرفر بيانات
                }
            } catch (e) {
                console.error('Failed to fetch lessons from server, falling back to local:', e);
                lessons = this.getStoredData('lessons') || []; // الرجوع للتخزين المحلي عند فشل الجلب من السيرفر
            }
        } else { // إذا لم يكن الاتصال بالسيرفر متاحاً
            lessons = this.getStoredData('lessons') || []; // جلب من التخزين المحلي فقط
        }
        ```

5.  **بعد الانتهاء من هذه العملية:**
    * **احفظ ملف `app.js` على جهازك.**
    * **أعد تشغيل تطبيقك على التابلت/الهاتف بالكامل.**
    * **تأكد أن التطبيق يفتح بشكل طبيعي.**
    * **لا تنتقل إلى العملية التالية قبل التأكد من تطبيق هذه العملية.**

### **العملية 1.4: تحديث دالة `loadAvailableSubscriptions()`**

1.  **اذهب إلى ملف `app.js` على جهازك.**
2.  **ابحث عن الدالة `loadAvailableSubscriptions() { ... }`.**
3.  **أمر التعديل (الجزء أ - إضافة `async`):**
    * **شيل السطر الذي يبدأ بتعريف الدالة `loadAvailableSubscriptions`:**
        ```javascript
        loadAvailableSubscriptions() { // شيل هذا السطر
        ```
    * **وحط مكانه هذا السطر الجديد بالضبط:**
        ```javascript
        async loadAvailableSubscriptions() { // حط هذا السطر (تم إضافة async)
        ```
4.  **أمر التعديل (الجزء ب - تحديث الجلب):**
    * **داخل هذه الدالة، ابحث عن السطر الذي يبدأ بـ `const subscriptions = this.getStoredData('subscriptions') || [];`.**
    * **شيل هذا السطر بالكامل:**
        ```javascript
        const subscriptions = this.getStoredData('subscriptions') || []; // شيل هذا السطر
        ```
    * **وحط مكانه هذا الكود الجديد بالضبط:**
        ```javascript
        // حط هذا الكود الجديد
        let subscriptions = [];
        if (this.syncEnabled) {
            try {
                subscriptions = await this.sendRequest('/subscriptions', 'GET');
                if (subscriptions) {
                    this.saveStoredData('subscriptions', subscriptions);
                } else {
                    subscriptions = this.getStoredData('subscriptions') || [];
                }
            } catch (e) {
                console.error('Failed to fetch subscriptions from server, falling back to local:', e);
                subscriptions = this.getStoredData('subscriptions') || [];
            }
        } else {
            subscriptions = this.getStoredData('subscriptions') || [];
        }
        ```

5.  **بعد الانتهاء من هذه العملية:**
    * **احفظ ملف `app.js` على جهازك.**
    * **أعد تشغيل تطبيقك على التابلت/الهاتف بالكامل.**
    * **تأكد أن التطبيق يفتح بشكل طبيعي.**
    * **لا تنتقل إلى العملية التالية قبل التأكد من تطبيق هذه العملية.**

---

**ملاحظة هامة:** في الكود الذي أرسلته لي، يوجد جزء مقتطع في نهاية الملف بعد `app.put('/api/lessons/:id', ...)`:

```javascript
} === '0') { // 204 No Content أو لا يوجد محتوى
            return null;
        }

        return await response.json();
        ```

هذا الجزء هو بقايا من كود JavaScript الخاص بالواجهة الأمامية، ولكنه موجود في ملف `server.js`. **يجب إزالته**. هذا الخطأ قد يمنع سيرفرك من العمل بشكل صحيح.

**رجاءً، تأكد من إزالة أي كود غير تابع للسيرفر (مثل الأكواد التي تبدأ بـ `}`) من نهاية ملف `server.js`. يجب أن ينتهي الملف بشكل نظيف بـ `app.listen(...)` فقط.**

```javascript
// ... (بقية أكواد الـ API Endpoints) ...

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
