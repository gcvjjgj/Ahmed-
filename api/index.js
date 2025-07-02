require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Firebase Initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});

const bucket = admin.storage().bucket();

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Schemas
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'teacher', 'support'], required: true },
  createdAt: { type: Date, default: Date.now },
  deviceToken: String // For push notifications
});

const studentSchema = new mongoose.Schema({
  studentNumber: { type: String, unique: true },
  parentNumber: String,
  gradeLevel: { type: String, enum: ['first', 'second', 'third'] },
  balance: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  isBanned: { type: Boolean, default: false },
  banReason: String,
  purchasedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
  purchasedSubscriptions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' }],
  purchasedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
  examResults: [{
    lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
    score: Number,
    attempts: Number,
    passed: Boolean,
    timestamp: Date
  }]
});

const teacherSchema = new mongoose.Schema({
  teacherCode: { type: String, unique: true, default: 'HHDV/58HR' },
  phoneNumber: { type: String, default: '01050747978' }
});

const supportSchema = new mongoose.Schema({
  supportCode: { type: String, unique: true },
  isOnline: { type: Boolean, default: false },
  lastActive: Date
});

// Lesson Schema
const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  grade: { type: String, enum: ['first', 'second', 'third'], required: true },
  videoPath: String,
  thumbnailPath: String,
  pdfPath: String,
  homeworkPath: String,
  solutionPath: String,
  questions: [{
    questionText: String,
    options: [String],
    correctAnswer: Number
  }],
  nextLesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
  createdAt: { type: Date, default: Date.now }
});

// Subscription Schema
const subscriptionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  grade: { type: String, enum: ['first', 'second', 'third'], required: true },
  lessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
  thumbnailPath: String,
  createdAt: { type: Date, default: Date.now }
});

// Book Schema
const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  price: { type: Number, required: true },
  imagePath: String,
  contactNumber: String,
  offices: [{
    name: String,
    address: String
  }],
  createdAt: { type: Date, default: Date.now }
});

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  paymentMethod: String,
  transactionId: String,
  screenshotPath: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reason: String,
  createdAt: { type: Date, default: Date.now }
});

// Message Schema
const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: String,
  imagePath: String,
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Notification Schema
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: String,
  message: String,
  isRead: { type: Boolean, default: false },
  link: String,
  createdAt: { type: Date, default: Date.now }
});

// Setting Schema
const settingSchema = new mongoose.Schema({
  backgroundImage: String,
  paymentMethods: [{
    name: String,
    number: String
  }],
  supportHours: String,
  contactNumber: String
});

// Models
const User = mongoose.model('User', userSchema);
const Student = User.discriminator('Student', studentSchema);
const Teacher = User.discriminator('Teacher', teacherSchema);
const Support = User.discriminator('Support', supportSchema);
const Lesson = mongoose.model('Lesson', lessonSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);
const Book = mongoose.model('Book', bookSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Message = mongoose.model('Message', messageSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Setting = mongoose.model('Setting', settingSchema);

// JWT Authentication
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.SECRET_KEY,
    { expiresIn: '7d' }
  );
};

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'المصادقة مطلوبة' });

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'رمز غير صالح' });
  }
};

// Role Middleware
const roleMiddleware = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'غير مصرح بالوصول' });
    }
    next();
  };
};

// Upload File to Firebase
const uploadFile = async (file, folder) => {
  try {
    const fileName = `${folder}/${uuidv4()}_${file.originalname}`;
    const fileUpload = bucket.file(fileName);
    
    await fileUpload.save(file.buffer, {
      metadata: { contentType: file.mimetype }
    });
    
    await fileUpload.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  } catch (error) {
    throw new Error('حدث خطأ أثناء رفع الملف');
  }
};

// Generate Signed URL
const generateSignedUrl = async (filePath, action = 'read') => {
  const options = {
    action,
    expires: Date.now() + 60 * 60 * 1000, // 1 hour
    contentType: action === 'write' ? 'video/mp4' : undefined
  };

  const [url] = await bucket.file(filePath).getSignedUrl(options);
  return url;
};

// 1. Student Registration
app.post('/api/auth/register/student', async (req, res) => {
  try {
    const { fullName, studentNumber, parentNumber, password, gradeLevel } = req.body;
    
    const existingUser = await Student.findOne({ 
      $or: [{ studentNumber }, { fullName }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ message: 'الطالب مسجل بالفعل' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newStudent = new Student({
      fullName,
      studentNumber,
      parentNumber,
      password: hashedPassword,
      gradeLevel,
      role: 'student'
    });

    await newStudent.save();
    const token = generateToken(newStudent);
    
    res.status(201).json({ 
      message: 'تم تسجيل الطالب بنجاح',
      token,
      user: {
        id: newStudent._id,
        fullName: newStudent.fullName,
        role: newStudent.role,
        balance: newStudent.balance,
        gradeLevel: newStudent.gradeLevel
      }
    });
  } catch (error) {
    console.error('خطأ تسجيل الطالب:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// 2. Student Login
app.post('/api/auth/login/student', async (req, res) => {
  try {
    const { fullName, password } = req.body;
    
    const student = await Student.findOne({ fullName });
    if (!student) {
      return res.status(400).json({ message: 'الطالب غير موجود' });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'كلمة المرور غير صحيحة' });
    }

    if (student.isBanned) {
      return res.status(403).json({ 
        message: 'حسابك محظور', 
        banReason: student.banReason 
      });
    }

    const token = generateToken(student);
    
    res.json({ 
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: student._id,
        fullName: student.fullName,
        role: student.role,
        balance: student.balance,
        gradeLevel: student.gradeLevel,
        points: student.points
      }
    });
  } catch (error) {
    console.error('خطأ تسجيل دخول الطالب:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// 3. Teacher Login
app.post('/api/auth/login/teacher', async (req, res) => {
  try {
    const { fullName, teacherCode, phoneNumber } = req.body;
    
    if (fullName !== 'Mahmoud only' || 
        teacherCode !== 'HHDV/58HR' || 
        phoneNumber !== '01050747978') {
      return res.status(401).json({ message: 'بيانات اعتماد المعلم غير صالحة' });
    }

    let teacher = await Teacher.findOne({ teacherCode });
    if (!teacher) {
      const hashedPassword = await bcrypt.hash('defaultPassword', 10);
      teacher = new Teacher({
        fullName,
        teacherCode,
        phoneNumber,
        password: hashedPassword,
        role: 'teacher'
      });
      await teacher.save();
    }

    const token = generateToken(teacher);
    
    res.json({ 
      message: 'تم تسجيل دخول المعلم بنجاح',
      token,
      user: {
        id: teacher._id,
        fullName: teacher.fullName,
        role: teacher.role
      }
    });
  } catch (error) {
    console.error('خطأ تسجيل دخول المعلم:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// 4. Support Login
app.post('/api/auth/login/support', async (req, res) => {
  try {
    const { fullName, supportCode, password } = req.body;
    
    const support = await Support.findOne({ fullName, supportCode });
    if (!support) {
      return res.status(400).json({ message: 'موظف الدعم غير موجود' });
    }

    const isMatch = await bcrypt.compare(password, support.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'كلمة المرور غير صحيحة' });
    }

    support.isOnline = true;
    support.lastActive = new Date();
    await support.save();

    const token = generateToken(support);
    
    res.json({ 
      message: 'تم تسجيل دخول الدعم الفني بنجاح',
      token,
      user: {
        id: support._id,
        fullName: support.fullName,
        role: support.role
      }
    });
  } catch (error) {
    console.error('خطأ تسجيل دخول الدعم:', error);
    res.status(500).json({ message: 'خطأ في الخادم' });
  }
});

// 5. Generate Upload URL
app.post('/api/upload-url', 
  authMiddleware, 
  roleMiddleware(['teacher']),
  async (req, res) => {
    try {
      const { fileName, fileType } = req.body;
      const folder = fileType === 'video' ? 'videos' : 
                   fileType === 'pdf' ? 'pdfs' : 
                   fileType === 'image' ? 'images' : 'others';
      
      const filePath = `${folder}/${uuidv4()}_${fileName}`;
      const uploadUrl = await generateSignedUrl(filePath, 'write');
      
      res.json({ uploadUrl, filePath });
    } catch (error) {
      console.error('خطأ إنشاء رابط التحميل:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 6. Create Lesson
app.post('/api/lessons', 
  authMiddleware, 
  roleMiddleware(['teacher']),
  async (req, res) => {
    try {
      const { 
        title, 
        description, 
        price, 
        grade, 
        videoPath,
        thumbnailPath,
        pdfPath,
        homeworkPath,
        solutionPath,
        questions,
        nextLesson
      } = req.body;
      
      const newLesson = new Lesson({
        title,
        description,
        price,
        grade,
        videoPath,
        thumbnailPath,
        pdfPath,
        homeworkPath,
        solutionPath,
        questions,
        nextLesson
      });

      await newLesson.save();
      res.status(201).json({ message: 'تم إنشاء الدرس', lesson: newLesson });
    } catch (error) {
      console.error('خطأ إنشاء الدرس:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 7. Purchase Lesson
app.post('/api/lessons/purchase/:lessonId', 
  authMiddleware, 
  roleMiddleware(['student']),
  async (req, res) => {
    try {
      const { lessonId } = req.params;
      const student = await Student.findById(req.user.id);
      const lesson = await Lesson.findById(lessonId);
      
      if (!lesson) {
        return res.status(404).json({ message: 'الدرس غير موجود' });
      }
      
      if (student.purchasedLessons.includes(lessonId)) {
        return res.status(400).json({ message: 'لقد قمت بشراء هذا الدرس بالفعل' });
      }
      
      if (student.balance < lesson.price) {
        return res.status(400).json({ message: 'رصيد غير كافي' });
      }
      
      student.balance -= lesson.price;
      student.purchasedLessons.push(lessonId);
      await student.save();
      
      // Create notification
      const notification = new Notification({
        user: student._id,
        title: 'شراء درس جديد',
        message: `لقد اشتريت الدرس: ${lesson.title}`
      });
      await notification.save();
      
      res.json({ 
        message: 'تم شراء الدرس بنجاح',
        newBalance: student.balance
      });
    } catch (error) {
      console.error('خطأ شراء الدرس:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 8. Submit Exam
app.post('/api/exams/submit/:lessonId', 
  authMiddleware, 
  roleMiddleware(['student']),
  async (req, res) => {
    try {
      const { lessonId } = req.params;
      const { answers } = req.body;
      
      const student = await Student.findById(req.user.id);
      const lesson = await Lesson.findById(lessonId);
      
      if (!lesson) {
        return res.status(404).json({ message: 'الدرس غير موجود' });
      }
      
      if (!student.purchasedLessons.includes(lessonId)) {
        return res.status(403).json({ message: 'يجب شراء الدرس أولاً' });
      }
      
      // Check if student already passed
      const existingResult = student.examResults.find(
        r => r.lesson.toString() === lessonId
      );
      
      if (existingResult && existingResult.passed) {
        return res.status(400).json({ message: 'لقد اجتزت هذا الاختبار بالفعل' });
      }
      
      // Calculate score
      let score = 0;
      lesson.questions.forEach((question, index) => {
        if (answers[index] === question.correctAnswer) {
          score++;
        }
      });
      
      const percentage = (score / lesson.questions.length) * 100;
      const passed = percentage >= 50;
      const attempts = existingResult ? existingResult.attempts + 1 : 1;
      
      // Update exam result
      if (existingResult) {
        existingResult.score = percentage;
        existingResult.attempts = attempts;
        existingResult.passed = passed;
        existingResult.timestamp = new Date();
      } else {
        student.examResults.push({
          lesson: lessonId,
          score: percentage,
          attempts,
          passed,
          timestamp: new Date()
        });
      }
      
      // Add points if passed
      if (passed) {
        student.points += 10;
        
        // Unlock next lesson if exists
        if (lesson.nextLesson) {
          student.purchasedLessons.push(lesson.nextLesson);
          
          const nextLesson = await Lesson.findById(lesson.nextLesson);
          const notification = new Notification({
            user: student._id,
            title: 'درس جديد متاح',
            message: `تم فتح الدرس التالي: ${nextLesson.title}`
          });
          await notification.save();
        }
      }
      
      await student.save();
      
      res.json({
        passed,
        score: percentage,
        attempts,
        points: student.points
      });
    } catch (error) {
      console.error('خطأ تقديم الاختبار:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 9. Wallet Top-up Request
app.post('/api/wallet/topup', 
  authMiddleware, 
  roleMiddleware(['student']),
  async (req, res) => {
    try {
      const { amount, paymentMethod, transactionId, screenshot } = req.body;
      const student = await Student.findById(req.user.id);
      
      // Upload screenshot
      let screenshotPath = '';
      if (screenshot) {
        const fileBuffer = Buffer.from(screenshot, 'base64');
        screenshotPath = await uploadFile({
          buffer: fileBuffer,
          originalname: 'transaction.jpg',
          mimetype: 'image/jpeg'
        }, 'transactions');
      }
      
      // Create transaction
      const transaction = new Transaction({
        student: student._id,
        amount,
        paymentMethod,
        transactionId,
        screenshotPath
      });
      
      await transaction.save();
      
      // Create notification
      const notification = new Notification({
        user: student._id,
        title: 'طلب شحن محفظة',
        message: `تم تقديم طلب شحن بقيمة ${amount} جنيهاً`
      });
      await notification.save();
      
      res.json({ 
        message: 'تم تقديم طلب الشحن بنجاح',
        transaction
      });
    } catch (error) {
      console.error('خطأ شحن المحفظة:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 10. Support: Confirm Payment
app.put('/api/transactions/:id/confirm', 
  authMiddleware, 
  roleMiddleware(['support']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const transaction = await Transaction.findById(id)
        .populate('student');
      
      if (!transaction) {
        return res.status(404).json({ message: 'المعاملة غير موجودة' });
      }
      
      if (transaction.status !== 'pending') {
        return res.status(400).json({ message: 'تمت معالجة المعاملة بالفعل' });
      }
      
      transaction.status = 'approved';
      transaction.student.balance += transaction.amount;
      
      await transaction.save();
      await transaction.student.save();
      
      // Create notification
      const notification = new Notification({
        user: transaction.student._id,
        title: 'تم تأكيد الشحن',
        message: `تم شحن محفظتك بمبلغ ${transaction.amount} جنيهاً`
      });
      await notification.save();
      
      res.json({ 
        message: 'تم تأكيد الشحن بنجاح',
        transaction
      });
    } catch (error) {
      console.error('خطأ تأكيد الشحن:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 11. Support: Ban Student
app.put('/api/students/:id/ban', 
  authMiddleware, 
  roleMiddleware(['support', 'teacher']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      
      const student = await Student.findById(id);
      if (!student) {
        return res.status(404).json({ message: 'الطالب غير موجود' });
      }
      
      if (student.isBanned) {
        return res.status(400).json({ message: 'الطالب محظور بالفعل' });
      }
      
      student.isBanned = true;
      student.banReason = reason;
      await student.save();
      
      // Create notification
      const notification = new Notification({
        user: student._id,
        title: 'تم حظر حسابك',
        message: `تم حظر حسابك للأسباب التالية: ${reason}`
      });
      await notification.save();
      
      res.json({ message: 'تم حظر الطالب بنجاح' });
    } catch (error) {
      console.error('خطأ حظر الطالب:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 12. Teacher: Create Subscription
app.post('/api/subscriptions', 
  authMiddleware, 
  roleMiddleware(['teacher']),
  async (req, res) => {
    try {
      const { 
        title, 
        description, 
        price, 
        grade, 
        lessons,
        thumbnailPath
      } = req.body;
      
      const newSubscription = new Subscription({
        title,
        description,
        price,
        grade,
        lessons,
        thumbnailPath
      });

      await newSubscription.save();
      res.status(201).json({ 
        message: 'تم إنشاء الاشتراك',
        subscription: newSubscription 
      });
    } catch (error) {
      console.error('خطأ إنشاء الاشتراك:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 13. Change Background (Teacher)
app.put('/api/settings/background', 
  authMiddleware, 
  roleMiddleware(['teacher']),
  async (req, res) => {
    try {
      const { image } = req.body;
      
      // Upload image
      let imagePath = '';
      if (image) {
        const fileBuffer = Buffer.from(image, 'base64');
        imagePath = await uploadFile({
          buffer: fileBuffer,
          originalname: 'background.jpg',
          mimetype: 'image/jpeg'
        }, 'backgrounds');
      }
      
      // Update settings
      let settings = await Setting.findOne({});
      if (!settings) {
        settings = new Setting({ backgroundImage: imagePath });
      } else {
        settings.backgroundImage = imagePath;
      }
      
      await settings.save();
      
      res.json({ 
        message: 'تم تحديث الخلفية بنجاح',
        backgroundImage: settings.backgroundImage
      });
    } catch (error) {
      console.error('خطأ تحديث الخلفية:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 14. Student-Support Chat
app.post('/api/messages', 
  authMiddleware, 
  async (req, res) => {
    try {
      const { receiverId, text, image } = req.body;
      const senderId = req.user.id;
      
      let imagePath = '';
      if (image) {
        const fileBuffer = Buffer.from(image, 'base64');
        imagePath = await uploadFile({
          buffer: fileBuffer,
          originalname: 'message.jpg',
          mimetype: 'image/jpeg'
        }, 'messages');
      }
      
      const message = new Message({
        sender: senderId,
        receiver: receiverId,
        text,
        imagePath
      });
      
      await message.save();
      
      // Create notification
      const notification = new Notification({
        user: receiverId,
        title: 'رسالة جديدة',
        message: text || 'صورة مرفقة',
        link: `/messages/${senderId}`
      });
      await notification.save();
      
      res.status(201).json(message);
    } catch (error) {
      console.error('خطأ إرسال الرسالة:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 15. Get Messages
app.get('/api/messages/:userId', 
  authMiddleware, 
  async (req, res) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.user.id;
      
      const messages = await Message.find({
        $or: [
          { sender: currentUserId, receiver: userId },
          { sender: userId, receiver: currentUserId }
        ]
      }).sort('createdAt');
      
      // Mark messages as read
      await Message.updateMany(
        { receiver: currentUserId, sender: userId, isRead: false },
        { $set: { isRead: true } }
      );
      
      res.json(messages);
    } catch (error) {
      console.error('خطأ جلب الرسائل:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 16. Get Notifications
app.get('/api/notifications', 
  authMiddleware, 
  async (req, res) => {
    try {
      const notifications = await Notification.find({
        user: req.user.id
      }).sort('-createdAt');
      
      res.json(notifications);
    } catch (error) {
      console.error('خطأ جلب الإشعارات:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// 17. Mark Notification as Read
app.put('/api/notifications/:id/read', 
  authMiddleware, 
  async (req, res) => {
    try {
      const { id } = req.params;
      const notification = await Notification.findById(id);
      
      if (!notification) {
        return res.status(404).json({ message: 'الإشعار غير موجود' });
      }
      
      if (notification.user.toString() !== req.user.id) {
        return res.status(403).json({ message: 'غير مصرح' });
      }
      
      notification.isRead = true;
      await notification.save();
      
      res.json({ message: 'تم تحديث الإشعار' });
    } catch (error) {
      console.error('خطأ تحديث الإشعار:', error);
      res.status(500).json({ message: 'خطأ في الخادم' });
    }
  }
);

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
