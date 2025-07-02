require('dotenv').config(); // Load environment variables from .env file

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // For password hashing
// const multer = require('multer'); // تم تعطيل هذا مؤقتاً لتجنب خطأ Module Not Found
// const admin = require('firebase-admin'); // سيتم تفعيله لاحقاً لرفع الملفات إلى Firebase

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // لضمان قراءة البيانات المشفرة في URL

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
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
});
const bucket = admin.storage().bucket();

const upload = multer({ storage: multer.memoryStorage() });

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
        studentNumber: { type: String, unique: true, sparse: true },
        parentNumber: { type: String },
        gradeLevel: { type: String, enum: ['first', 'second', 'third', 'all'], default: 'all' },
        balance: { type: Number, default: 0 },
        points: { type: Number, default: 0 },
        isBanned: { type: Boolean, default: false },
        banReason: { type: String },
        bannedAt: { type: Date },
        bannedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'bannedByType' },
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
        coverImage: { type: String },
        videoFile: { type: String },
        pdfFile: { type: String },
        homeworkFile: { type: String },
        solutionFile: { type: String },
        homeworkSolutionVideo: { type: String },
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
        image: { type: String },
        duration: { type: Number, required: true },
        includedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
        isActive: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now }
    });
    const Subscription = mongoose.model('Subscription', subscriptionSchema);

    // Purchased Lesson/Subscription Schema
    const purchasedItemSchema = new mongoose.Schema({
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
        itemId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'itemType' },
        itemType: { type: String, required: true, enum: ['Lesson', 'Subscription'] },
        purchaseDate: { type: Date, default: Date.now },
        price: { type: Number, required: true },
        expiryDate: { type: Date }
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
        receiptImageKey: { type: String },
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
        password: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    });
    const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);

    // General Message Schema (from Teacher)
    const generalMessageSchema = new mongoose.Schema({
        target: { type: String, enum: ['all', 'first', 'second', 'third'], required: true },
        title: { type: String, required: true },
        content: { type: String, required: true },
        duration: { type: Number, required: true },
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
        imageKey: { type: String },
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
        answers: [Number],
        passed: { type: Boolean, required: true },
        timestamp: { type: Date, default: Date.now }
    });
    const ExamResult = mongoose.model('ExamResult', examResultSchema);

    // Student Message (Question to Teacher) Schema
    const studentMessageSchema = new mongoose.Schema({
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
        studentName: { type: String, required: true },
        lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
        subject: { type: String, required: true },
        text: { type: String, required: true },
        imageKey: { type: String },
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
        relatedId: { type: mongoose.Schema.Types.ObjectId }
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
        rewardId: { type: Number, required: true },
        rewardName: { type: String, required: true },
        cost: { type: Number, required: true },
        timestamp: { type: Date, default: Date.now }
    });
    const RedeemedReward = mongoose.model('RedeemedReward', redeemedRewardSchema);

    // Support Activity Log Schema
    const supportActivityLogSchema = new mongoose.Schema({
        supportId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportStaff', required: true },
        supportName: { type: String, required: true },
        action: { type: String, required: true },
        details: mongoose.Schema.Types.Mixed,
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
            res.status(201).json({ message: 'Student registered successfully', studentId: newStudent._id });
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
                    id: student._id,
                    name: student.fullName, 
                    type: 'student',
                    gradeLevel: student.gradeLevel,
                    studentNumber: student.studentNumber,
                    parentPhone: student.parentNumber,
                    balance: student.balance,
                    points: student.points,
                    isBanned: student.isBanned,
                    banReason: student.banReason,
                    bannedAt: student.bannedAt,
                    createdAt: student.createdAt
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
                    password: await bcrypt.hash('teacher_default_password', 10),
                    type: 'teacher'
                });
                await teacher.save();
            }
            res.status(200).json({ message: 'Teacher login successful', user: { id: teacher._id, name: teacher.fullName, type: 'teacher' } });
        } else {
            return res.status(401).json({ message: 'Invalid teacher credentials.' });
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
            res.status(201).json({ message: 'Lesson saved successfully', lesson: newLesson });
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
            res.status(200).json({ message: 'Lesson updated successfully', lesson: updatedLesson });
        } catch (error) => {
            console.error('Error updating lesson:', error);
            res.status(500).json({ message: 'Error updating lesson in database.' });
        }
    });

    app.delete('/api/lessons/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const deletedLesson = await Lesson.findByIdAndDelete(id);
            if (!deletedLesson) {
                return res.status(404).json({ message: 'Lesson not found.' });
            }
            res.status(204).send();
        } catch (error) => {
            console.error('Error deleting lesson:', error);
            res.status(500).json({ message: 'Error deleting lesson from database.' });
        }
    });

    // Subscriptions Endpoints
    app.post('/api/subscriptions', async (req, res) => {
        try {
            const subscriptionData = req.body;
            const newSubscription = new Subscription(subscriptionData);
            await newSubscription.save();
            res.status(201).json({ message: 'Subscription created successfully', subscription: newSubscription });
        } catch (error) {
            console.error('Error creating subscription:', error);
            res.status(500).json({ message: 'Error creating subscription in database.' });
        }
    });

    app.get('/api/subscriptions', async (req, res) => {
        try {
            const subscriptions = await Subscription.find({});
            res.status(200).json(subscriptions);
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
            res.status(500).json({ message: 'Error fetching subscriptions from database.' });
        }
    });

    app.put('/api/subscriptions/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updatedSubscription = await Subscription.findByIdAndUpdate(id, req.body, { new: true });
            if (!updatedSubscription) {
                return res.status(404).json({ message: 'Subscription not found.' });
            }
            res.status(200).json({ message: 'Subscription updated successfully', subscription: updatedSubscription });
        } catch (error) {
            console.error('Error updating subscription:', error);
            res.status(500).json({ message: 'Error updating subscription in database.' });
        }
    });

    app.delete('/api/subscriptions/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const deletedSubscription = await Subscription.findByIdAndDelete(id);
            if (!deletedSubscription) {
                return res.status(404).json({ message: 'Subscription not found.' });
            }
            res.status(204).send();
        } catch (error) {
            console.error('Error deleting subscription:', error);
            res.status(500).json({ message: 'Error deleting subscription from database.' });
        }
    });


    // General Messages Endpoints
    app.post('/api/general-messages', async (req, res) => {
        try {
            const messageData = req.body;
            const newGeneralMessage = new GeneralMessage(messageData);
            await newGeneralMessage.save();
            res.status(201).json({ message: 'General message sent successfully', generalMessage: newGeneralMessage });
        } catch (error) {
            console.error('Error sending general message:', error);
            res.status(500).json({ message: 'Error sending general message to database.' });
        }
    });

    app.get('/api/general-messages', async (req, res) => {
        try {
            const generalMessages = await GeneralMessage.find({});
            res.status(200).json(generalMessages);
        } catch (error) {
            console.error('Error fetching general messages:', error);
            res.status(500).json({ message: 'Error fetching general messages from database.' });
        }
    });

    app.delete('/api/general-messages/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const deletedMessage = await GeneralMessage.findByIdAndDelete(id);
            if (!deletedMessage) {
                return res.status(404).json({ message: 'General message not found.' });
            }
            res.status(204).send();
        } catch (error) {
            console.error('Error deleting general message:', error);
            res.status(500).json({ message: 'Error deleting general message from database.' });
        }
    });

    // Books Endpoints
    app.post('/api/books', async (req, res) => {
        try {
            const bookData = req.body;
            const newBook = new Book(bookData);
            await newBook.save();
            res.status(201).json({ message: 'Book added successfully', book: newBook });
        } catch (error) {
            console.error('Error adding book:', error);
            res.status(500).json({ message: 'Error adding book to database.' });
        }
    });

    app.get('/api/books', async (req, res) => {
        try {
            const books = await Book.find({});
            res.status(200).json(books);
        } catch (error) {
            console.error('Error fetching books:', error);
            res.status(500).json({ message: 'Error fetching books from database.' });
        }
    });

    app.put('/api/books/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const updatedBook = await Book.findByIdAndUpdate(id, req.body, { new: true });
            if (!updatedBook) {
                return res.status(404).json({ message: 'Book not found.' });
            }
            res.status(200).json({ message: 'Book updated successfully', book: updatedBook });
        } catch (error) {
            console.error('Error updating book:', error);
            res.status(500).json({ message: 'Error updating book in database.' });
        }
    });

    app.delete('/api/books/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const deletedBook = await Book.findByIdAndDelete(id);
            if (!deletedBook) {
                return res.status(404).json({ message: 'Book not found.' });
            }
            res.status(204).send();
        } catch (error) {
            console.error('Error deleting book:', error);
            res.status(500).json({ message: 'Error deleting book from database.' });
        }
    });

    // Payment Methods Endpoints
    app.post('/api/payment-methods', async (req, res) => {
        try {
            const { name, number, password } = req.body;
            const hashedPassword = await bcrypt.hash(password, 10);
            const newMethod = new PaymentMethod({ name, number, password: hashedPassword });
            await newMethod.save();
            res.status(201).json({ message: 'Payment method added successfully', method: newMethod });
        } catch (error) {
            console.error('Error adding payment method:', error);
            res.status(500).json({ message: 'Error adding payment method to database.' });
        }
    });

    app.get('/api/payment-methods', async (req, res) => {
        try {
            const methods = await PaymentMethod.find({}, { password: 0 });
            res.status(200).json(methods);
        } catch (error) {
            console.error('Error fetching payment methods:', error);
            res.status(500).json({ message: 'Error fetching payment methods from database.' });
        }
    });

    app.delete('/api/payment-methods/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { password } = req.body;

            const method = await PaymentMethod.findById(id);
            if (!method) {
                return res.status(404).json({ message: 'Payment method not found.' });
            }

            const isMatch = await bcrypt.compare(password, method.password);
            if (!isMatch) {
                return res.status(401).json({ message: 'Incorrect control password.' });
            }

            await PaymentMethod.findByIdAndDelete(id);
            res.status(204).send();
        } catch (error) {
            console.error('Error deleting payment method:', error);
            res.status(500).json({ message: 'Error deleting payment method from database.' });
        }
    });


    // Start the server
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
